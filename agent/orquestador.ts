import { z } from "zod";
import { EntradaEvaluar } from "./tools/esquemas.js";
import { evaluar } from "./tools/motor.js";
import { redactar } from "./llm/redactor.js";
import { interpretar, porRegex, recursoVerificado, rutaDeBoton, type Interpretacion } from "./llm/interprete.js";
import { esIntentoDeElusion } from "./llm/guardia.js";
import { datosProhibidos } from "./tools/privacidad.js";
import { registrar } from "./tools/traza.js";
import { configurarRespaldo, type Fuente } from "./llm/respaldo.js";
import { AYUDA_GENERAL, TEXTO_RESERVA, estadoSalas, responderTemas, temasDe } from "./tools/ayuda.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";
import { salas } from "../data/salas.js";
import { crearRepositorio, type Repositorio } from "./store/repositorio.js";
import { continuar, escalarCarneDesconocido, estadoSalasDeBase, iniciar, ocupacionTurno, reanudar, rutaPorFecha, type RespuestaChat } from "./conversacion.js";
import { CHIPS_SALUDO, PEDIR_CARNE, esSalida, esSaludo, saludoPara } from "./sesion.js";
import { carne as carneDe, extraer } from "./tools/extraer.js";
import { enmascarar } from "./tools/reservas.js";
import { ahora } from "./tools/reloj.js";

// Ingreso (vista Laboratorios): las tres salas de la evaluación (las reservas usan sala-1 a sala-16).
type SalaId = "sala-1" | "sala-2" | "sala-3";
const SALAS_INGRESO: string[] = ["sala-1", "sala-2", "sala-3"];


const ALERTA_ELUSION = "Intento de eludir las reglas registrado. Las reglas no cambian; notificar a coordinación.";

type Clasificador = (texto: string) => Promise<Interpretacion & { fallo?: string }>;

const FUERA_GENERAL = "Esa consulta está fuera de mi alcance. Te ayudo con reservas, disponibilidad y ocupación de las salas de sistemas.";
const CHIPS_BOTONES = { tipo: "sugerencia", pendiente: null, opciones: ["Reservar una sala", "Ver disponibilidad", "Estado de salas"] };
const normO = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Respuesta de fuera de alcance. Si el modelo entendió que quiere reservar otra cosa, se nombra lo que pidió
// (solo con palabras que están en el mensaje).
function textoFuera(c: Interpretacion, texto: string): string {
  if (c.recurso !== "otro") return FUERA_GENERAL;
  const r = recursoVerificado(texto, c.recurso_texto);
  return `No puedo reservar ${r ?? "eso"}: solo reservo salas de los laboratorios de sistemas.`;
}

// El mensaje trae datos de una reserva de sala (sala, fecha, horario, personas o la palabra sala/laboratorio).
function traeDatosDeSala(texto: string): boolean {
  const e = extraer(texto, { hoy: ahora().fecha, pendiente: null });
  return Boolean(e.sala || e.fecha || e.inicio || e.personas !== null || e.duracion_min)
    || /\b(salas?|laboratorios?|computador(es)?|equipos?)\b/.test(normO(texto));
}

// Inyección para pruebas: repositorio y clasificador de mentira (sección 7.4).
let inyeccion: { repo?: Repositorio; interpretar?: Clasificador } = {};
// Sin `respaldo`, las pruebas no llaman al modelo (null); la app usa el modelo real.
export function configurarParaPruebas(opciones: { repo?: Repositorio; interpretar?: Clasificador; respaldo?: Fuente }): void {
  inyeccion = { repo: opciones.repo, interpretar: opciones.interpretar };
  configurarRespaldo(opciones.respaldo ?? null);
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

// Ocupación o disponibilidad de un día concreto (sección 7.0.4).
async function porFecha(
  tipo: "ocupacion" | "disponibilidad" | null, texto: string, sesion: string | undefined, repo: Repositorio,
): Promise<RespuestaChat | null> {
  if (tipo === "ocupacion") return ocupacionTurno(texto, sesion, repo);
  if (tipo === "disponibilidad" && sesion) return iniciar("disponibilidad", texto, sesion, repo);
  return null;
}

// Texto libre del monitor o del usuario. `contexto` = sala de la interfaz y sesión del navegador.
// Identidad (plan de identidad, sección 4): sin carné identificado solo se pide el carné. Lo que la persona
// escribió antes queda pendiente y se continúa al identificarse.
const CHIP_SOY_NUEVO = { tipo: "sugerencia", pendiente: null, opciones: ["Soy nuevo"] };

async function sinIdentidad(texto: string, sesion: string | undefined, repo: Repositorio, eludir: boolean): Promise<RespuestaChat> {
  // La guardia responde su alerta aunque no haya carné.
  if (eludir) {
    return { intencion: "intento_eludir_reglas", respuesta: `${ALERTA_ELUSION}\n\n${PEDIR_CARNE}`, alerta: ALERTA_ELUSION, flujo: CHIP_SOY_NUEVO };
  }
  const carneTxt = carneDe(texto);
  if (carneTxt) return identificar(carneTxt, texto, sesion, repo);
  if (esSalida(texto)) {
    if (sesion) await repo.borrarSesion(sesion);
    return { intencion: "cerrar_sesion", respuesta: "Sesión cerrada. Escribe tu carné cuando quieras continuar.", flujo: null };
  }
  // Una petición sin carné se guarda para continuarla; un saludo o "Soy nuevo" no.
  const pendiente = sesion && rutaDeBoton(texto) !== "registro_usuario" && !esSaludo(texto) ? texto : null;
  if (sesion) await repo.guardarSesion({ _id: sesion, carne: null, actualizado: new Date(), pendiente_texto: pendiente });
  return { intencion: "identidad", respuesta: PEDIR_CARNE, flujo: CHIP_SOY_NUEVO };
}

async function identificar(carneTxt: string, texto: string, sesion: string | undefined, repo: Repositorio): Promise<RespuestaChat> {
  const doc = await repo.carne(carneTxt);
  if (!doc || doc.vigencia === "desconocida") {
    if (sesion) await repo.borrarSesion(sesion);
    return { intencion: "identidad", respuesta: await escalarCarneDesconocido(carneTxt, repo), flujo: null };
  }
  if (doc.vigencia === "vencido") {
    if (sesion) await repo.borrarSesion(sesion);
    return { intencion: "identidad", respuesta: "Tu carné está vencido; remítete a carnetización.", flujo: null };
  }
  // Vigente sin registro: se registra (R26) y se saluda.
  let prefijo = "";
  if (!(await repo.usuario(carneTxt))) {
    await repo.registrarUsuario({ _id: carneTxt, rol: doc.rol, registrado: new Date() });
    prefijo = `Listo, quedaste registrado como ${doc.rol} con el carné ${carneTxt}.\n\n`;
  }
  const pendiente = sesion ? ((await repo.leerSesion(sesion))?.pendiente_texto ?? null) : null;
  // Lo que queda del mensaje sin el carné: si es una petición, se continúa en este mismo turno.
  const resto = texto.replace(/\b[CD]-?\d{8}\b/gi, " ").replace(/\s+/g, " ").trim();
  const peticion = resto.length > 4 && !esSaludo(resto) && rutaDeBoton(resto) !== "registro_usuario" ? resto : pendiente;
  if (sesion) await repo.guardarSesion({ _id: sesion, carne: carneTxt, actualizado: new Date(), pendiente_texto: null });
  const saludo = saludoPara(doc, ahora().minutos);
  const identidad = {
    nombres: doc.nombres, apellidos: doc.apellidos, rol: doc.rol,
    programa: doc.rol === "estudiante" ? doc.programa : null, carne: enmascarar(carneTxt),
  };
  if (peticion && sesion) {
    const r = (await mensaje(peticion, { sesion })) as RespuestaChat & { explicacion?: string };
    return { ...r, identidad, respuesta: `${prefijo}${saludo}\n\n${r.respuesta ?? r.explicacion ?? ""}` };
  }
  return { intencion: "saludo", identidad, respuesta: `${prefijo}${saludo}`, flujo: { tipo: "sugerencia", pendiente: null, opciones: CHIPS_SALUDO } };
}

// Dentro de una reserva o un registro abiertos: si el mensaje no aporta ningún dato ni es una respuesta corta
// ("sí", "15", un chip), el modelo lo interpreta. Si está fuera de alcance, se responde y se retoma la pregunta.
async function desvioDelFlujo(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const conv = await repo.leerConversacion(sesion);
  if (!conv || conv.flujo === "disponibilidad") return null;
  const t = normO(texto).trim();
  if (t.split(/\s+/).filter(Boolean).length < 3) return null;
  // Un número casi siempre responde la pregunta pendiente ("quiero la 11", "somos 4").
  if (/\d/.test(t)) return null;
  if (/^(usar sala|ver otras salas|escalar al monitor|revisar|cambiar|si\b|no\b)/.test(t)) return null;
  const e = extraer(texto, { hoy: ahora().fecha, pendiente: conv.pendiente ?? null });
  const aporta = e.carne || e.fecha || e.inicio || e.sala || e.personas !== null || e.equipos !== null
    || e.computo_alto !== null || e.materia || e.confirmacion || e.cancelar || e.duracion_min;
  if (aporta) return null;
  const c = await clasificar(texto);
  if (c.fallo || c.intencion !== "fuera_de_alcance") return null;
  const r = await reanudar(sesion, repo, `${textoFuera(c, texto)} Sigamos con tu solicitud.`);
  return r ? { ...r, intencion: "fuera_de_alcance" } : null;
}

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

  // Identidad: sin sesión identificada solo se pide el carné (la guardia responde igual).
  const sesionDoc = sesion ? await repo.leerSesion(sesion) : null;
  if (!sesionDoc?.carne) {
    const r = await sinIdentidad(texto, sesion, repo, eludir);
    registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
    return r;
  }
  // Un carné solo (o "Soy C-…") con la sesión ya identificada: se vuelve a identificar y saludar, y se cierra
  // la conversación abierta. Pasa al recargar la página o al cambiar de persona (7.0.9).
  const carneNuevo = carneDe(texto);
  if (carneNuevo && sesion && texto.replace(/\b[CD]-?\d{8}\b/gi, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean).length <= 2) {
    await repo.borrarConversacion(sesion);
    const r = await identificar(carneNuevo, texto, sesion, repo);
    registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
    return r;
  }
  // Salir o cerrar sesión: se olvida el carné y se cierra la conversación abierta.
  if (esSalida(texto) && sesion) {
    await repo.borrarSesion(sesion);
    await repo.borrarConversacion(sesion);
    return { intencion: "cerrar_sesion", respuesta: "Sesión cerrada. Escribe tu carné cuando quieras continuar.", flujo: null };
  }

  // Paso 2: flujo abierto. La guardia corre antes: con elusión, la alerta y la pregunta, sin cambiar datos.
  if (sesion) {
    if (eludir) {
      const r = await reanudar(sesion, repo, ALERTA_ELUSION);
      if (r) {
        registrar({ texto: resumen, intencion: "intento_eludir_reglas", respuesta: r.respuesta });
        return { ...r, alerta: ALERTA_ELUSION };
      }
    } else {
      // Un mensaje que no responde a la pregunta pendiente lo interpreta el modelo antes de seguir el flujo.
      const desvio = await desvioDelFlujo(texto, sesion, repo);
      if (desvio) {
        registrar({ texto: resumen, intencion: desvio.intencion, respuesta: desvio.respuesta });
        return desvio;
      }
      const r = await continuar(texto, sesion, repo);
      if (r) {
        registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
        return r;
      }
    }
  }

  // Paso 3: botones de la interfaz (texto fijo), sin modelo. Todo texto libre lo interpreta el modelo.
  const ruta = eludir ? null : rutaDeBoton(texto);
  if (ruta === "consulta_salas") {
    const respuesta = await estadoSalasDeBase(repo);
    registrar({ texto: resumen, intencion: "consulta_salas", respuesta });
    return { intencion: "consulta_salas", respuesta };
  }
  if (ruta && sesion) {
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
      "No pude interpretar el mensaje porque el modelo no respondió. Intenta de nuevo o usa uno de estos botones, que funcionan sin el modelo.";
    registrar({ texto: resumen, intencion: "error_modelo", respuesta });
    return { intencion: "error_modelo", respuesta, flujo: CHIPS_BOTONES };
  }

  if (c.intencion === "consulta_salas" && !eludir) {
    // El modelo dijo "estado de salas" pero el texto trae fecha: no se responde con el estado de ahora.
    const r = await porFecha(rutaPorFecha(texto, false), texto, sesion, repo);
    if (r) {
      registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
      return r;
    }
    const respuesta = await estadoSalasDeBase(repo);
    registrar({ texto: resumen, intencion: "consulta_salas", respuesta });
    return { intencion: "consulta_salas", respuesta };
  }

  // Reservar otra cosa (almuerzo, cancha, auditorio…): el modelo lo entendió; se dice qué no se puede reservar.
  if ((c.intencion === "solicitud_reserva" || c.intencion === "fuera_de_alcance") && c.recurso === "otro" && !eludir) {
    const respuesta = `${textoFuera(c, texto)} ¿Necesitas una sala?`;
    registrar({ texto: resumen, intencion: "fuera_de_alcance", respuesta });
    return { intencion: "fuera_de_alcance", respuesta, flujo: { tipo: "sugerencia", pendiente: null, opciones: ["Reservar una sala"] } };
  }
  // "Quiero reservar" sin decir qué ni traer datos de una sala: se pregunta, no se supone.
  if (c.intencion === "solicitud_reserva" && c.recurso !== "sala" && !traeDatosDeSala(texto) && !eludir) {
    const respuesta = "¿Qué quieres reservar? Solo reservo salas de los laboratorios de sistemas.";
    registrar({ texto: resumen, intencion: "aclaracion", respuesta });
    return { intencion: "aclaracion", respuesta, flujo: { tipo: "sugerencia", pendiente: null, opciones: ["Reservar una sala"] } };
  }
  // Ocupación o disponibilidad de un día concreto (7.0.4), cuando el modelo dijo que es una consulta.
  if (c.intencion === "consulta_disponibilidad" && !eludir) {
    const r = await porFecha(rutaPorFecha(texto, false), texto, sesion, repo);
    if (r) {
      registrar({ texto: resumen, intencion: r.intencion, respuesta: r.respuesta });
      return r;
    }
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
    const respuesta = textoFuera(c, texto);
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
