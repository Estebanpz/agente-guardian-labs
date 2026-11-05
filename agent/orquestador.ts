import { appendFileSync } from "node:fs";
import { z } from "zod";
import { EntradaEvaluar } from "./tools/esquemas.js";
import { evaluar } from "./tools/motor.js";
import { redactar } from "./llm/redactor.js";
import { interpretar, porRegex, rutaRapida, type Interpretacion } from "./llm/interprete.js";
import { esIntentoDeElusion } from "./llm/guardia.js";
import { datosProhibidos, enmascararCarnes } from "./tools/privacidad.js";
import { AYUDA_GENERAL, TEXTO_RESERVA, estadoSalas, responderTemas, temasDe } from "./tools/ayuda.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";
import { salas } from "../data/salas.js";
import { crearRepositorio, type Repositorio } from "./store/repositorio.js";
import { continuar, iniciar, reanudar, type RespuestaChat } from "./conversacion.js";

// Ingreso (vista Laboratorios): las tres salas de la evaluación (las reservas usan sala-1 a sala-16).
type SalaId = "sala-1" | "sala-2" | "sala-3";
const SALAS_INGRESO: string[] = ["sala-1", "sala-2", "sala-3"];

const LOG = new URL("../logs/evaluaciones.jsonl", import.meta.url);
// Los carnés se enmascaran antes de escribir: nunca quedan completos en logs/.
const registrar = (r: object) =>
  appendFileSync(LOG, enmascararCarnes(JSON.stringify({ ts: new Date().toISOString(), ...r })) + "\n");

const ALERTA_ELUSION = "Intento de eludir las reglas registrado. Las reglas no cambian; notificar a coordinación.";

type Clasificador = (texto: string) => Promise<Interpretacion & { fallo?: string }>;

// Inyección para pruebas: repositorio y clasificador de mentira (sección 7.4).
let inyeccion: { repo?: Repositorio; interpretar?: Clasificador } = {};
export function configurarParaPruebas(opciones: { repo?: Repositorio; interpretar?: Clasificador }): void {
  inyeccion = opciones;
}
const repoActual = async (): Promise<Repositorio> => inyeccion.repo ?? crearRepositorio();
const clasificar: Clasificador = (texto) => (inyeccion.interpretar ?? interpretar)(texto);

export async function solicitar(datos: unknown, alerta?: string) {
  // Validar contra el esquema.
  const entrada = EntradaEvaluar.parse(datos);

  // Si el id no existe, no se inventa nada.
  const hechos = casos[entrada.id_sintetico];
  if (!hechos) {
    return {
      decision: null,
      explicacion: `Identificador ${entrada.id_sintetico} no encontrado en la base. Escalar al monitor.`,
    };
  }

  // El motor decide (determinista), solo con equipos de la sala pedida.
  const decision = evaluar(hechos, entrada, equipos.filter((q) => q.sala === entrada.laboratorio));

  // El modelo solo redacta; si falla, la decisión no se pierde.
  let explicacion: string;
  try {
    explicacion = await redactar(decision);
  } catch (e) {
    console.error("[llm]", (e as Error).message);
    explicacion = "Modelo no disponible; consulte la traza.";
  }

  registrar({ entrada, decision, explicacion, alerta });
  return { decision, explicacion, alerta };
}

// Intención de reserva, disponibilidad o registro → flujo de conversación.
async function flujoPara(intencion: string, texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  if (intencion === "solicitud_reserva") return iniciar("reserva", texto, sesion, repo);
  if (intencion === "consulta_disponibilidad") return iniciar("disponibilidad", texto, sesion, repo);
  if (intencion === "registro_usuario") return iniciar("registro", texto, sesion, repo);
  return null;
}

// Texto libre del monitor o del usuario. `contexto` = sala de la interfaz y sesión del navegador.
export async function mensaje(
  texto: string,
  contexto: { laboratorio?: SalaId; franja?: string; sesion?: string } = {},
) {
  // Paso 1: datos prohibidos. No se llama al modelo ni se guarda el texto.
  const prohibidos = datosProhibidos(texto);
  if (prohibidos.length) {
    registrar({ intencion: "datos_prohibidos", tipos: prohibidos });
    return {
      intencion: "datos_prohibidos",
      respuesta: `El mensaje contiene datos personales (${prohibidos.join(", ")}). Use solo el identificador sintético (por ejemplo E-001).`,
    };
  }

  const sesion = contexto.sesion && z.uuid().safeParse(contexto.sesion).success ? contexto.sesion : undefined;
  const repo = await repoActual();
  const eludir = esIntentoDeElusion(texto);
  const resumen = texto.slice(0, 200);

  // Paso 2: flujo abierto. La guardia corre antes: con elusión, la alerta y la pregunta, sin cambiar datos.
  if (sesion) {
    if (eludir) {
      const r = await reanudar(sesion, repo, ALERTA_ELUSION);
      if (r) {
        registrar({ texto: resumen, intencion: "intento_eludir_reglas", respuesta: r.respuesta });
        return { ...r, alerta: ALERTA_ELUSION };
      }
    } else {
      const r = await continuar(texto, sesion, repo);
      if (r) {
        registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
        return r;
      }
    }
  }

  // Paso 3: rutas rápidas, antes del modelo.
  const ruta = rutaRapida(texto);
  if (ruta && sesion && !eludir) {
    const r = await flujoPara(ruta, texto, sesion, repo);
    if (r) {
      registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
      return r;
    }
  }

  // Paso 4: el modelo interpreta y propone datos candidatos.
  const c = await clasificar(texto);

  // El modelo no respondió (apagado, sin red o límite de uso): se informa, no se supone nada.
  if (c.fallo && !temasDe(texto).length) {
    const respuesta =
      "No pude interpretar el mensaje porque el modelo no respondió. Intente de nuevo, o use la vista Laboratorios, que evalúa con las reglas sin depender del modelo.";
    registrar({ texto: resumen, intencion: "error_modelo", respuesta });
    return { intencion: "error_modelo", respuesta };
  }

  if (sesion && (c.intencion === "solicitud_reserva" || c.intencion === "consulta_disponibilidad" || c.intencion === "registro_usuario")) {
    const r = await flujoPara(c.intencion, texto, sesion, repo);
    if (r) {
      registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
      return r;
    }
  }

  // Preguntas informativas: respuestas armadas con los datos y las reglas, sin modelo.
  // Si el mensaje trae varias preguntas, se responde cada tema detectado.
  const temas = temasDe(texto);
  // Si el modelo dijo "fuera de alcance" pero el texto pregunta por el ID, las franjas, las reglas
  // o el agente mismo, se responde igual (pasa con preguntas de seguimiento sin contexto).
  const rescatables = temas.filter((t) => t !== "salas" && t !== "reserva");
  const reservaOTiempo = c.intencion === "solicitud_reserva" || c.intencion === "consulta_disponibilidad" || c.intencion === "registro_usuario";
  const informativa = c.intencion === "ayuda" || c.intencion === "consulta_salas" || reservaOTiempo;
  if (informativa || (c.intencion === "fuera_de_alcance" && rescatables.length)) {
    const intencion = informativa ? c.intencion : "ayuda";
    const lista = informativa ? temas : rescatables;
    let respuesta: string;
    if (lista.length) respuesta = responderTemas(lista, texto);
    else if (c.intencion === "consulta_salas") respuesta = estadoSalas(texto);
    else if (reservaOTiempo) respuesta = TEXTO_RESERVA;
    else respuesta = AYUDA_GENERAL;
    registrar({ texto: resumen, intencion, temas: lista, respuesta });
    return { intencion, temas: lista, respuesta };
  }

  if (c.intencion === "fuera_de_alcance") {
    const respuesta =
      "Esa consulta está fuera de mi alcance. Solo oriento sobre ingreso, uso de equipos y asistencia en los laboratorios de sistemas.";
    registrar({ texto: resumen, intencion: c.intencion, respuesta });
    return { intencion: c.intencion, respuesta };
  }

  const alerta = c.intencion === "intento_eludir_reglas" ? ALERTA_ELUSION : undefined;

  // Paso 5 (ingreso): validar candidatos contra el texto. Lo que el modelo no pueda respaldar se descarta.
  const rx = porRegex(texto);
  const idModelo = c.id_sintetico?.toUpperCase() ?? null;
  const id = idModelo !== null && idModelo === rx.id_sintetico ? idModelo : rx.id_sintetico;
  const labModelo = c.laboratorio;
  const laboratorio =
    (labModelo !== null && labModelo === rx.laboratorio ? labModelo : rx.laboratorio) ??
    contexto.laboratorio ?? null;
  const tipo_evento = c.tipo_evento ?? "ingreso";
  const validacion = {
    id_modelo: idModelo, id_texto: rx.id_sintetico,
    laboratorio_modelo: labModelo, laboratorio_texto: rx.laboratorio,
    laboratorio_contexto: contexto.laboratorio ?? null,
  };

  // Aclaraciones: no se supone lo que falta.
  const aclarar = (respuesta: string) => {
    registrar({ texto: resumen, intencion: c.intencion, respuesta, validacion });
    return { intencion: c.intencion, aclaracion: true, respuesta, alerta, validacion };
  };
  if (!id) {
    return aclarar(alerta
      ? "No puedo cambiar ni ignorar las reglas. " + alerta
      : "Necesito el identificador de la persona (por ejemplo E-001) para evaluar la solicitud.");
  }
  if (!laboratorio) return aclarar("¿En qué sala? Indique sala-1, sala-2 o sala-3.");
  if (!SALAS_INGRESO.includes(laboratorio)) {
    return aclarar("La evaluación de ingreso aplica a sala-1, sala-2 o sala-3. Para reservas use el chat de reservas.");
  }
  const sala = laboratorio as SalaId;
  const franja = contexto.franja ?? salas.find((s) => s.id === sala)?.franja ?? null;
  if (!franja) return aclarar(`La ${sala} no tiene franja activa. Indique la franja (HH:MM–HH:MM).`);

  const r = await solicitar({ id_sintetico: id, laboratorio: sala, franja, tipo_evento }, alerta);
  return { intencion: c.intencion, validacion, ...r };
}
