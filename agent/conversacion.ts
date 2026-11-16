// Conversación por pasos para reservas, registro y disponibilidad (sección 7.3 del plan).
// El estado vive en el repositorio (conversaciones), no en el modelo. Los datos los decide el motor.
import type {
  Conversacion, DecisionReserva, NotificacionDoc, ReservaDoc, SalaDoc, SolicitudReserva,
} from "./tools/esquemas-reservas.js";
import { OLVIDO, elegirEspacio } from "./sesion.js";
import { ahora, aMin, aHora, sumarDias } from "./tools/reloj.js";
import { pedirRespaldo, validarRespaldo } from "./llm/respaldo.js";
import { registrar } from "./tools/traza.js";
import { cancelar as esCancelar, extraer, fechas, horaSuelta, personasAmbiguas, salasNegadas, tieneCorreccion, type Extraido } from "./tools/extraer.js";
import { claseEquipo } from "./tools/estados.js";
import { candidatas, causaFecha, estadoSala, causaR15, cruzanPropias, disponibilidad, enmascarar, evaluarCancelacion, ocupadaPublica, evaluarRegistro, evaluarReserva, horarioLaboratorio, type Contexto } from "./tools/reservas.js";
import type { Repositorio } from "./store/repositorio.js";
import { norm } from "./tools/texto.js";
import type { ReservaPublica, RespuestaChat, ResumenSolicitud } from "./api-tipos.js";

// Forma de la respuesta del chat: contrato compartido con la interfaz (agent/api-tipos.ts).
export type { RespuestaChat };

const VACIA = (): SolicitudReserva => ({
  carne: null, fecha: null, inicio: null, fin: null, sala: null,
  personas: null, equipos: null, computo_alto: null, materia: null,
});

// Motivos en español para cada regla (sin códigos técnicos).
const MOTIVO: Record<string, string> = {
  R15: "la fecha u horario no están permitidos (salas de 07:00 a 22:00, mínimo 30 minutos y hasta 30 días)",
  R17: "el carné no aparece en carnetización o su vigencia es desconocida",
  R18: "la sala no alcanza para las personas o los equipos",
  R19: "hay equipos con estado desconocido o en conflicto",
  R22: "ya está separada en ese horario",
  R23: "se necesita una sala de alto poder de cómputo",
  R24: "ninguna sala cumple las condiciones en ese horario",
};

// Campos que se vuelven a pedir con "cambiar <campo>".
// Hallazgo 9 de la auditoría (16-11-2026): claves tipadas en vez de `as Record<string, unknown>`; si se renombra un
// campo de SolicitudReserva, esto deja de compilar.
type CampoReserva = keyof SolicitudReserva;
const vaciarCampo = <K extends CampoReserva>(d: SolicitudReserva, k: K): void => { d[k] = null as SolicitudReserva[K]; };
const copiarCampo = <K extends CampoReserva>(destino: SolicitudReserva, origen: SolicitudReserva, k: K): void => {
  destino[k] = origen[k];
};
const CAMBIABLES: Record<string, CampoReserva[]> = {
  carne: ["carne"], fecha: ["fecha"], horario: ["inicio", "fin"], personas: ["personas"],
  equipos: ["equipos"], sala: ["sala"], materia: ["materia"],
};

const fechaLarga = (fecha: string): string =>
  new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" })
    .format(new Date(`${fecha}T12:00:00-05:00`)).replace(",", "");

const nombreSala = (salas: SalaDoc[], id: string): string => salas.find((s) => s._id === id)?.nombre ?? id;

// Chips del ajuste mínimo cuando R15 falla por el horario (plan de rango horario, 2): el rango que escribió la
// persona, corregido. Si hoy ya no cabe, "Revisar mañana" conserva el mismo rango.
function chipsHorarioR15(inicio: string, fin: string, hoy: { fecha: string; minutos: number }, fecha: string): string[] {
  const i = aMin(inicio);
  const f = aMin(fin);
  const dur = f - i;
  const rango = (a: number, b: number) => `${aHora(a)} a ${aHora(b)}`;
  const abre = aMin(horarioLaboratorio().abre);   // parámetros de reglas.json, no horas fijas
  const cierra = aMin(horarioLaboratorio().cierra);
  if (fecha === hoy.fecha && i <= hoy.minutos) {
    const ini = (Math.floor(hoy.minutos / 30) + 1) * 30; // siguiente media hora
    const d = dur > 0 ? dur : 30;
    return ini + d <= cierra ? [rango(ini, ini + d)] : ["Revisar mañana"];
  }
  if (i < abre && f > cierra) return ["07:00 a 22:00"];
  if (i < abre) return f > abre ? [rango(abre, f)] : [];
  if (f > cierra) return i < cierra ? [rango(i, cierra)] : [];
  if (f <= i) {
    const g = f + 720; // "de 3 a 1" → 15:00 a 13:00 no sirve; se prueba con la tarde
    return g <= cierra && g > i ? [rango(i, g)] : [];
  }
  if (dur < 30) return i + 30 <= cierra ? [rango(i, i + 30)] : [];
  return [];
}

// Pregunta y chips de cada campo pendiente (textos exactos de la tabla 7.3).
function preguntaPara(pendiente: string, docente: boolean, datos?: SolicitudReserva): { texto: string; opciones: string[] } {
  switch (pendiente) {
    case "carne":
      return {
        texto: "¿Cuál es tu carné? Escribe C- y 8 dígitos si eres estudiante, o D- y 8 dígitos si eres docente. Si es tu primera vez, escribe \"Soy nuevo\".",
        opciones: ["Soy nuevo"],
      };
    case "registro":
      return { texto: "Tu carné está vigente pero aún no te has registrado. ¿Te registro ahora?", opciones: ["Sí, registrarme", "No"] };
    case "fecha":
      // La fecha del ejemplo se calcula con el reloj: nunca una fecha fija que envejezca (antes decía 2026-11-12).
      return { texto: `¿Para qué día? Escribe la fecha, por ejemplo ${sumarDias(ahora().fecha, 2)}, o el día: mañana, el jueves.`, opciones: ["Hoy", "Mañana"] };
    case "horario":
      // Sin chips: el horario lo escribe la persona. Con solo la hora de inicio, se pide la final (plan, 2).
      if (datos?.inicio && !datos.fin) return { texto: `¿Hasta qué hora? Empiezas a las ${datos.inicio}.`, opciones: [] };
      return {
        texto: "¿De qué hora a qué hora? Las salas abren de 07:00 a 22:00. Escribe el rango que necesites, por ejemplo: de 10:00 a 15:00.",
        opciones: [],
      };
    case "personas":
      return { texto: docente ? "¿Cuántos estudiantes tiene el grupo?" : "¿Cuántas personas son?", opciones: [] };
    case "equipos":
      return { texto: "¿Cuántos computadores necesita?", opciones: ["El mismo número de estudiantes"] };
    case "computo_alto":
      return { texto: "¿Necesita una sala de alto poder de cómputo?", opciones: ["Sí", "No"] };
    case "materia":
      return { texto: "¿Para qué materia o espacio académico es?", opciones: [] };
    default:
      return { texto: "¿Confirmo la reserva?", opciones: ["Sí, confirmar", "No"] };
  }
}

const docenteDe = (datos: SolicitudReserva): boolean => datos.carne?.startsWith("D-") ?? false;

// Respuesta con flujo abierto (lleva pregunta y chips).
function abierto(conv: Conversacion, respuesta: string, opciones: string[]): RespuestaChat {
  const intencion = conv.flujo === "registro" ? "registro_usuario" : "solicitud_reserva";
  return { intencion, respuesta, flujo: { tipo: conv.flujo, pendiente: conv.pendiente, opciones } };
}

// Respuesta sin flujo abierto. Con chips, el flujo es "sugerencia" (solo botones, sin estado).
// Lo que la interfaz recibe de una decisión: los choques sin código, carné ni materia de la otra reserva.
// Los datos de otras personas no salen del servidor (14-11-2026); el monitor los ve en su vista.
export function publica(d: DecisionReserva): ReservaPublica {
  return { ...d, conflictos: d.conflictos.map((c) => ({ inicio: c.inicio, fin: c.fin, tipo: c.tipo, personas: c.personas })) };
}

function cerrado(intencion: string, respuesta: string, opciones: string[] = [], extra: Partial<RespuestaChat> = {}): RespuestaChat {
  return {
    intencion, respuesta,
    flujo: opciones.length ? { tipo: "sugerencia", pendiente: null, opciones } : null,
    ...extra,
  };
}

// Red de seguridad (7.0.25): la conversación se valida con Zod al guardar. Si un dato llegara fuera del esquema,
// se descarta en vez de lanzar un Error interno (500); el flujo lo vuelve a pedir.
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const CARNE_OK = /^[CD]-\d{8}$/;
const SALA_OK = /^sala-(1[0-6]|[1-9])$/;
const sanear = (d: SolicitudReserva): void => {
  if (d.carne !== null && !CARNE_OK.test(d.carne)) d.carne = null;
  if (d.fecha !== null && !FECHA_OK.test(d.fecha)) d.fecha = null;
  if (d.inicio !== null && !HORA_OK.test(d.inicio)) d.inicio = null;
  if (d.fin !== null && !HORA_OK.test(d.fin)) d.fin = null;
  if (d.sala !== null && !SALA_OK.test(d.sala)) d.sala = null;
  if (d.personas !== null && (d.personas < 1 || d.personas > 200)) d.personas = null;
  if (d.equipos !== null && (d.equipos < 0 || d.equipos > 200)) d.equipos = null;
  if (d.materia !== null && (d.materia.length < 2 || d.materia.length > 60)) d.materia = null;
};

async function guardar(repo: Repositorio, conv: Conversacion): Promise<void> {
  sanear(conv.datos);
  await repo.guardarConversacion({ ...conv, actualizado: new Date() });
}

async function contextoPara(repo: Repositorio, carne: string | null, fecha: string | null, excluidas?: string[] | null): Promise<Contexto> {
  const h = ahora();
  const salas = await repo.salas();
  return {
    hoy: { fecha: h.fecha, minutos: h.minutos },
    carne: carne ? await repo.carne(carne) : null,
    usuario: carne ? await repo.usuario(carne) : null,
    salas: excluidas?.length ? salas.filter((s) => !excluidas.includes(s._id)) : salas,
    equipos: await repo.equipos(),
    reservasDelDia: fecha ? await repo.reservasDelDia(fecha) : [],
  };
}

// Primer dato que falta, en el orden de la tabla 7.3. null = nada falta.
async function faltante(datos: SolicitudReserva, repo: Repositorio): Promise<string | null> {
  if (!datos.carne) return "carne";
  const carneDoc = await repo.carne(datos.carne);
  const usuario = await repo.usuario(datos.carne);
  if (carneDoc?.vigencia === "vigente" && !usuario) return "registro";
  if (!datos.fecha) return "fecha";
  if (!datos.inicio || !datos.fin) return "horario";
  if (datos.personas === null) return "personas";
  if (docenteDe(datos)) {
    if (datos.equipos === null) return "equipos";
    if (datos.computo_alto === null) return "computo_alto";
    if (!datos.materia) return "materia";
  }
  return null;
}

// 7.0.25: valida personas y equipos antes de guardarlos. El esquema exige personas 1–200 y equipos 0–200; además,
// pedir más que la sala más grande no tiene sentido. Devuelve el campo a volver a preguntar y el texto exacto.
async function cantidadInvalida(
  ext: Extraido, repo: Repositorio,
): Promise<{ campo: "personas" | "equipos"; texto: string } | null> {
  if (ext.personas !== null && ext.personas < 1) {
    return { campo: "personas", texto: "El número de personas debe ser al menos 1. ¿Cuántas son?" };
  }
  if (ext.equipos !== null && ext.equipos < 0) {
    return { campo: "equipos", texto: "El número de equipos no puede ser negativo. ¿Cuántos computadores necesita?" };
  }
  const salas = (await repo.salas()).filter((s) => s.activa);
  if (!salas.length) return null;
  if (ext.personas !== null) {
    const max = Math.max(...salas.map((s) => s.capacidad));
    if (ext.personas > Math.min(200, max)) {
      return { campo: "personas", texto: `Ninguna sala tiene cupo para ${ext.personas} personas; la más grande es de ${max}. ¿Cuántas son?` };
    }
  }
  if (ext.equipos !== null) {
    const equipos = await repo.equipos();
    const max = Math.max(...salas.map((s) => {
      const est = estadoSala(s, equipos);
      return est.operativos + est.inciertos;
    }));
    if (ext.equipos > Math.min(200, max)) {
      return { campo: "equipos", texto: `Ninguna sala tiene cupo para ${ext.equipos} equipos; la más grande es de ${max}. ¿Cuántos computadores necesita?` };
    }
  }
  return null;
}

// Pasa lo que el mensaje trae a los campos vacíos. Con `reemplazar`, la fecha, la sala y las personas que el
// mensaje trae explícitas reemplazan a las anteriores (7.0.26: «mañana mejor» dentro de una reserva). El carné
// nunca se reemplaza: es el de la sesión.
function aplicar(d: SolicitudReserva, e: Extraido, reemplazar = false): boolean {
  let cambio = false;
  const llenar = <K extends keyof SolicitudReserva>(k: K, v: SolicitudReserva[K] | null, reemplaza = false) => {
    if (v === null || d[k] === v) return;
    if (d[k] === null || (reemplazar && reemplaza)) {
      d[k] = v;
      cambio = true;
    }
  };
  llenar("carne", e.carne);
  llenar("fecha", e.fecha, true);
  llenar("sala", e.sala, true);
  // 7.0.25: el esquema exige personas 1–200 y equipos 0–200. Un valor fuera de rango no se guarda; se explica
  // en `turnoReserva`/`disponibilidadTurno` y se vuelve a preguntar. Así ningún dato del usuario termina en 500.
  if (e.personas !== null && e.personas >= 1 && e.personas <= 200) llenar("personas", e.personas, true);
  if (e.equipos !== null && e.equipos >= 0 && e.equipos <= 200) llenar("equipos", e.equipos);
  llenar("computo_alto", e.computo_alto);
  llenar("materia", e.materia);
  if (d.inicio === null && d.fin === null && e.inicio && e.fin) {
    d.inicio = e.inicio;
    d.fin = e.fin;
    cambio = true;
  }
  return cambio;
}

const solicitudDe = (datos: SolicitudReserva): SolicitudReserva => ({ ...datos });

// Resumen de la solicitud para la tarjeta de la interfaz (carné enmascarado).
function resumenDe(sol: SolicitudReserva, salas: SalaDoc[], salaId: string | null): ResumenSolicitud {
  return {
    sala: salaId,
    sala_nombre: salaId ? nombreSala(salas, salaId) : null,
    fecha: sol.fecha, inicio: sol.inicio, fin: sol.fin,
    personas: sol.personas, equipos: sol.equipos ?? sol.personas,
    computo_alto: sol.computo_alto ?? false, materia: sol.materia,
    docente: docenteDe(sol), carne_enmascarado: sol.carne ? enmascarar(sol.carne) : null,
  };
}

function propuestaTexto(sol: SolicitudReserva, sala: string, salas: SalaDoc[]): string {
  return `La ${nombreSala(salas, sala)} está libre el ${fechaLarga(sol.fecha!)} de ${sol.inicio} a ${sol.fin} para ${sol.personas} personas. ¿Confirmo la reserva?`;
}

// Documento de reserva para el repositorio (programada o escalada).
// Jornada del estudiante, solo informativa: se guarda en la reserva (plan de identidad, sección 4.5).
const jornadaDe = (ctx: Contexto): "Mañana" | "Noche" | null => (ctx.carne?.rol === "estudiante" ? ctx.carne.jornada : null);

function reservaDoc(sol: SolicitudReserva, codigo: string, d: DecisionReserva, estado: "programada" | "escalada", jornada: "Mañana" | "Noche" | null = null): ReservaDoc {
  const docente = docenteDe(sol);
  return {
    codigo, sala: sol.sala!, fecha: sol.fecha!, inicio: sol.inicio!, fin: sol.fin!,
    inicio_min: aMin(sol.inicio!), fin_min: aMin(sol.fin!),
    tipo: docente ? "clase" : "estudiantes", carne: sol.carne!, rol: docente ? "docente" : "estudiante",
    personas: sol.personas!, equipos: sol.equipos ?? sol.personas!, computo_alto: sol.computo_alto ?? false,
    materia: sol.materia, estado, reglas_aplicadas: d.reglas_aplicadas, traza: d.traza,
    version_reglas: d.version_reglas, creada: new Date(), origen: "chat", jornada,
  };
}

// Avisos de una escalada: uno por destinatario (R19: monitor y mantenimiento; R20: monitor; R21: coordinación).
// El motivo lleva los carnés enmascarados.
function avisosDe(d: DecisionReserva, sol: SolicitudReserva) {
  return (codigo: string): NotificacionDoc[] => {
    const regla = d.reglas_aplicadas[0] ?? "R17";
    const causa = d.conflictos.length
      ? `choque con ${d.conflictos.map((c) => `${c.codigo} (${c.carne_enmascarado})`).join(", ")}`
      : (MOTIVO[regla] ?? "revisión necesaria");
    const motivo = `${regla}: ${causa}. Solicitante ${enmascarar(sol.carne!)}.`;
    return d.notificar.map((para) => ({
      para, motivo, regla, reserva_codigo: codigo, carne: sol.carne, sala: sol.sala, fecha: sol.fecha,
      horario: sol.inicio && sol.fin ? `${sol.inicio}–${sol.fin}` : null, estado: "pendiente" as const, creada: new Date(),
    }));
  };
}

// Aviso sin reserva (R17): la identidad no se puede verificar. Motivo con carné enmascarado y, si se conocen,
// la fecha y el horario pedidos.
// R17 desde la identificación: aviso al monitor sin reserva y texto para la persona.
export async function escalarCarneDesconocido(carne: string, repo: Repositorio): Promise<string> {
  await repo.notificar(avisoCarne({ ...VACIA(), carne }));
  return TEXTO_DESCONOCIDO;
}

function avisoCarne(datos: SolicitudReserva): NotificacionDoc {
  const cuando = `fecha ${datos.fecha ?? "sin indicar"}, horario ${datos.inicio && datos.fin ? `${datos.inicio}–${datos.fin}` : "sin indicar"}`;
  return {
    para: "monitor",
    motivo: `R17: carné ${enmascarar(datos.carne!)} no aparece en carnetización o su vigencia es desconocida (${cuando}).`,
    regla: "R17", reserva_codigo: null, carne: datos.carne, sala: datos.sala, fecha: datos.fecha,
    horario: datos.inicio && datos.fin ? `${datos.inicio}–${datos.fin}` : null, estado: "pendiente", creada: new Date(),
  };
}

// Vigencia del carné apenas llega (7.0.1 punto 1).
async function estadoCarne(carne: string, repo: Repositorio): Promise<"vencido" | "desconocido" | "ok"> {
  const doc = await repo.carne(carne);
  if (doc?.vigencia === "vencido") return "vencido";
  if (!doc || doc.vigencia === "desconocida") return "desconocido";
  return "ok";
}

const TEXTO_VENCIDO = "Tu carné está vencido en carnetización: no puedo separar la sala. Remítete a carnetización.";
const TEXTO_DESCONOCIDO = "No puedo confirmarlo con los datos que hay: el carné no aparece en carnetización o su vigencia es desconocida. Avisé al monitor.";

function textoNegar(d: DecisionReserva, sol: SolicitudReserva, ctx: Contexto): string {
  const salas = ctx.salas;
  const h = ahora();
  const causa = d.reglas_aplicadas[0] === "R15" && sol.fecha && sol.inicio && sol.fin
    ? causaR15(sol.fecha, sol.inicio, sol.fin, { fecha: h.fecha, minutos: h.minutos }) : null;
  let motivo = causa ? causa.motivo : (MOTIVO[d.reglas_aplicadas[0]] ?? "no se cumplen las condiciones");
  // R18 con la cifra concreta: puestos y equipos operativos frente a lo pedido (7.0.9).
  const salaDoc = sol.sala ? salas.find((x) => x._id === sol.sala) : undefined;
  if (d.reglas_aplicadas[0] === "R18" && salaDoc && sol.fecha && sol.personas !== null) {
    const operativos = disponibilidad(salaDoc, sol.fecha, ctx.reservasDelDia, ctx).operativos;
    const equipos = sol.equipos ?? sol.personas;
    motivo = `tiene ${salaDoc.capacidad} puestos y ${operativos} equipos operativos, y se necesitan ${sol.personas} puestos y ${equipos} equipos`;
  }
  const nombre = sol.sala ? `la ${nombreSala(salas, sol.sala)}` : "una sala";
  const libres = d.alternativas.length
    ? `\nSalas libres en ese horario: ${d.alternativas.map((a) => nombreSala(salas, a)).join(", ")}.`
    : "";
  const pregunta = d.alternativas.length ? "¿Cuál de estas salas quieres, o prefieres otro horario?" : "¿Quieres otro horario?";
  return `No puedo separar ${nombre}: ${motivo}.${libres}\n${pregunta}`;
}

function textoEscalar(d: DecisionReserva, sol: SolicitudReserva, salas: SalaDoc[], codigo: string | null): string {
  const regla = d.reglas_aplicadas[0];
  const nombre = sol.sala ? nombreSala(salas, sol.sala) : "la sala";
  const libres = d.alternativas.length
    ? ` Mientras tanto, estas salas están libres: ${d.alternativas.map((a) => nombreSala(salas, a)).join(", ")}.`
    : "";
  const quedo = codigo ? ` Quedó registrada como ${codigo}.` : "";
  const c = d.conflictos[0];
  if (regla === "R20" && c) {
    return `La ${nombre} ya está separada de ${c.inicio} a ${c.fin} por un grupo de estudiantes (${c.personas} personas). Avisé al monitor para que ustedes acuerden el uso.${libres}${quedo}`;
  }
  if (regla === "R21" && c) {
    return `La ${nombre} ya está separada de ${c.inicio} a ${c.fin} por otro docente. Avisé al monitor, que lo remitirá a coordinación si hace falta.${libres}${quedo}`;
  }
  const quien = regla === "R19" ? "Avisé al monitor y a mantenimiento." : "Avisé al monitor.";
  const aviso = codigo ? `${quien}${quedo}` : "Consulte con el monitor.";
  return `No puedo confirmarlo con los datos que hay: ${MOTIVO[regla] ?? "hay un conflicto que requiere revisión"}. ${aviso}`;
}

// Evalúa con el motor y responde según la decisión (sección 7.3, punto 3).
async function responder(
  conv: Conversacion, d: DecisionReserva, sol: SolicitudReserva, ctx: Contexto, repo: Repositorio, prefijo = "",
): Promise<RespuestaChat> {
  if (d.decision === "programar") {
    conv.propuesta = { sala: d.sala_asignada! };
    conv.pendiente = "confirmar";
    conv.intentos = 0;
    await guardar(repo, conv);
    const texto = prefijo + propuestaTexto(sol, d.sala_asignada!, ctx.salas);
    return { intencion: "solicitud_reserva", respuesta: texto,
      flujo: { tipo: "reserva", pendiente: "confirmar", opciones: ["Sí, confirmar", "No"] },
      reserva: publica(d), solicitud: resumenDe(sol, ctx.salas, d.sala_asignada) };
  }
  if (d.decision === "escalar") {
    let codigo: string | null = null;
    if (sol.sala) {
      codigo = await repo.registrarEscalada(
        (c) => reservaDoc(sol, c, d, "escalada", jornadaDe(ctx)),
        avisosDe(d, sol),
      );
    }
    await repo.borrarConversacion(conv._id);
    // Tras una reserva escalada registrada, se olvida el carné (plan de identidad, sección 4.6).
    if (codigo) await repo.borrarSesion(conv._id);
    // El cierre va aparte de la tarjeta: la respuesta de la reserva no lo incluye.
    return cerrado("solicitud_reserva", prefijo + textoEscalar(d, sol, ctx.salas, codigo), [],
      { reserva: publica(d), solicitud: resumenDe(sol, ctx.salas, sol.sala), sesion_olvidada: codigo ? true : undefined, cierre: codigo ? OLVIDO : undefined });
  }
  if (d.decision === "negar") {
    // R28: choca con otra reserva del mismo carné (pudo entrar por la ventana entre la revisión temprana y la
    // confirmación). Se explica y se dejan los dos caminos; la reserva no se crea.
    if (d.reglas_aplicadas.includes("R28")) {
      const c = d.conflictos[0];
      const propia = c ? await repo.reservaPorCodigo(c.codigo) : null;
      conv.datos.inicio = null;
      conv.datos.fin = null;
      conv.propuesta = null;
      conv.validado = null;
      conv.pendiente = "horario";
      conv.intentos = 0;
      await guardar(repo, conv);
      const texto = propia
        ? mensajeR28(propia)
        : "Ya tienes otra reserva que se cruza con ese horario: no puedes tener dos salas a la misma hora. Elige otro horario.";
      // Sin el prefijo de «los datos cambiaron»: el mensaje de R28 ya explica el cruce y qué hacer.
      return { ...abierto(conv, texto, propia ? opcionesR28(propia) : ["Cambiar horario"]),
        reserva: publica(d), solicitud: resumenDe(sol, ctx.salas, sol.sala) };
    }
    if (d.reglas_aplicadas.includes("R16")) {
      await repo.borrarConversacion(conv._id);
      return cerrado("solicitud_reserva",
        prefijo + "Tu carné está vencido en carnetización: no puedo separar la sala. Remítete a carnetización.",
        [], { reserva: publica(d) });
    }
    // R24 (ninguna sala en ese horario): el día más cercano con el mismo rango y personas (plan, 4).
    const dia = d.reglas_aplicadas.includes("R24") && sol.fecha && sol.inicio && sol.fin
      ? await diaMasCercano({ ...sol, sala: null }, aMin(sol.fin) - aMin(sol.inicio), sol.fecha, repo) : null;
    // El flujo sigue abierto. Si el problema es la sala (aforo, choque o alto cómputo) y hay otras libres,
    // se conservan fecha y horario y solo se pide otra sala (7.0.9); si no, se pide otro horario.
    // Con un día ofrecido (R24) también se conserva el horario para revisar esa fecha.
    const deSala = ["R18", "R22", "R23"].includes(d.reglas_aplicadas[0]) && d.alternativas.length > 0;
    if (!deSala && !dia) {
      conv.datos.inicio = null;
      conv.datos.fin = null;
    }
    conv.datos.sala = null;
    conv.propuesta = null;
    conv.validado = null;
    conv.pendiente = deSala ? "sala" : "horario";
    conv.intentos = 0;
    await guardar(repo, conv);
    const opciones = [
      ...d.alternativas.map((a) => `Usar Sala ${a.slice(5)}`),
      ...(dia ? [chipRevisar(dia, ahora().fecha)] : []),
    ];
    const extra = dia ? ` El día más cercano con una sala libre en ese horario es el ${fechaLarga(dia)}.` : "";
    return { ...abierto(conv, prefijo + textoNegar(d, sol, ctx) + extra, opciones), reserva: publica(d),
      solicitud: resumenDe(sol, ctx.salas, sol.sala) };
  }
  // pedir_datos: no debería llegar aquí (faltante lo resuelve antes), pero se pide el primer faltante.
  const f = d.faltantes[0] ?? "horario";
  conv.pendiente = f;
  await guardar(repo, conv);
  const p = preguntaPara(f, docenteDe(sol));
  return abierto(conv, prefijo + p.texto, p.opciones);
}

// Confirma la propuesta: revalida dentro de la transacción y solo inserta si sigue libre.
async function confirmar(conv: Conversacion, repo: Repositorio): Promise<RespuestaChat> {
  const sala = conv.propuesta!.sala;
  const sol: SolicitudReserva = { ...solicitudDe(conv.datos), sala };
  const ctx = await contextoPara(repo, sol.carne, sol.fecha, conv.excluidas);
  let decision: DecisionReserva | undefined;
  const res = await repo.crearReservaAtomica(
    sol.fecha!, sala,
    // R28 se revalida con TODAS las reservas programadas del día, no solo las de esta sala.
    (_deSala, delDia) => {
      decision = evaluarReserva(sol, { ...ctx, reservasDelDia: delDia });
      return decision;
    },
    (codigo) => reservaDoc(sol, codigo, decision!, "programada", jornadaDe(ctx)),
    sol.carne,
  );
  if (res.reserva) {
    await repo.borrarConversacion(conv._id);
    await repo.borrarSesion(conv._id);
    const texto = `Listo. Reserva ${res.reserva.codigo} confirmada: ${nombreSala(ctx.salas, sala)}, ${fechaLarga(sol.fecha!)}, ${sol.inicio} a ${sol.fin}. Queda registrada en la base de demostración (datos sintéticos).`;
    return cerrado("solicitud_reserva", texto, [], { reserva: publica(res.decision), solicitud: resumenDe(sol, ctx.salas, sala), sesion_olvidada: true, cierre: OLVIDO });
  }
  conv.propuesta = null;
  return responder(conv, res.decision, sol, ctx, repo, "Los datos cambiaron mientras confirmaba. ");
}

async function evaluar(conv: Conversacion, repo: Repositorio, prefijo = ""): Promise<RespuestaChat> {
  const sol = solicitudDe(conv.datos);
  const ctx = await contextoPara(repo, sol.carne, sol.fecha, conv.excluidas);
  return responder(conv, evaluarReserva(sol, ctx), sol, ctx, repo, prefijo);
}

// Registro de un carné: R26 inserta el usuario; R16/R17 cierran con un mensaje.
async function registrarUsuarioDesde(carne: string, repo: Repositorio): Promise<DecisionReserva> {
  const carneDoc = await repo.carne(carne);
  const usuario = await repo.usuario(carne);
  const d = evaluarRegistro(carne, { carne: carneDoc, usuario });
  if (d.reglas_aplicadas.includes("R26") && carneDoc) {
    await repo.registrarUsuario({ _id: carne, rol: carneDoc.rol, registrado: new Date() });
  }
  return d;
}

// Clave de fecha, horario y sala: cambia cuando cambia alguno. null si aún no hay fecha y horario.
const claveHorario = (d: SolicitudReserva): string | null =>
  d.fecha && d.inicio && d.fin ? `${d.fecha}|${d.inicio}|${d.fin}|${d.sala ?? ""}` : null;

const capitalizar = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
// "¿Cuántos…?" dentro de "Ahora, …" empieza en minúscula.
const minusculaInicial = (t: string): string => t.replace(/^¿(.)/, (_, c: string) => `¿${c.toLowerCase()}`);

// Salas libres en la fecha y horario de la solicitud que alcanzan para las personas y los equipos ya conocidos
// (7.0.9). Sin personas no hay mínimo. El motor completo vuelve a decidir al confirmar.
async function salasLibres(d: SolicitudReserva, repo: Repositorio, excluidas: string[] | null | undefined = null): Promise<{ sala: SalaDoc; operativos: number }[]> {
  const ctx = await contextoPara(repo, null, d.fecha, excluidas);
  return candidatas({
    carne: null, fecha: d.fecha, inicio: d.inicio, fin: d.fin, sala: null,
    personas: d.personas, equipos: d.equipos, computo_alto: d.computo_alto ?? false, materia: null,
  }, ctx).slice(0, 3).map((sala) => ({
    sala, operativos: disponibilidad(sala, d.fecha!, ctx.reservasDelDia, ctx).operativos,
  }));
}

// Respuesta con hasta 3 salas libres como chips (con puestos y equipos operativos), o, si no hay, un horario nuevo.
async function ofrecerSalas(conv: Conversacion, repo: Repositorio, causa: string): Promise<RespuestaChat> {
  const libres = await salasLibres(conv.datos, repo, conv.excluidas);
  conv.propuesta = null;
  conv.ofrecer = null;
  const para = conv.datos.personas !== null ? ` para ${conv.datos.personas} personas` : "";
  if (!libres.length) {
    const cuando = `${fechaLarga(conv.datos.fecha!)} de ${conv.datos.inicio} a ${conv.datos.fin}`;
    conv.datos.inicio = null;
    conv.datos.fin = null;
    conv.validado = null;
    conv.pendiente = "horario";
    await guardar(repo, conv);
    const p = preguntaPara("horario", docenteDe(conv.datos));
    return abierto(conv, `${causa ? `${causa} ` : ""}No hay salas libres${para} el ${cuando}. ¿Qué otro horario quieres?`, p.opciones);
  }
  conv.pendiente = "sala";
  await guardar(repo, conv);
  const lineas = libres.map((x) => `• ${etiquetaSala(x.sala)}: ${x.sala.capacidad} puestos, ${x.operativos} equipos operativos`);
  return abierto(conv,
    `${causa ? `${causa} ` : ""}Estas salas están libres${para} el ${fechaLarga(conv.datos.fecha!)} de ${conv.datos.inicio} a ${conv.datos.fin}:\n${lineas.join("\n")}\nElige una o escribe su número.`,
    libres.map((x) => `Usar ${etiquetaSala(x.sala)}`));
}

// Validación temprana (7.0.6): en cuanto hay fecha y horario se evalúa R15 y, si nombró una sala, si está libre.
// Corre antes de pedir personas, equipos, alto cómputo o materia. El motor completo decide al confirmar.
// Devuelve `corte` si la respuesta termina aquí, o `ok` con el aviso de sala libre (puede ser "").
async function revisarTemprano(conv: Conversacion, repo: Repositorio): Promise<{ corte?: RespuestaChat; ok?: string }> {
  const d = conv.datos;
  const h = ahora();
  const clave = claveHorario(d);
  // La fecha se revisa apenas llega: «para ayer» o «el sábado 13» se corrigen en el momento, sin esperar el horario.
  const fechaMal = d.fecha ? causaFecha(d.fecha, { fecha: h.fecha, minutos: h.minutos }) : null;
  // 7.0.25: si el fin es anterior o igual al inicio, se explica apenas se conocen las horas, aunque falte la fecha
  // («Quiero una sala de 4 a 2»). Con fecha, R15 ya da el mismo motivo y sus chips de corrección.
  const invertido = Boolean(d.inicio && d.fin && aMin(d.fin) <= aMin(d.inicio));
  if (!fechaMal && !clave && !invertido) return { ok: "" };
  if (!d.fecha && !fechaMal && invertido) {
    d.inicio = null;
    d.fin = null;
    conv.validado = null;
    conv.propuesta = null;
    conv.pendiente = "horario";
    conv.intentos = 0;
    await guardar(repo, conv);
    const p = preguntaPara("horario", docenteDe(d), d);
    return { corte: abierto(conv, `La hora final debe ser después de la inicial. ${p.texto}`, p.opciones) };
  }
  const causa = fechaMal ?? causaR15(d.fecha!, d.inicio!, d.fin!, { fecha: h.fecha, minutos: h.minutos });
  if (causa) {
    const chips = !fechaMal && causa.campo === "horario" && d.inicio && d.fin
      ? chipsHorarioR15(d.inicio, d.fin, { fecha: h.fecha, minutos: h.minutos }, d.fecha!) : [];
    const conservaRango = chips.includes("Revisar mañana");
    if (!conservaRango) { d.inicio = null; d.fin = null; }
    if (causa.campo === "fecha") d.fecha = null;
    conv.validado = null;
    conv.propuesta = null;
    conv.pendiente = causa.campo;
    await guardar(repo, conv);
    const p = preguntaPara(causa.campo, docenteDe(d), d);
    // Fuera de 07:00–22:00 la causa ya dice el horario: no se repite en la pregunta.
    const texto = causa.campo === "horario" && causa.motivo.startsWith("las salas abren de")
      ? `${capitalizar(causa.motivo)}: elige un rango dentro de ese horario.`
      : `${capitalizar(causa.motivo)}. ${p.texto}`;
    return { corte: abierto(conv, texto, chips.length ? chips : p.opciones) };
  }
  // R28 (7.0.25): con fecha y horario ya se sabe si se cruza con otra reserva del mismo carné, en cualquier sala.
  // Se avisa en ese mismo turno (no se espera a la confirmación) y se ofrecen cancelar la existente o cambiar hora.
  if (d.carne && d.fecha && d.inicio && d.fin) {
    const propias = cruzanPropias(await repo.reservasDelDia(d.fecha), d.carne, aMin(d.inicio), aMin(d.fin))
      .sort((a, b) => a.inicio_min - b.inicio_min);
    if (propias.length) {
      const r = propias[0];
      d.inicio = null;
      d.fin = null;
      conv.validado = null;
      conv.propuesta = null;
      conv.pendiente = "horario";
      conv.intentos = 0;
      await guardar(repo, conv);
      return { corte: abierto(conv, mensajeR28(r), opcionesR28(r)) };
    }
  }
  // Sala ocupada: mientras no elija "Ver otras salas" o "Escalar al monitor", se repite el aviso.
  if (conv.pendiente === "ocupada" && clave === conv.validado && d.sala) {
    const ocupada = await choqueDe(d, repo);
    if (ocupada) return { corte: textoOcupada(conv, await etiquetaDe(repo, d.sala), ocupada) };
  }
  // Sala todavía no elegida tras una sala ocupada: se repiten las opciones, no se piden otros datos.
  if (conv.pendiente === "sala" && !d.sala) {
    return { corte: await ofrecerSalas(conv, repo, "No reconocí la sala.") };
  }
  if (clave === conv.validado) return { ok: "" };
  conv.validado = clave;
  if (!d.sala) {
    await guardar(repo, conv);
    return { ok: "" };
  }
  const sala = (await repo.salas()).find((s) => s._id === d.sala);
  const etiqueta = sala ? etiquetaSala(sala) : d.sala;
  const ocupada = (await repo.reservasDelDia(d.fecha!, d.sala))
    .find((r) => r.inicio_min < aMin(d.fin!) && r.fin_min > aMin(d.inicio!));
  if (ocupada) {
    conv.pendiente = "ocupada";
    await guardar(repo, conv);
    return { corte: textoOcupada(conv, etiqueta, ocupada) };
  }
  await guardar(repo, conv);
  return { ok: `Revisé la ${etiqueta} para el ${fechaLarga(d.fecha!)} de ${d.inicio} a ${d.fin} y está libre ✅. ` };
}

// Texto de aforo insuficiente de la sala elegida, o null si alcanza o faltan datos (7.0.9).
async function aforoInsuficiente(d: SolicitudReserva, repo: Repositorio, excluidas: string[] | null | undefined = null): Promise<string | null> {
  if (!d.sala || !d.fecha || d.personas === null) return null;
  const ctx = await contextoPara(repo, null, d.fecha, excluidas);
  const sala = ctx.salas.find((x) => x._id === d.sala);
  if (!sala) return null;
  const { operativos, inciertos } = disponibilidad(sala, d.fecha, ctx.reservasDelDia, ctx);
  const equipos = d.equipos ?? (docenteDe(d) ? 0 : d.personas);
  // Con equipos inciertos que completarían lo pedido decide el motor al confirmar (R19, escala).
  if (d.personas <= sala.capacidad && equipos <= operativos + inciertos) return null;
  return `La ${etiquetaSala(sala)} tiene ${sala.capacidad} puestos y ${operativos} equipos operativos: no alcanza para ${d.personas} personas.`;
}

// Reserva que ocupa la sala en el horario pedido (R20, R21 o R22), si la hay.
async function choqueDe(d: SolicitudReserva, repo: Repositorio): Promise<ReservaDoc | undefined> {
  return (await repo.reservasDelDia(d.fecha!, d.sala!))
    .find((r) => r.inicio_min < aMin(d.fin!) && r.fin_min > aMin(d.inicio!));
}

async function etiquetaDe(repo: Repositorio, salaId: string): Promise<string> {
  const sala = (await repo.salas()).find((s) => s._id === salaId);
  return sala ? etiquetaSala(sala) : salaId;
}

// Aviso de sala ocupada (7.0.7): dice cuándo y si la tiene un docente o estudiantes, sin datos de la persona.
function textoOcupada(conv: Conversacion, etiqueta: string, ocupada: ReservaDoc): RespuestaChat {
  // Sin carné ni nombre de la otra persona: el chat solo dice si es una clase o un grupo de estudiantes.
  const quien = ocupada.rol === "docente" ? "otro docente" : "un grupo de estudiantes";
  return abierto(conv, `La ${etiqueta} está ocupada de ${ocupada.inicio} a ${ocupada.fin} por ${quien}.`,
    ["Ver otras salas", "Escalar al monitor"]);
}

// R28 (14-11-2026): su propia reserva se cruza con el horario pedido, en cualquier sala. Se dice cuál es y se
// ofrecen los dos caminos: cancelarla o cambiar el horario. La reserva es del mismo carné, así que el código no
// revela nada de otra persona.
function mensajeR28(r: { codigo: string; sala: string; inicio: string; fin: string }): string {
  return `Ya tienes ${r.codigo} (Sala ${r.sala.slice(5)}) de ${r.inicio} a ${r.fin}: no puedes tener dos salas a la misma hora. Elige otro horario o cancela ${r.codigo}.`;
}
const opcionesR28 = (r: { codigo: string }): string[] => [`Cancelar ${r.codigo}`, "Cambiar horario"];

// 7.0.24: pedir la reserva de otra persona (cancelarla o que se la pasen) no es cancelar la solicitud.
// Un mensaje que habla de una reserva sigue el flujo abierto; solo «cancelar», «olvídalo» o «salir» lo cierran.
const HABLA_DE_RESERVA = /\breservas?\b|\brs[\s-]?\d{1,5}\b|\b(me la (das|dejes|pases|pasas|quitas)|damela|pasamela|quitasela)\b/;
const hablaDeReserva = (texto: string): boolean => HABLA_DE_RESERVA.test(norm(texto));
// Verbos de cancelación (7.0.24): un mensaje que pide cancelar y habla de una reserva no cierra la solicitud.
const PIDE_CANCELAR = /\b(cancel\w*|anul\w*|elimin\w*|borr\w*|quit\w*)\b/;

// La sala pedida la tiene otra persona: se niega por R27, sin revelar quién es ni datos de su reserva, y la
// solicitud sigue abierta con las mismas opciones de la sala ocupada.
async function reservaAjenaTurno(conv: Conversacion, repo: Repositorio): Promise<RespuestaChat> {
  const d = conv.datos;
  const ocupada = d.sala && d.fecha && d.inicio && d.fin ? await choqueDe(d, repo) : undefined;
  if (!ocupada) return abierto(conv, "Esa reserva es de otra persona: solo quien la hizo puede cancelarla (R27), y no puedo pasártela.", ["Ver otras salas", "Escalar al monitor"]);
  const etiqueta = await etiquetaDe(repo, d.sala!);
  return abierto(conv,
    `Esa reserva es de otra persona: solo quien la hizo puede cancelarla (R27), y no puedo pasártela. La ${etiqueta} sigue ocupada de ${ocupada.inicio} a ${ocupada.fin}.`,
    ["Ver otras salas", "Escalar al monitor"]);
}

// "Escalar al monitor" (7.0.7): solo crea un aviso para el monitor (sin reserva, reserva_codigo null),
// cierra la conversación y olvida el carné. R20/R21 si el solicitante es docente; R22 si es estudiante.
async function escalarAlMonitor(conv: Conversacion, repo: Repositorio): Promise<RespuestaChat> {
  const d = conv.datos;
  const ocupada = d.sala && d.fecha && d.inicio && d.fin ? await choqueDe(d, repo) : undefined;
  const doc = d.carne ? await repo.carne(d.carne) : null;
  if (!ocupada || !doc) {
    await repo.borrarConversacion(conv._id);
    return cerrado("solicitud_reserva", "La sala ya no aparece ocupada en ese horario. Escribe de nuevo tu solicitud cuando quieras.");
  }
  const regla = !docenteDe(d) ? "R22" : ocupada.rol === "docente" ? "R21" : "R20";
  const quien = ocupada.rol === "docente" ? "otro docente" : "un grupo de estudiantes";
  const etiqueta = await etiquetaDe(repo, d.sala!);
  await repo.notificar({
    para: "monitor",
    motivo: `${regla}: ${etiqueta} el ${d.fecha} de ${d.inicio} a ${d.fin} está ocupada de ${ocupada.inicio} a ${ocupada.fin} por ${quien} (carné ${enmascarar(ocupada.carne)}). Solicitante ${enmascarar(d.carne!)}: sin reserva; pidió escalar.`,
    regla, reserva_codigo: null, carne: d.carne, sala: d.sala, fecha: d.fecha, horario: `${d.inicio}–${d.fin}`,
    estado: "pendiente", creada: new Date(),
  });
  await repo.borrarConversacion(conv._id);
  await repo.borrarSesion(conv._id);
  return cerrado("solicitud_reserva",
    `Listo, ${doc.nombres}: le pasé tu caso al monitor para que lo confirme contigo. ¡Ha sido un gusto ayudarte! Si necesitas otra solicitud, escríbeme de nuevo tu carné.`);
}

// Horario que el chat acepta: entre 07:00 y 22:00 y con fin después del inicio (7.0.8).
const horarioAceptable = (inicio: string, fin: string): boolean => inicio >= "07:00" && fin <= "22:00" && fin > inicio;
const horarioPendiente = (d: SolicitudReserva): boolean =>
  d.inicio === null || d.fin === null || !horarioAceptable(d.inicio, d.fin);

// Cuándo pedir el respaldo del modelo (7.0.8): solo si el código no entiende la sala o el horario, y el flujo
// espera la fecha o el horario. Pistas de hora (hasta, a las, de 2, 4 pm, 14:00) para no llamar por cualquier número.
function necesitaRespaldo(texto: string, ext: Extraido, d: SolicitudReserva, pendiente: string | null): boolean {
  if (pendiente !== null && pendiente !== "fecha" && pendiente !== "horario") return false;
  const n = norm(texto);
  // Una mención genérica ("una sala") no tiene número que buscar: no llama al modelo.
  const salaSinNumero = /\b(sala|salas|laboratorio)\b/.test(n) && !/\b(una|un|otra|cualquier)\s+(sala|salas|laboratorio)\b/.test(n);
  if (salaSinNumero && d.sala === null && ext.sala === null) return true;
  const pistaHora = /\b(hasta|asta|desde|ala|a las?|de \d)\b|\d\s*(am|pm)\b|\d[:.h]\d\d/.test(n);
  // Si el código ya leyó un rango completo, no hay nada que preguntarle al modelo (cada llamada cuesta segundos).
  return pistaHora && horarioPendiente(d) && !(ext.inicio && ext.fin);
}

// Pide el respaldo y aplica solo lo que pasa la validación. Devuelve los campos aplicados (vacío si nada).
async function aplicarRespaldo(conv: Conversacion, texto: string): Promise<string[]> {
  const h = ahora();
  const salida = await pedirRespaldo(texto, { fecha: h.fecha, hora: aHora(h.minutos) });
  if (!salida) return [];
  const v = validarRespaldo(salida, texto, h.fecha);
  const d = conv.datos;
  const campos: string[] = [];
  if (v.sala && d.sala === null) { d.sala = v.sala; campos.push("sala"); }
  if (v.fecha && d.fecha === null) { d.fecha = v.fecha; campos.push("fecha"); }
  if (v.inicio && v.fin && horarioPendiente(d)) { d.inicio = v.inicio; d.fin = v.fin; campos.push("horario"); }
  const descartados = [
    salida.sala && !v.sala ? "sala" : null,
    salida.dia && !v.fecha ? "fecha" : null,
    (salida.inicio || salida.fin) && !(v.inicio && v.fin) ? "horario" : null,
  ].filter((x): x is string => x !== null);
  registrar({ evento: "respaldo_modelo", texto: texto.slice(0, 200), aplicados: campos, descartados });
  return campos;
}

const limpiarCampo = (d: SolicitudReserva, campo: string): void => {
  if (campo === "sala") d.sala = null;
  if (campo === "fecha") d.fecha = null;
  if (campo === "horario") { d.inicio = null; d.fin = null; }
};

// Frase de confirmación: "Sala 1, lunes 9 de noviembre, de 13:00 a 15:00".
const resumenEntendido = (d: SolicitudReserva): string => [
  d.sala ? `Sala ${d.sala.slice(5)}` : null,
  d.fecha ? fechaLarga(d.fecha) : null,
  d.inicio && d.fin ? `de ${d.inicio} a ${d.fin}` : null,
].filter((x): x is string => x !== null).join(", ");

// ── Turno dentro de un flujo de reserva ─────────────────────────────────────
// Hallazgo 3 de la auditoría (16-11-2026): la función tenía ~325 líneas. Ahora `turnoReserva` solo ordena los pasos
// y cada paso es una función con nombre. El ORDEN es la lógica del negocio: no lo cambies sin revisar las pruebas
// (C-xx, ADV, propiedades). Para un caso nuevo, agrega o amplía un paso; no metas ramas en `turnoReserva`.
// Cada paso devuelve una respuesta (corta el turno) o null (sigue al siguiente).

// Estado compartido de un turno: lo que había antes del mensaje y lo que los pasos van marcando.
type TurnoReserva = {
  conv: Conversacion; texto: string; t: string; repo: Repositorio; h: ReturnType<typeof ahora>;
  // 7.0.26: valores antes de este turno, para saber si el mensaje reemplazó fecha, sala o personas.
  previo: {
    pendiente: Conversacion["pendiente"]; fecha: Conversacion["datos"]["fecha"];
    sala: Conversacion["datos"]["sala"]; personas: Conversacion["datos"]["personas"];
  };
  negadas: string[];          // 7.0.27: salas rechazadas en este mensaje
  cambio: boolean;            // el mensaje cambió algún dato
  prefijo: string;            // texto que antecede la respuesta (p. ej. registro hecho)
  salaNegadaAfectada: boolean;
  cambioFecha: boolean;       // 7.0.26: la fecha cambió
  fechaNueva: boolean;        // 7.0.27: la fecha llegó por primera vez en este turno
};

function nuevoTurno(conv: Conversacion, texto: string, repo: Repositorio): TurnoReserva {
  return {
    conv, texto, t: norm(texto), repo, h: ahora(),
    previo: { pendiente: conv.pendiente, fecha: conv.datos.fecha, sala: conv.datos.sala, personas: conv.datos.personas },
    negadas: [], cambio: false, prefijo: "", salaNegadaAfectada: false, cambioFecha: false, fechaNueva: false,
  };
}

async function turnoReserva(conv: Conversacion, texto: string, repo: Repositorio): Promise<RespuestaChat> {
  const tr = nuevoTurno(conv, texto, repo);
  const previo = await dosFechas(tr) ?? await chipsPendientes(tr);
  if (previo) return previo;
  salasDelTexto(tr);
  const ext = extraer(texto, { hoy: tr.h.fecha, pendiente: conv.pendiente });
  // La sala rechazada no se toma aunque el extractor la haya visto en el mismo mensaje («no quiero la sala 13»).
  if (tr.negadas.length && ext.sala && tr.negadas.includes(ext.sala)) ext.sala = null;
  const dudosa = await cantidadesDudosas(tr, ext);
  if (dudosa) return dudosa;
  const espacios = await identidadDeSesion(tr, ext);
  const registro = await registroEnReserva(tr, ext);
  if (registro) return registro;
  aplicarDatosDelTexto(tr, ext, espacios);
  const corte = await salaNegadaConHorario(tr)
    ?? await confirmacionDePropuesta(tr, ext)
    ?? await carneDeLaReserva(tr)
    ?? await ofrecerSiSeEsperaba(tr)
    ?? await respaldoDelModelo(tr, ext);
  if (corte) return corte;
  // Validación temprana: fecha, horario y sala antes de personas, equipos, alto cómputo o materia.
  const temprano = await revisarTemprano(conv, repo);
  if (temprano.corte) return temprano.corte;
  return await aforoTemprano(tr)
    ?? await pedirFaltante(tr, espacios, temprano.ok)
    ?? await proponerOConfirmar(tr);
}

// 7.0.27: dos fechas en un mismo mensaje («mañana y el lunes»). Una reserva es por día: no se elige una en
// silencio; se pregunta cuál y se dejan las dos como botones.
async function dosFechas({ conv, texto, h, repo }: TurnoReserva): Promise<RespuestaChat | null> {
  const dias = fechas(texto, h.fecha);
  if (dias.length <= 1) return null;
  conv.datos.fecha = null;
  conv.validado = null;
  conv.propuesta = null;
  conv.pendiente = "fecha";
  conv.intentos = 0;
  await guardar(repo, conv);
  const etiquetas = dias.map((d) => fechaLarga(d));
  const lista = etiquetas.length === 2
    ? `${etiquetas[0]} o ${etiquetas[1]}`
    : `${etiquetas.slice(0, -1).join(", ")} o ${etiquetas[etiquetas.length - 1]}`;
  return abierto(conv,
    `¿Para cuál día: ${lista}? Una reserva es por día; después puedes hacer la otra.`,
    etiquetas.map((e) => capitalizar(e)));
}

// Chips que responden a una pregunta anterior: "Revisar…", el respaldo del modelo y la sala ocupada.
async function chipsPendientes({ conv, texto, t, h, repo }: TurnoReserva): Promise<RespuestaChat | null> {
  // Chips "Revisar mañana" y "Revisar el {día}": cambian la fecha y conservan el horario pedido.
  if (/^revisar\b/.test(t)) {
    const f = extraer(texto, { hoy: h.fecha, pendiente: null }).fecha;
    if (f) { conv.datos.fecha = f; conv.validado = null; conv.propuesta = null; }
  }
  // Respaldo del modelo pendiente de confirmar (7.0.8): "Sí" lo acepta; cualquier otra respuesta lo descarta.
  if (conv.pendiente === "respaldo") {
    if (!/^(si|es correcto|correcto)\b/.test(t)) for (const c of conv.respaldo ?? []) limpiarCampo(conv.datos, c);
    conv.respaldo = null;
    conv.pendiente = null;
  }
  if (conv.pendiente === "ocupada") {
    if (/\bver otras salas\b/.test(t)) {
      conv.datos.sala = null;
      conv.validado = null;
      // Sin personas no se sabe qué salas alcanzan: se preguntan primero y luego se ofrecen (7.0.9).
      if (conv.datos.personas === null) {
        conv.ofrecer = true;
        conv.pendiente = "personas";
        await guardar(repo, conv);
        return abierto(conv, "Listo, te busco otra sala. Para mostrarte solo las que te sirven, ¿cuántas personas son?", []);
      }
      return ofrecerSalas(conv, repo, "");
    }
    if (/\bescalar al monitor\b/.test(t)) return escalarAlMonitor(conv, repo);
  }
  return null;
}

// Sala en el texto: salas negadas (7.0.27), "cambiar <campo>", "Usar Sala N" y la elección de sala (7.0.9).
function salasDelTexto(tr: TurnoReserva): void {
  const { conv, texto, t } = tr;
  // 7.0.27: salas rechazadas en este mensaje. Se guardan en la conversación, no se asignan ni se vuelven a ofrecer.
  tr.negadas = salasNegadas(texto);
  if (tr.negadas.length) {
    conv.excluidas = [...new Set([...(conv.excluidas ?? []), ...tr.negadas])];
    const afectada = conv.datos.sala ?? conv.propuesta?.sala ?? null;
    if (afectada && tr.negadas.includes(afectada)) {
      conv.datos.sala = null;
      conv.propuesta = null;
      conv.validado = null;
      tr.cambio = true;
      tr.salaNegadaAfectada = true;
    }
  }

  // "cambiar <campo>": se borra ese dato y se vuelve a pedir.
  const cambiar = t.match(/^cambiar (carne|fecha|horario|personas|equipos|sala|materia)\b/);
  if (cambiar) {
    for (const k of CAMBIABLES[cambiar[1]]) vaciarCampo(conv.datos, k);
    conv.propuesta = null;
    tr.cambio = true;
  }

  // "Usar Sala N" (chip o texto): fija la sala y vuelve a evaluar.
  const usar = t.match(/\busar sala\s*-?\s*(1[0-6]|[1-9])\b/);
  if (usar) {
    conv.datos.sala = `sala-${usar[1]}`;
    conv.excluidas = (conv.excluidas ?? []).filter((x) => x !== `sala-${usar[1]}`);
    conv.propuesta = null;
    tr.cambio = true;
  }

  // Eligiendo sala (7.0.9): "13", "la 13", "quiero la 13" o "sala 13" fijan la sala.
  if (!usar && (conv.pendiente === "sala" || conv.ofrecer)) {
    const limpio = t.replace(/[.!?¡¿,;:]/g, " ").trim().replace(/\s+/g, " ");
    // Un número solo es la sala únicamente cuando se está pidiendo la sala; si se piden personas, es la cantidad.
    const n = conv.pendiente === "sala" && /^(1[0-6]|[1-9])$/.test(limpio)
      ? [limpio, limpio]
      : limpio.match(/^(?:(?:quiero|prefiero|mejor|dame|usar|uso|elijo|escojo)\s+)?(?:la|el|sala|laboratorio)\s+(?:sala\s+|laboratorio\s+)?(?:numero\s+)?(1[0-6]|[1-9])$/);
    if (n) {
      conv.datos.sala = `sala-${n[1]}`;
      conv.excluidas = (conv.excluidas ?? []).filter((x) => x !== `sala-${n[1]}`);
      conv.propuesta = null;
      conv.ofrecer = null;
      tr.cambio = true;
    }
  }
  if (usar) conv.ofrecer = null;
}

// Cantidades que no se pueden aplicar: dos sin marcador (7.0.27) o fuera de rango (7.0.25).
async function cantidadesDudosas({ conv, texto, repo }: TurnoReserva, ext: Extraido): Promise<RespuestaChat | null> {
  // 7.0.27: dos cantidades sin marcador («somos 10 o 12») no se resuelven tomando la primera: se pregunta cuál.
  const ambiguas = personasAmbiguas(texto);
  if (ambiguas && !tieneCorreccion(texto)) {
    conv.pendiente = "personas";
    conv.propuesta = null;
    conv.intentos = 0;
    await guardar(repo, conv);
    return abierto(conv, `¿Cuántas personas son: ${ambiguas[0]} o ${ambiguas[1]}?`,
      [String(ambiguas[0]), String(ambiguas[1])]);
  }
  // 7.0.25: «somos 0», «somos -5», «somos 1000» o «equipos 0» se explican antes de tocar los datos: el esquema
  // los rechaza y la conversación terminaba en Error interno. No se aplica el valor inválido.
  const cantidad = await cantidadInvalida(ext, repo);
  if (!cantidad) return null;
  // El valor fuera de rango no se conserva: si `iniciar` ya lo había copiado (mensaje de apertura), se limpia.
  if (conv.datos[cantidad.campo] === ext[cantidad.campo]) conv.datos[cantidad.campo] = null;
  conv.pendiente = cantidad.campo;
  conv.propuesta = null;
  conv.intentos = 0;
  await guardar(repo, conv);
  return abierto(conv, cantidad.texto, preguntaPara(cantidad.campo, docenteDe(conv.datos), conv.datos).opciones);
}

// El carné de la reserva es siempre el de la sesión (inicio de sesión o carné identificado): ni «cambiar carné»
// ni un carné escrito lo reemplazan (hallazgo de fuzzing, 14-11-2026: reservar a nombre de otra persona).
// Devuelve los espacios académicos del docente (plan de identidad, sección 4.5).
async function identidadDeSesion({ conv, repo }: TurnoReserva, ext: Extraido): Promise<string[]> {
  const deSesion = (await repo.leerSesion(conv._id))?.carne ?? null;
  if (deSesion) {
    conv.datos.carne = deSesion;
    ext.carne = null;
  }
  const carneSesion = conv.datos.carne ? await repo.carne(conv.datos.carne) : null;
  const espacios = carneSesion?.rol === "docente" ? carneSesion.espacios : [];
  if (conv.pendiente === "materia" && espacios.length) ext.materia = null;
  return espacios;
}

// Registro dentro de la reserva: "Sí, registrarme" o "No". No usa la confirmación estricta de la reserva.
async function registroEnReserva(tr: TurnoReserva, ext: Extraido): Promise<RespuestaChat | null> {
  const { conv, t, repo } = tr;
  if (conv.pendiente !== "registro") return null;
  if (ext.confirmacion === "si" || /^si\b/.test(t)) {
    const d = await registrarUsuarioDesde(conv.datos.carne!, repo);
    if (d.reglas_aplicadas.includes("R26")) {
      tr.prefijo = `Listo, quedaste registrado como ${conv.datos.carne!.startsWith("D-") ? "docente" : "estudiante"} con el carné ${conv.datos.carne}. `;
    }
    conv.pendiente = null;
    tr.cambio = true;
  } else if (ext.confirmacion === "no") {
    await repo.borrarConversacion(conv._id);
    return cerrado("cancelar", "Sin registro no puedo separar la sala. Cancelé la solicitud. No se guardó nada.");
  }
  return null;
}

// Pasa los datos del mensaje a la conversación y marca qué cambió (7.0.26 y 7.0.27).
function aplicarDatosDelTexto(tr: TurnoReserva, ext: Extraido, espacios: string[]): void {
  const { conv, texto, t, previo } = tr;
  // Chip "El mismo número de estudiantes" para los equipos.
  if (conv.pendiente === "equipos" && conv.datos.equipos === null && conv.datos.personas !== null
    && /\bmismo numero\b/.test(t)) {
    conv.datos.equipos = conv.datos.personas;
    tr.cambio = true;
  }

  tr.cambio = aplicar(conv.datos, ext, true) || tr.cambio;
  // 7.0.27: en la confirmación, un rango nuevo reemplaza las horas de la propuesta y se vuelve a revisar.
  const rangoNuevo = previo.pendiente === "confirmar" && ext.inicio !== null && ext.fin !== null
    && (conv.datos.inicio !== ext.inicio || conv.datos.fin !== ext.fin);
  if (rangoNuevo) {
    conv.datos.inicio = ext.inicio;
    conv.datos.fin = ext.fin;
    tr.cambio = true;
  }
  // 7.0.26: una fecha, sala o personas explícitas distintas reemplazan a las anteriores. Se borra la validación
  // temprana y la propuesta para que `revisarTemprano` vuelva a comprobar R15, ocupación y R28.
  tr.cambioFecha = previo.fecha !== null && conv.datos.fecha !== null && conv.datos.fecha !== previo.fecha;
  // 7.0.27: la fecha llegó por primera vez en este turno (antes no había): el texto dice «Listo, mañana (…)».
  tr.fechaNueva = previo.fecha === null && conv.datos.fecha !== null && ext.fecha === conv.datos.fecha
    && previo.pendiente === "fecha";
  if (tr.cambioFecha || rangoNuevo || conv.datos.sala !== previo.sala || conv.datos.personas !== previo.personas) {
    conv.validado = null;
    conv.propuesta = null;
  }
  if (conv.pendiente === "materia" && espacios.length) {
    const eleccion = elegirEspacio(texto, espacios);
    if (eleccion) {
      conv.datos.materia = eleccion;
      tr.cambio = true;
    }
  }
  if (tr.cambio && conv.propuesta) conv.propuesta = null;

  // 7.0.27: una hora suelta («mejor a las 4») no decide el rango: se pide completo y se conserva la fecha.
  if (previo.pendiente === "confirmar" && horaSuelta(texto)) {
    conv.datos.inicio = null;
    conv.datos.fin = null;
    conv.propuesta = null;
    conv.validado = null;
    conv.pendiente = "horario";
    conv.intentos = 0;
    tr.cambio = true;
  }
}

// Una sala rechazada en este turno: no se toma. Si ya había fecha y horario, se ofrecen otras (sin la rechazada).
async function salaNegadaConHorario({ conv, repo, salaNegadaAfectada }: TurnoReserva): Promise<RespuestaChat | null> {
  if (salaNegadaAfectada && !conv.datos.sala && conv.datos.fecha && conv.datos.inicio && conv.datos.fin) {
    return ofrecerSalas(conv, repo, "");
  }
  return null;
}

// Confirmación de la propuesta: solo un afirmativo puro confirma; una contradicción no se interpreta.
async function confirmacionDePropuesta({ conv, repo, cambio }: TurnoReserva, ext: Extraido): Promise<RespuestaChat | null> {
  if (conv.pendiente !== "confirmar" || !conv.propuesta || cambio) return null;
  if (ext.confirmacion === "si") return confirmar(conv, repo);
  if (ext.confirmacion === "no") {
    conv.propuesta = null;
    conv.datos.inicio = null;
    conv.datos.fin = null;
    conv.datos.sala = null;
    conv.pendiente = "horario";
    conv.intentos = 0;
    await guardar(repo, conv);
    const p = preguntaPara("horario", docenteDe(conv.datos));
    return abierto(conv, "Listo, no la separé. ¿Quieres otro horario u otra sala?", p.opciones);
  }
  conv.intentos = 0;
  await guardar(repo, conv);
  return abierto(conv, "No entendí si confirmas. ¿Confirmo la reserva?", ["Sí, confirmar", "No"]);
}

// El carné se evalúa apenas llega: vencido (R16) o desconocido (R17) cierran el flujo en este mismo mensaje.
async function carneDeLaReserva({ conv, repo, prefijo }: TurnoReserva): Promise<RespuestaChat | null> {
  if (!conv.datos.carne) return null;
  const estado = await estadoCarne(conv.datos.carne, repo);
  if (estado === "vencido") {
    await repo.borrarConversacion(conv._id);
    return cerrado("solicitud_reserva", prefijo + TEXTO_VENCIDO);
  }
  if (estado === "desconocido") {
    await repo.notificar(avisoCarne(conv.datos));
    await repo.borrarConversacion(conv._id);
    return cerrado("solicitud_reserva", prefijo + TEXTO_DESCONOCIDO);
  }
  return null;
}

// "Ver otras salas" esperaba las personas: ya se pueden ofrecer las salas que alcanzan (7.0.9).
async function ofrecerSiSeEsperaba({ conv, repo }: TurnoReserva): Promise<RespuestaChat | null> {
  if (conv.ofrecer && conv.datos.personas !== null && !conv.datos.sala && claveHorario(conv.datos)) {
    return ofrecerSalas(conv, repo, "");
  }
  return null;
}

// Respaldo del modelo (7.0.8): solo si el código no entiende la sala o el horario. Se confirma antes de usarlo.
async function respaldoDelModelo({ conv, texto, repo }: TurnoReserva, ext: Extraido): Promise<RespuestaChat | null> {
  if (!necesitaRespaldo(texto, ext, conv.datos, conv.pendiente)) return null;
  const campos = await aplicarRespaldo(conv, texto);
  if (!campos.length) return null;
  conv.respaldo = campos;
  conv.pendiente = "respaldo";
  await guardar(repo, conv);
  return abierto(conv, `Entendí: ${resumenEntendido(conv.datos)}. ¿Es correcto?`, ["Sí", "Corregir"]);
}

// Aforo temprano (7.0.9): con sala y personas, si no alcanza se ofrecen otras salas antes de pedir más datos.
// Estudiantes: un equipo por persona. Docentes: solo el aforo (los equipos se piden después).
async function aforoTemprano({ conv, repo }: TurnoReserva): Promise<RespuestaChat | null> {
  const aforo = await aforoInsuficiente(conv.datos, repo, conv.excluidas);
  if (!aforo) return null;
  conv.datos.sala = null;
  conv.validado = null;
  return ofrecerSalas(conv, repo, aforo);
}

// Tres turnos seguidos sin entender el dato cierran la solicitud.
async function sinEntenderTresVeces(conv: Conversacion, repo: Repositorio): Promise<RespuestaChat | null> {
  conv.intentos += 1;
  if (conv.intentos < 3) return null;
  await repo.borrarConversacion(conv._id);
  return cerrado("solicitud_reserva", "No entendí el dato. Empecemos de nuevo cuando quieras.");
}

// Falta un dato: se pide (con el aviso de la validación temprana, si lo hubo).
async function pedirFaltante(tr: TurnoReserva, espacios: string[], avisoTemprano: string | undefined): Promise<RespuestaChat | null> {
  const { conv, repo, h, prefijo, cambio } = tr;
  const f = await faltante(conv.datos, repo);
  if (!f) return null;
  if (!cambio && tr.previo.pendiente) {
    const cierre = await sinEntenderTresVeces(conv, repo);
    if (cierre) return cierre;
  } else {
    conv.intentos = 0;
  }
  conv.pendiente = f;
  await guardar(repo, conv);
  const p = f === "materia" && espacios.length
    ? { texto: "¿Para cuál espacio académico la requieres?", opciones: espacios }
    : preguntaPara(f, docenteDe(conv.datos), conv.datos);
  // 7.0.26: la fecha se cambió y aún falta el horario. Se confirma el cambio y se pregunta exactamente por él;
  // la revisión temprana de R15/ocupación/R28 corre en el turno que traiga las horas.
  // 7.0.27: si no había una fecha antes, no es un «cambio»: se dice «Listo, mañana (…)» y se pide el rango.
  if (f === "horario" && (tr.cambioFecha || tr.fechaNueva)) {
    const nueva = conv.datos.fecha!;
    const cuando = nueva === sumarDias(h.fecha, 1)
      ? `a mañana (${fechaLarga(nueva)})`
      : `al ${fechaLarga(nueva)}`;
    const arranque = tr.cambioFecha
      ? `Listo, cambio ${cuando}.`
      : nueva === sumarDias(h.fecha, 1)
        ? `Listo, mañana (${fechaLarga(nueva)}).`
        : `Listo, el ${fechaLarga(nueva)}.`;
    const pregunta = conv.datos.inicio && !conv.datos.fin ? p.texto : "¿De qué hora a qué hora?";
    return abierto(conv, `${prefijo}${arranque} ${pregunta}`, p.opciones);
  }
  const aviso = avisoTemprano ? `${avisoTemprano}Ahora, ${minusculaInicial(p.texto)}` : p.texto;
  return abierto(conv, prefijo + aviso, p.opciones);
}

// Datos completos: se evalúa (propuesta nueva) o se vuelve a pedir la confirmación de la propuesta vigente.
async function proponerOConfirmar({ conv, repo, prefijo, cambio }: TurnoReserva): Promise<RespuestaChat> {
  conv.intentos = 0;
  if (!conv.propuesta) return evaluar(conv, repo, prefijo);
  // Hay propuesta y no cambió nada: se vuelve a pedir la confirmación.
  if (!cambio) {
    const cierre = await sinEntenderTresVeces(conv, repo);
    if (cierre) return cierre;
  }
  conv.pendiente = "confirmar";
  await guardar(repo, conv);
  const sol = solicitudDe(conv.datos);
  return abierto(conv, propuestaTexto(sol, conv.propuesta.sala, await repo.salas()), ["Sí, confirmar", "No"]);
}

// Turno dentro de un flujo de registro ("Soy nuevo").
async function turnoRegistro(conv: Conversacion, texto: string, repo: Repositorio): Promise<RespuestaChat> {
  const ext = extraer(texto, { hoy: ahora().fecha, pendiente: "carne" });
  if (!ext.carne) {
    conv.intentos += 1;
    if (conv.intentos >= 3) {
      await repo.borrarConversacion(conv._id);
      return cerrado("registro_usuario", "No entendí el dato. Empecemos de nuevo cuando quieras.");
    }
    await guardar(repo, conv);
    return abierto(conv, preguntaPara("carne", false).texto, ["Soy nuevo"]);
  }
  const carneDoc = await repo.carne(ext.carne);
  const d = await registrarUsuarioDesde(ext.carne, repo);
  await repo.borrarConversacion(conv._id);
  const rol = carneDoc?.rol ?? "estudiante";
  if (d.reglas_aplicadas.includes("R16")) {
    return cerrado("registro_usuario", "Tu carné está vencido en carnetización. Remítete a carnetización.");
  }
  if (d.reglas_aplicadas.includes("R17")) {
    await repo.notificar(avisoCarne({ ...VACIA(), carne: ext.carne }));
    return cerrado("registro_usuario", "No puedo registrarlo con los datos que hay: el carné no aparece en carnetización o su vigencia es desconocida. Avisé al monitor.");
  }
  if (d.reglas_aplicadas.includes("R26")) {
    return cerrado("registro_usuario", `Listo, quedaste registrado como ${rol} con el carné ${ext.carne}. ¿Quieres reservar una sala?`, ["Reservar una sala"]);
  }
  return cerrado("registro_usuario", `Ya estás registrado como ${rol}. ¿Quieres reservar una sala?`, ["Reservar una sala"]);
}

// Disponibilidad: sin flujo. Contexto de la consulta (30 min, TTL): criterios, duración pedida y, si hay oferta,
// el día ofrecido en datos.fecha (pendiente "oferta_dia"). Sin carné ni sala.
async function guardarContextoDisponibilidad(
  repo: Repositorio, sesion: string, datos: SolicitudReserva, pendiente: string | null = null, duracion: number | null = null,
): Promise<void> {
  const guardados: SolicitudReserva = {
    ...VACIA(), fecha: datos.fecha, inicio: datos.inicio, fin: datos.fin,
    personas: datos.personas, equipos: datos.equipos, computo_alto: datos.computo_alto,
  };
  // 7.0.25: ningún dato fuera del esquema llega a guardarse (el guardado valida con Zod y lanzaría un 500).
  sanear(guardados);
  await repo.guardarConversacion({
    _id: sesion, flujo: "disponibilidad", pendiente,
    datos: guardados,
    duracion_min: duracion,
    intentos: 0, propuesta: null, actualizado: new Date(),
  });
}

const MESES_TXT = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// "11 de noviembre" (para chips y frases cortas).
const diaCorto = (f: string): string => `${Number(f.slice(8))} de ${MESES_TXT[Number(f.slice(5, 7)) - 1]}`;
// Chip para revisar otro día: "Revisar mañana" o "Revisar el 11 de noviembre".
const chipRevisar = (f: string, hoyFecha: string): string =>
  (f === sumarDias(hoyFecha, 1) ? "Revisar mañana" : `Revisar el ${diaCorto(f)}`);

// Duración legible: "30 minutos", "1 hora", "1 hora y media", "5 horas", "3 horas y media".
function duracionTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} minutos`;
  const horas = h === 1 ? "1 hora" : `${h} horas`;
  if (!m) return horas;
  return m === 30 ? `${horas} y media` : `${horas} y ${m} minutos`;
}

// Duración de la consulta: el rango si lo trae; si no, la duración pedida; si no, 30 minutos.
const duracionPedida = (ext: Extraido): number =>
  ext.inicio && ext.fin ? aMin(ext.fin) - aMin(ext.inicio) : (ext.duracion_min ?? 30);

// Salas que cumplen la solicitud de disponibilidad en un día: candidatas() con los criterios y, si no hay rango,
// un hueco continuo de N minutos (plan de rango horario, 3.2).
function salasQueCumplen(c: SolicitudReserva, N: number, ctx: Contexto, fecha: string, desde: number): SalaDoc[] {
  const cumplen = candidatas({ ...c, fecha, sala: null }, ctx);
  if (c.inicio && c.fin) return cumplen;
  return cumplen.filter((s) => rangosDesde(disponibilidad(s, fecha, ctx.reservasDelDia, ctx).libres, desde, N).length > 0);
}

// Día más cercano después de `desde` (hasta 30 días desde hoy) con salas que cumplan la solicitud. null si no hay.
async function diaMasCercano(c: SolicitudReserva, N: number, desde: string, repo: Repositorio): Promise<string | null> {
  const tope = sumarDias(ahora().fecha, 30);
  for (let k = 1; k <= 30; k++) {
    const f = sumarDias(desde, k);
    if (f > tope) break;
    const ctx = await contextoPara(repo, null, f);
    if (salasQueCumplen(c, N, ctx, f, 0).length) return f;
  }
  return null;
}

// Texto que reproduce los criterios guardados, para revisar otra fecha con los mismos datos.
function textoCriterios(d: SolicitudReserva, duracion: number | null): string {
  const rango = d.inicio && d.fin;
  return [
    "salas",
    d.fecha ?? "",
    rango ? `de ${d.inicio} a ${d.fin}` : "",
    d.personas !== null ? `para ${d.personas} personas` : "",
    d.computo_alto ? "alto cómputo" : "",
    !rango && duracion ? `por ${duracion} minutos` : "",
  ].filter(Boolean).join(" ");
}

// Disponibilidad (sección 7.0.3 y plan de rango horario, 3.2): criterios del texto (fecha, horario o duración,
// personas, alto cómputo). Si el día no tiene salas, ofrece el día más cercano que sí las tenga.
async function disponibilidadTurno(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat> {
  const h = ahora();
  const ext = extraer(texto, { hoy: h.fecha, pendiente: null });
  const fecha = ext.fecha ?? h.fecha;
  // Si la fecha es hoy, solo cuenta desde la hora actual (no se ofrecen horas que ya pasaron).
  const desde = fecha === h.fecha ? h.minutos : 0;
  const ctx = await contextoPara(repo, null, fecha);
  const reservas = ctx.reservasDelDia;
  const N = duracionPedida(ext);
  // 7.0.25: la disponibilidad aplica R15 antes de listar salas, con el mismo mensaje que la reserva. Un horario
  // inválido no se guarda: el chip «Reservar Sala 13» después no debe arrastrarlo al flujo de reserva.
  if (ext.inicio && ext.fin) {
    const causa = causaR15(fecha, ext.inicio, ext.fin, { fecha: h.fecha, minutos: h.minutos });
    if (causa) {
      await repo.borrarConversacion(sesion);
      const texto = causa.campo === "horario" && causa.motivo.startsWith("las salas abren de")
        ? `${capitalizar(causa.motivo)}: elige un rango dentro de ese horario.`
        : `${capitalizar(causa.motivo)}.`;
      return cerrado("consulta_disponibilidad", texto);
    }
  }
  // Mismo control de personas y equipos que la reserva: ningún dato fuera del esquema llega a guardarse.
  const cantidad = await cantidadInvalida(ext, repo);
  if (cantidad) {
    await repo.borrarConversacion(sesion);
    return cerrado("consulta_disponibilidad", cantidad.texto);
  }
  const criterios: SolicitudReserva = {
    carne: null, fecha, inicio: ext.inicio, fin: ext.fin, sala: null,
    personas: ext.personas, equipos: ext.equipos, computo_alto: ext.computo_alto, materia: null,
  };
  await guardarContextoDisponibilidad(repo, sesion, criterios, null, ext.inicio && ext.fin ? null : ext.duracion_min);

  if (ext.sala) {
    const sala = ctx.salas.find((s) => s._id === ext.sala);
    if (!sala) return cerrado("consulta_disponibilidad", "No encuentro esa sala.");
    const d = disponibilidad(sala, fecha, reservas, ctx);
    const libresSala = rangosDesde(d.libres, desde, 30);
    const lineas = [
      `${sala.nombre} · ${sala.capacidad} puestos · ${d.operativos} equipos operativos · ${sala.computo === "alto" ? "alto cómputo" : "estándar"}`,
      ...(d.ocupadas.length
        ? d.ocupadas.map((o) => `Ocupada: ${o.inicio}–${o.fin} (${o.tipo}, ${o.personas} personas)`)
        : ["Sin reservas ese día."]),
      libresSala.length
        ? `Libre${fecha === h.fecha ? ` desde las ${aHora(desde)}` : ""}: ${libresSala.join(", ")}`
        : "Libre: no hay un hueco de 30 minutos o más.",
    ];
    return cerrado("consulta_disponibilidad", `${fechaLarga(fecha)}\n${lineas.join("\n")}`,
      [`Reservar ${sala.nombre}`], {
        disponibilidad: { sala: sala._id, fecha, ocupadas: d.ocupadas.map(ocupadaPublica), libres: d.libres, operativos: d.operativos, inciertos: d.inciertos },
      });
  }

  const hayCriterios = ext.inicio !== null || ext.personas !== null || ext.computo_alto === true;
  const diaTxt = `${fechaLarga(fecha)}${ext.inicio && ext.fin ? ` de ${ext.inicio} a ${ext.fin}` : ""}`;
  const cuandoLista = fecha === h.fecha
    ? `hoy (${fechaLarga(fecha)}) a partir de las ${aHora(desde)}`
    : `el ${fechaLarga(fecha)}`;
  const cumplen = salasQueCumplen(criterios, N, ctx, fecha, desde);

  if (!cumplen.length) {
    // Pidió alto cómputo y ninguna sala de alto cumple: se ofrecen las estándar que cumplen el resto.
    const alto = criterios.computo_alto === true;
    const estandar = hayCriterios && alto
      ? salasQueCumplen({ ...criterios, computo_alto: false }, N, ctx, fecha, desde).filter((s) => s.computo === "estandar").slice(0, 6)
      : [];
    const extra = estandar.length ? `\nSalas estándar que sí cumplen: ${estandar.map((s) => etiquetaSala(s)).join(", ")}.` : "";
    const base = hayCriterios
      ? `Ninguna sala cumple esas condiciones el ${diaTxt}.${extra}`
      : `No hay salas con ${duracionTexto(N)} libres seguidas ${cuandoLista}.`;
    const dia = await diaMasCercano(criterios, N, fecha, repo);
    if (!dia) return cerrado("consulta_disponibilidad", base, estandar.map((s) => `Reservar ${etiquetaSala(s)}`));
    // Oferta del día más cercano: guarda los criterios y el día ofrecido; "Sí" lo revisa con los mismos datos.
    await guardarContextoDisponibilidad(repo, sesion, { ...criterios, fecha: dia }, "oferta_dia", ext.inicio && ext.fin ? null : N);
    const opcion = dia === sumarDias(h.fecha, 1) ? "Sí, revisar mañana" : `Sí, revisar el ${diaCorto(dia)}`;
    return cerrado("consulta_disponibilidad",
      `${base} El día más cercano con salas libres es el ${fechaLarga(dia)}. ¿Lo reviso?`, [opcion]);
  }

  if (hayCriterios) {
    const alto = criterios.computo_alto === true;
    const mostradas = cumplen.slice(0, 6);
    const resto = cumplen.length - mostradas.length;
    const criterioTxt = `${diaTxt}${ext.personas !== null ? `, ${ext.personas} personas` : ""}${alto ? ", alto cómputo" : ""}`;
    const lineas = mostradas.map((s) =>
      `• ${etiquetaSala(s)} · ${s.capacidad} puestos · ${disponibilidad(s, fecha, reservas, ctx).operativos} equipos operativos · ${s.computo === "alto" ? "alto cómputo" : "estándar"}`);
    const mas = resto > 0 ? `\ny ${resto} salas más: acota con un horario o con el número de personas.` : "";
    return cerrado("consulta_disponibilidad", `Para el ${criterioTxt}, estas salas cumplen:\n${lineas.join("\n")}${mas}`,
      mostradas.map((s) => `Reservar ${etiquetaSala(s)}`));
  }

  // Sin otros criterios: salas con un hueco continuo de N minutos, leídas de la base.
  const todas = /\btodas\b/.test(norm(texto));
  const conHueco = ctx.salas
    .slice()
    .sort((a, b) => Number(a._id.slice(5)) - Number(b._id.slice(5)))
    .map((s) => ({ s, rangos: rangosDesde(disponibilidad(s, fecha, reservas, ctx).libres, desde, N) }))
    .filter((x) => x.rangos.length > 0);
  // Por defecto se muestran 6; el resto se anuncia y se ofrece "Ver todas (día)" (no se corta en silencio).
  // El chip lleva el día: "Ver todas" sin fecha volvería a preguntar por hoy aunque la lista fuera de mañana.
  const etiquetaDia = fecha === h.fecha ? "hoy" : fecha === sumarDias(h.fecha, 1) ? "mañana" : fecha;
  const mostradas = todas ? conHueco : conHueco.slice(0, 6);
  const resto = conHueco.length - mostradas.length;
  const lineas = mostradas.map((x) => `• ${x.s.nombre}: ${x.rangos.join(", ")}`);
  const mas = resto > 0 ? `\ny ${resto} salas más.` : "";
  return cerrado("consulta_disponibilidad", `Salas con ${duracionTexto(N)} libres seguidas ${cuandoLista}:\n${lineas.join("\n")}${mas}`,
    [...mostradas.map((x) => `Reservar ${x.s.nombre}`), ...(resto > 0 ? [`Ver todas (${etiquetaDia})`] : [])]);
}

// "Sala N" sin el texto del nombre (el de alto cómputo no va en la lista).
const etiquetaSala = (s: SalaDoc): string => `Sala ${s._id.slice(5)}`;

// Rangos libres de al menos `minimo` minutos, recortados a partir de `desde` (minuto del día).
function rangosDesde(libres: { inicio: string; fin: string }[], desde: number, minimo: number): string[] {
  return libres
    .map((l) => ({ inicio: Math.max(aMin(l.inicio), desde), fin: aMin(l.fin) }))
    .filter((l) => l.fin - l.inicio >= minimo)
    .map((l) => `${aHora(l.inicio)}–${aHora(l.fin)}`);
}

// Estado de las salas según la base, para "¿qué salas tienen cupo?" y "estado de las salas".
export async function estadoSalasDeBase(repo: Repositorio): Promise<string> {
  const h = ahora();
  const salas = await repo.salas();
  const equipos = await repo.equipos();
  const reservasHoy = await repo.reservasDelDia(h.fecha);
  const ocupadas = salas.filter((s) =>
    reservasHoy.some((r) => r.sala === s._id && r.inicio_min <= h.minutos && h.minutos < r.fin_min));
  const operativos = equipos.filter((q) => claseEquipo(q) === "operativo").length;
  const conflicto = salas.filter((s) => estadoSala(s, equipos).contradictorio);
  const desconocido = salas.filter((s) => estadoSala(s, equipos).desconocido);
  const lista = (xs: { nombre: string }[]) => (xs.length ? xs.map((s) => s.nombre).join(", ") : "ninguna");
  return [
    `Ahora (${aHora(h.minutos)}, ${fechaLarga(h.fecha)}):`,
    `• Salas ocupadas: ${ocupadas.length} de ${salas.length}${ocupadas.length ? ` (${lista(ocupadas)})` : ""}.`,
    `• Salas libres ahora: ${salas.length - ocupadas.length}.`,
    `• Equipos operativos: ${operativos} de ${equipos.length}.`,
    `• Con conflicto entre fuentes: ${lista(conflicto)}.`,
    `• Con dato desconocido: ${lista(desconocido)}.`,
    "Para otro día, pregunta por ejemplo: ¿qué salas están ocupadas el viernes?",
  ].join("\n");
}

// Sección 7.0.4: una pregunta con fecha sobre salas no es el estado de "ahora".
// Ocupación si habla de ocupadas/reservadas o trae dos fechas o más; disponibilidad si trae una sola fecha.
export function rutaPorFecha(texto: string, exigirSala = true): "ocupacion" | "disponibilidad" | null {
  const t = norm(texto);
  if (exigirSala && !/\b(salas?|laboratorios?)\b/.test(t)) return null;
  const fs = fechas(texto, ahora().fecha);
  if (!fs.length) return null;
  return /\b(ocupad|reservad|tomad)\w*/.test(t) || fs.length >= 2 ? "ocupacion" : "disponibilidad";
}

// 7.0.25: «¿quién reservó la sala 13?» o «¿qué materia hay en la sala 5?» no son «fuera de alcance»: se responde
// la ocupación sin nombres, carnés ni materias. Se reconoce por el texto, sin depender del modelo (el prompt del
// intérprete está en el tope de caracteres, así que la línea no cabe allí).
// «quién reservó», «quién tiene la sala», «qué materia hay», «a nombre de quién»: pide datos de la reserva.
// No entra «quién puede reservar» (es una pregunta de cómo funciona, no de una reserva concreta).
const PIDE_DATOS_RESERVA = /\b(quien(es)?\s+(reserv\w*|tiene[n]?|ocup\w*|esta\w*)|que materia|cual materia|a nombre de|que docente|cual docente)\b/;

export async function ocupacionPrivadaTurno(texto: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const h = ahora();
  const e = extraer(texto, { hoy: h.fecha, pendiente: null });
  if (!e.sala || !PIDE_DATOS_RESERVA.test(norm(texto))) return null;
  const fecha = e.fecha ?? h.fecha;
  const etiqueta = `Sala ${e.sala.slice(5)}`;
  const rs = (await repo.reservasDelDia(fecha, e.sala)).slice().sort((a, b) => a.inicio_min - b.inicio_min);
  const cuando = fecha === h.fecha ? "hoy" : `el ${fechaLarga(fecha)}`;
  const prefijo = "No comparto quién reserva ni la materia. ";
  if (!rs.length) {
    return cerrado("consulta_disponibilidad", `${prefijo}La ${etiqueta} no tiene reservas ${cuando}.`, ["Ver disponibilidad"]);
  }
  const bloques = rs.map((r) =>
    `${r.inicio} a ${r.fin} por ${r.rol === "docente" ? "un docente" : "un grupo de estudiantes"}`);
  const detalle = bloques.length === 1
    ? `La ${etiqueta} está ocupada ${cuando} de ${bloques[0]}.`
    : `La ${etiqueta} tiene reservas ${cuando}: ${bloques.join("; ")}.`;
  return cerrado("consulta_disponibilidad", `${prefijo}${detalle}`, ["Ver disponibilidad"]);
}

// Ocupación por día, leída de la base: qué salas están reservadas y a qué hora. Sin carnés.
export async function ocupacionTurno(texto: string, sesion: string | undefined, repo: Repositorio): Promise<RespuestaChat> {
  const h = ahora();
  const fs = fechas(texto, h.fecha);
  const dias = fs.length ? fs : [h.fecha];
  const salas = await repo.salas();
  const { abre, cierra } = horarioLaboratorio();
  const bloques: string[] = [];
  for (const f of dias) {
    const titulo = fechaLarga(f).replace(/^./, (c) => c.toUpperCase());
    const rs = (await repo.reservasDelDia(f)).slice().sort((a, b) => a.inicio_min - b.inicio_min);
    if (!rs.length) {
      bloques.push(`${titulo}: sin reservas; las ${salas.length} salas están libres de ${abre} a ${cierra}.`);
      continue;
    }
    const usadas = new Set(rs.map((r) => r.sala)).size;
    bloques.push([
      `${titulo} (${rs.length} ${rs.length === 1 ? "reserva" : "reservas"}):`,
      ...rs.map((r) => `• Sala ${r.sala.slice(5)} · ${r.inicio}–${r.fin} · ${r.rol === "docente" ? "docente" : "estudiantes"}`),
      `Las otras ${salas.length - usadas} salas están libres todo el día.`,
    ].join("\n"));
  }
  if (sesion) {
    await guardarContextoDisponibilidad(repo, sesion, {
      carne: null, fecha: dias[0], inicio: null, fin: null, sala: null,
      personas: null, equipos: null, computo_alto: null, materia: null,
    });
  }
  return cerrado("consulta_disponibilidad", bloques.join("\n\n"), ["Reservar una sala"]);
}

// Un mensaje dentro de un flujo abierto (o "cancelar" para abortarlo).
// Respuesta a la oferta de día (7.0.6 y plan de rango horario, 4): "Sí" revisa el día ofrecido con los mismos
// criterios guardados; nunca hereda la fecha de hoy.
async function respuestaOferta(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const t = norm(texto).trim();
  const ext = extraer(texto, { hoy: ahora().fecha, pendiente: null });
  if (ext.sala !== null || ext.inicio !== null || /\b(reserv\w*|separ\w*|apart\w*|agend\w*)\b/.test(t)) {
    return iniciar("reserva", texto, sesion, repo);
  }
  if (/^no\b/.test(t)) {
    await repo.borrarConversacion(sesion);
    return cerrado("consulta_disponibilidad", "De acuerdo. ¿Quieres revisar otro día u horario?");
  }
  if (/^(si|claro|vale|dale|ok|okay|bueno|revisa|quiero)\b/.test(t) || /\brevis\w*/.test(t)) {
    const previo = await repo.leerConversacion(sesion);
    const texto2 = previo ? textoCriterios(previo.datos, previo.duracion_min ?? null) : texto;
    return disponibilidadTurno(texto2, sesion, repo);
  }
  // Otra cosa: la oferta se cierra y el mensaje sigue su curso normal.
  await repo.borrarConversacion(sesion);
  return null;
}

// 7.0.27: un mensaje que trae datos de una reserva nueva y un pedido de cancelación («reserva la sala 4 mañana de
// 2 a 4 y cancela RS-0004») se atiende de a una cosa. Se ofrecen los dos caminos como botones; la cancelación solo
// se nombra si la reserva es del carné de la sesión (nunca se revela una RS ajena).
const PIDE_RESERVAR = /\b(?:reservar|separar|apartar|agendar|programar|reservo|separo|aparto|agendo)\b|\breserva\s+(?:la\s+|una\s+|el\s+|mi\s+)?(?:sala|laboratorio)\b/;
export async function mixtoTurno(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const t = norm(texto);
  if (!PIDE_CANCELAR.test(t) || !hablaDeReserva(texto) || !PIDE_RESERVAR.test(t)) return null;
  const h = ahora();
  const e = extraer(texto, { hoy: h.fecha, pendiente: null });
  if (!e.sala || !e.fecha || !e.inicio || !e.fin) return null;
  const carne = (await repo.leerSesion(sesion))?.carne ?? null;
  if (!carne) return null;
  const codigo = codigoDe(texto);
  const nombre = `Sala ${e.sala.slice(5)}`;
  const cuando = e.fecha === sumarDias(h.fecha, 1) ? "mañana" : `el ${fechaLarga(e.fecha)}`;
  const reservar = `Reservar la ${nombre} ${cuando} de ${e.inicio} a ${e.fin}`;
  const ajena = codigo ? await repo.reservaPorCodigo(codigo) : null;
  if (codigo && ajena && ajena.carne === carne) {
    return cerrado("aclaracion",
      `Hagamos una cosa a la vez. ¿Qué prefieres: reservar o cancelar ${codigo}?`,
      [reservar, `Cancelar ${codigo}`]);
  }
  return cerrado("aclaracion",
    `Hagamos una cosa a la vez. ¿Reservo la ${nombre} ${cuando} de ${e.inicio} a ${e.fin}?`, [reservar]);
}

export async function continuar(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const conv = await repo.leerConversacion(sesion);
  // El contexto de una disponibilidad no es un flujo abierto, salvo la oferta de mañana.
  if (conv?.flujo === "disponibilidad") {
    return conv.pendiente === "oferta_dia" ? respuestaOferta(texto, sesion, repo) : null;
  }
  if (!conv) return null;
  // Dos pedidos en un mismo mensaje (reservar y cancelar): se atiende uno a la vez.
  const mixto = await mixtoTurno(texto, sesion, repo);
  if (mixto) return mixto;
  // «cancelar», «cancélalo», «olvídalo», «ya no quiero», «salir» (anclado, 7.0.24): cierra la solicitud.
  if (esCancelar(texto)) {
    await repo.borrarConversacion(sesion);
    return cerrado("cancelar", "Cancelé la solicitud. No se guardó nada.");
  }
  // Pedir algo sobre una reserva (cancelarla o que se la pasen) no cierra la solicitud: se atiende por R27.
  if (PIDE_CANCELAR.test(norm(texto)) && hablaDeReserva(texto)) {
    return conv.pendiente === "ocupada" ? reservaAjenaTurno(conv, repo) : cancelacionTurno(texto, sesion, repo);
  }
  return conv.flujo === "registro" ? turnoRegistro(conv, texto, repo) : turnoReserva(conv, texto, repo);
}

// Abre un flujo nuevo: "reserva", "registro" o "disponibilidad".
// Abre un flujo nuevo: "reserva", "registro" o "disponibilidad".
export async function iniciar(
  flujo: "reserva" | "registro" | "disponibilidad", texto: string, sesion: string, repo: Repositorio,
): Promise<RespuestaChat> {
  if (flujo === "disponibilidad") return disponibilidadTurno(texto, sesion, repo);
  if (flujo === "registro") {
    const conv: Conversacion = {
      _id: sesion, flujo, pendiente: "carne", datos: VACIA(), intentos: 0, propuesta: null, excluidas: [], actualizado: new Date(),
    };
    if (extraer(texto, { hoy: ahora().fecha, pendiente: "carne" }).carne) return turnoRegistro(conv, texto, repo);
    await guardar(repo, conv);
    return abierto(conv, preguntaPara("carne", false).texto, ["Soy nuevo"]);
  }
  // Reserva: el carné viene de la sesión identificada (plan de identidad, sección 4.5). Lo que trae el mensaje
  // gana; lo que falta se toma de la disponibilidad reciente de la sesión.
  const previo = await repo.leerConversacion(sesion);
  const usado = previo && previo.flujo === "disponibilidad" ? previo.datos : null;
  const oferta = previo?.flujo === "disponibilidad" && previo.pendiente === "oferta_dia";
  const datos = VACIA();
  datos.carne = (await repo.leerSesion(sesion))?.carne ?? null;
  aplicar(datos, extraer(texto, { hoy: ahora().fecha, pendiente: null }));
  const tomados: string[] = [];
  const h = ahora();
  if (usado) {
    // Una fecha de hoy no se hereda si el horario que quedaría ya pasó.
    const inicioFinal = datos.inicio ?? usado.inicio;
    const yaPaso = inicioFinal !== null && aMin(inicioFinal) <= h.minutos;
    if (oferta) {
      // La oferta fija el día ofrecido (no hereda la fecha de hoy).
      if (datos.fecha === null && usado?.fecha) { datos.fecha = usado.fecha; tomados.push("fecha"); }
    } else if (datos.fecha === null && usado.fecha !== null && !(usado.fecha === h.fecha && yaPaso)) {
      datos.fecha = usado.fecha; tomados.push("fecha");
    }
    for (const k of ["personas", "equipos", "computo_alto"] as const) {
      if (datos[k] === null && usado[k] !== null) { copiarCampo(datos, usado, k); tomados.push(k); }
    }
    const horarioVigente = !(datos.fecha === h.fecha && yaPaso);
    if (datos.inicio === null && datos.fin === null && usado.inicio && usado.fin && horarioVigente) {
      datos.inicio = usado.inicio; datos.fin = usado.fin; tomados.push("horario");
    }
  }
  const conv: Conversacion = {
    _id: sesion, flujo, pendiente: null, datos, intentos: 0, propuesta: null, excluidas: [], actualizado: new Date(),
  };
  await guardar(repo, conv);
  const r = await turnoReserva(conv, texto, repo);
  if (tomados.length === 0) return r;
  const partes = [
    datos.fecha ? fechaLarga(datos.fecha) : null,
    datos.inicio && datos.fin ? `${datos.inicio} a ${datos.fin}` : null,
    datos.personas !== null ? `${datos.personas} personas` : null,
    datos.computo_alto ? "alto cómputo" : null,
  ].filter((x): x is string => x !== null);
  const tomo = partes.length ? `Tomo lo que me dijiste: ${partes.join(", ")}.` : "";
  return { ...r, respuesta: `${tomo}\n${r.respuesta}` };
}

// Tras una elusión, responde la alerta y repite la pregunta pendiente. No cambia ningún dato.
export async function reanudar(sesion: string, repo: Repositorio, alerta: string): Promise<RespuestaChat | null> {
  const conv = await repo.leerConversacion(sesion);
  if (!conv || conv.flujo === "disponibilidad") return null;
  const pendiente = conv.pendiente ?? "carne";
  // Sala ocupada (7.0.24): la pregunta pendiente es el aviso de ocupación con sus dos opciones, no «¿Confirmo?».
  if (pendiente === "ocupada" && conv.datos.sala && conv.datos.fecha && conv.datos.inicio && conv.datos.fin) {
    const ocupada = await choqueDe(conv.datos, repo);
    if (ocupada) {
      const aviso = textoOcupada(conv, await etiquetaDe(repo, conv.datos.sala), ocupada);
      return { ...aviso, respuesta: `${alerta}\n\n${aviso.respuesta}` };
    }
  }
  const p = preguntaPara(pendiente, docenteDe(conv.datos));
  return abierto(conv, `${alerta}\n\n${p.texto}`, p.opciones);
}


// ── Cancelar una reserva propia (R27, 14-11-2026) ─────────────────────────
// Sin estado: los chips llevan el código («Sí, cancelar RS-0011», «No, conservar RS-0011») y cada paso vuelve a
// comprobar con R27 que la reserva sea del carné de la sesión. Nunca se muestra una reserva de otra persona.
export const esBotonCancelacion = (texto: string): boolean =>
  /^(si,? )?cancelar (la reserva )?rs[\s-]?\d{1,5}$|^no,? conservar(la)? rs[\s-]?\d{1,5}$/.test(norm(texto).replace(/^[¡¿\s]+/, "").replace(/[\s.!¡¿?]+$/, "").replace(/\s+/g, " "));

// ADV-08: "RS-0001", "rs 0001", "RS-1" y "RS-00001" son el mismo código (4 dígitos, ceros a la izquierda).
const codigoDe = (texto: string): string | null => {
  const m = texto.match(/\bRS[\s-]?(\d{1,5})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 9999 ? `RS-${String(n).padStart(4, "0")}` : null;
};

// Mis reservas: las del carné de la sesión desde hoy, con un botón para cancelar las que aún se pueden (R27).
export async function misReservasTurno(sesion: string, repo: Repositorio): Promise<RespuestaChat> {
  const carne = (await repo.leerSesion(sesion))?.carne ?? null;
  if (!carne) return cerrado("mis_reservas", "Para ver tus reservas, primero escríbeme tu carné.");
  const h = ahora();
  const salas = await repo.salas();
  // Solo vigentes (7.0.23): ni días anteriores ni las de hoy que ya terminaron.
  const propias = (await repo.reservasDeCarne(carne, h.fecha))
    .filter((r) => r.fecha > h.fecha || (r.fecha === h.fecha && r.fin_min > h.minutos))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio_min - b.inicio_min);
  if (!propias.length) {
    return cerrado("mis_reservas", "No tienes reservas programadas desde ahora.", ["Reservar una sala", "Ver disponibilidad"]);
  }
  const decision = (r: ReservaDoc) => evaluarCancelacion(r, carne, h);
  const cancelables = propias.filter((r) => decision(r).decision === "cancelar");
  const enCurso = propias.filter((r) => decision(r).motivo === "ya_empezo");
  const mostradas = propias.slice(0, 10);
  const lineas = mostradas.map((r) => {
    const marca = decision(r).motivo === "ya_empezo" ? " (en curso)" : "";
    return `• ${r.codigo}: ${nombreSala(salas, r.sala)}, ${fechaLarga(r.fecha)}, ${r.inicio} a ${r.fin}${marca}`;
  });
  const resto = propias.length > mostradas.length ? `\n…y ${propias.length - mostradas.length} más.` : "";
  const pie = cancelables.length
    ? "\n\nPara cancelar una, toca su botón."
    : enCurso.length
      ? "\n\nNinguna se puede cancelar desde el chat porque ya empezó; si necesitas liberarla, habla con el monitor."
      : "";
  return cerrado("mis_reservas",
    `Tienes ${propias.length} ${propias.length === 1 ? "reserva programada" : "reservas programadas"}:\n${lineas.join("\n")}${resto}${pie}`,
    [...cancelables.slice(0, 6).map((r) => `Cancelar ${r.codigo}`), "Reservar una sala"]);
}

export async function cancelacionTurno(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat> {
  const carne = (await repo.leerSesion(sesion))?.carne ?? null;
  if (!carne) return cerrado("cancelar_reserva", "Para cancelar una reserva, primero escríbeme tu carné.");
  const h = ahora();
  const salas = await repo.salas();
  const t = norm(texto).trim();
  const codigo = codigoDe(texto);
  const describir = (r: ReservaDoc) => `${r.codigo}: ${nombreSala(salas, r.sala)}, ${fechaLarga(r.fecha)}, ${r.inicio} a ${r.fin}`;
  const noEncontrada = (c: string) => cerrado("cancelar_reserva", `No encuentro una reserva tuya con el código ${c} que se pueda cancelar.`);
  // 7.0.23: no confundir «en curso» con «vencida».
  const enCursoTexto = (r: ReservaDoc) => cerrado("cancelar_reserva",
    `${r.codigo} está en curso (${r.inicio}–${r.fin}): desde el chat solo se cancelan reservas que aún no empiezan. Si necesitas liberarla, habla con el monitor.`);
  const vencidaTexto = (r: ReservaDoc) => cerrado("cancelar_reserva",
    `Tu reserva ${r.codigo} ya venció: terminó a las ${r.fin}, así que no hay nada que cancelar.`);

  if (codigo && /^no,? conservar/.test(t)) {
    return cerrado("cancelar_reserva", `Listo, no cancelé nada. Tu reserva ${codigo} sigue programada.`);
  }
  if (codigo && /^si,? cancelar/.test(t)) {
    const r = await repo.reservaPorCodigo(codigo);
    const dec = evaluarCancelacion(r, carne, h);
    if (dec.decision === "cancelar" && r && await repo.cancelarReserva(codigo, carne, new Date())) {
      registrar({ intencion: "cancelar_reserva", codigo, reglas: dec.reglas_aplicadas, carne: enmascarar(carne) });
      return cerrado("cancelar_reserva", `Listo. Cancelé tu reserva ${describir(r)}. La sala queda libre en ese horario.`);
    }
    if (dec.motivo === "ya_empezo" && r) return enCursoTexto(r);
    if (dec.motivo === "vencida" && r) return vencidaTexto(r);
    return noEncontrada(codigo);
  }

  // Código de una reserva propia que ya no se puede cancelar: se explica su estado, no un «no encuentro» genérico.
  if (codigo) {
    const r = await repo.reservaPorCodigo(codigo);
    if (r && r.carne === carne) {
      const dec = evaluarCancelacion(r, carne, h);
      if (dec.motivo === "ya_empezo") return enCursoTexto(r);
      if (dec.motivo === "vencida") return vencidaTexto(r);
    }
  }

  // Solo reservas propias, programadas y que aún no empiezan.
  const todas = await repo.reservasDeCarne(carne, h.fecha);
  const propias = todas.filter((r) => evaluarCancelacion(r, carne, h).decision === "cancelar");
  let lista = propias;
  if (codigo) {
    lista = propias.filter((r) => r.codigo === codigo);
    if (!lista.length) return noEncontrada(codigo);
  } else {
    const e = extraer(texto, { hoy: h.fecha, pendiente: null });
    if (e.fecha) lista = lista.filter((r) => r.fecha === e.fecha);
    if (e.sala) lista = lista.filter((r) => r.sala === e.sala);
    if (!lista.length) {
      // Sin cancelables: se explica la reserva en curso o la vencida antes del mensaje genérico.
      const enCurso = todas.filter((r) => evaluarCancelacion(r, carne, h).motivo === "ya_empezo");
      if (enCurso.length) return enCursoTexto(enCurso[0]);
      const vencidas = todas.filter((r) => evaluarCancelacion(r, carne, h).motivo === "vencida");
      if (!propias.length && vencidas.length) return vencidaTexto(vencidas[vencidas.length - 1]);
      return cerrado("cancelar_reserva", propias.length
        ? "No encuentro una reserva tuya con esos datos. Escribe el código (RS-…) o el día de la reserva."
        : "No tienes reservas programadas que se puedan cancelar.");
    }
  }
  if (lista.length === 1) {
    const r = lista[0];
    return cerrado("cancelar_reserva", `¿Cancelo tu reserva ${describir(r)}?`, [`Sí, cancelar ${r.codigo}`, `No, conservar ${r.codigo}`]);
  }
  const mostradas = lista.slice(0, 6);
  return cerrado("cancelar_reserva",
    `Tienes ${lista.length} reservas que se pueden cancelar. ¿Cuál?\n${mostradas.map((r) => `• ${describir(r)}`).join("\n")}`,
    mostradas.map((r) => `Cancelar ${r.codigo}`));
}
