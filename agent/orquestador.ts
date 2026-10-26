import { appendFileSync } from "node:fs";
import { EntradaEvaluar } from "./tools/esquemas.js";
import { evaluar } from "./tools/motor.js";
import { redactar } from "./llm/redactor.js";
import { interpretar, porRegex } from "./llm/interprete.js";
import { datosProhibidos } from "./tools/privacidad.js";
import { resumenSalas } from "./tools/salas.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";
import { salas } from "../data/salas.js";

type SalaId = "sala-1" | "sala-2" | "sala-3";

const LOG = new URL("../logs/evaluaciones.jsonl", import.meta.url);
const registrar = (r: object) =>
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...r }) + "\n");

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

// Texto libre del monitor. `contexto` = sala seleccionada en la interfaz.
export async function mensaje(texto: string, contexto: { laboratorio?: SalaId; franja?: string } = {}) {
  // Paso 2: datos prohibidos. No se llama al modelo ni se guarda el texto.
  const prohibidos = datosProhibidos(texto);
  if (prohibidos.length) {
    registrar({ intencion: "datos_prohibidos", tipos: prohibidos });
    return {
      intencion: "datos_prohibidos",
      respuesta: `El mensaje contiene datos personales (${prohibidos.join(", ")}). Use solo el identificador sintético (por ejemplo E-001).`,
    };
  }

  // Paso 3: el modelo interpreta y propone datos candidatos.
  const c = await interpretar(texto);
  const resumen = texto.slice(0, 200);

  if (c.intencion === "fuera_de_alcance") {
    const respuesta =
      "Esa consulta está fuera de mi alcance. Solo oriento sobre ingreso, uso de equipos y asistencia en los laboratorios de sistemas.";
    registrar({ texto: resumen, intencion: c.intencion, respuesta });
    return { intencion: c.intencion, respuesta };
  }

  // Ayuda: texto fijo, sin modelo.
  if (c.intencion === "ayuda") {
    const respuesta = [
      "Soy el asistente del monitor de los laboratorios de sistemas. Puedo:",
      "• Evaluar si una persona puede ingresar (escriba su id, por ejemplo E-001, y la sala).",
      "• Registrar la salida o la asistencia al cierre de la franja.",
      "• Informar el estado de las salas: aforo, franjas y equipos.",
      "Yo recomiendo con base en las reglas R1–R13; la decisión final siempre es suya.",
    ].join("\n");
    registrar({ texto: resumen, intencion: c.intencion, respuesta });
    return { intencion: c.intencion, respuesta };
  }

  // Estado de salas: se arma con los datos, el modelo no inventa cupos ni franjas.
  if (c.intencion === "consulta_salas") {
    const lab = porRegex(texto).laboratorio;
    const salasR = resumenSalas().filter((s) => !lab || s.id === lab);
    const lineas = salasR.map((s) => {
      const revisar = s.equipos
        .filter((q) => q.estado === "conflicto" || q.estado === "desconocido")
        .map((q) => `${q.id} (${q.estado})`);
      return (
        `• ${s.nombre}: ${s.franja ? `franja ${s.franja}` : "sin franja activa"} · aforo ${s.aforo_actual}/${s.capacidad}` +
        `${s.lleno ? " (llena)" : ""} · ${s.disponibles} de ${s.equipos.length} equipos disponibles` +
        (revisar.length ? ` · revisar: ${revisar.join(", ")}` : "")
      );
    });
    const conCupo = salasR.filter((s) => s.franja && !s.lleno).map((s) => s.nombre);
    const respuesta = [
      "Estado actual de las salas:",
      ...lineas,
      conCupo.length ? `Con cupo en este momento: ${conCupo.join(", ")}.` : "Ninguna sala con franja activa tiene cupo ahora.",
    ].join("\n");
    registrar({ texto: resumen, intencion: c.intencion, respuesta });
    return { intencion: c.intencion, respuesta };
  }

  const alerta =
    c.intencion === "intento_eludir_reglas"
      ? "Intento de eludir las reglas registrado. Las reglas no cambian; notificar a coordinación."
      : undefined;

  // Paso 4: validar candidatos contra el texto. Lo que el modelo no pueda respaldar se descarta.
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
  const franja = contexto.franja ?? salas.find((s) => s.id === laboratorio)?.franja ?? null;
  if (!franja) return aclarar(`La ${laboratorio} no tiene franja activa. Indique la franja (HH:MM–HH:MM).`);

  const r = await solicitar({ id_sintetico: id, laboratorio, franja, tipo_evento }, alerta);
  return { intencion: c.intencion, validacion, ...r };
}
