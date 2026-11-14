// Conversación por pasos para reservas, registro y disponibilidad (sección 7.3 del plan).
// El estado vive en el repositorio (conversaciones), no en el modelo. Los datos los decide el motor.
import type {
  Conversacion, DecisionReserva, NotificacionDoc, ReservaDoc, SalaDoc, SolicitudReserva,
} from "./tools/esquemas-reservas.js";
import { OLVIDO, elegirEspacio } from "./sesion.js";
import { ahora, aMin, aHora, sumarDias } from "./tools/reloj.js";
import { pedirRespaldo, validarRespaldo } from "./llm/respaldo.js";
import { registrar } from "./tools/traza.js";
import { cancelar as esCancelar, extraer, fechas, type Extraido } from "./tools/extraer.js";
import { candidatas, causaR15, disponibilidad, enmascarar, evaluarCancelacion, ocupadaPublica, evaluarRegistro, evaluarReserva, horarioLaboratorio, type Contexto } from "./tools/reservas.js";
import type { Repositorio } from "./store/repositorio.js";

export type RespuestaChat = {
  intencion: string; respuesta: string;
  flujo: { tipo: string; pendiente: string | null; opciones: string[] } | null;
  reserva?: ReturnType<typeof publica>; solicitud?: object; disponibilidad?: object; alerta?: string;
  // La sesión se cerró tras una reserva: la pantalla quita el saludo con el nombre.
  sesion_olvidada?: boolean;
  // Aviso de cierre (despedida y carné olvidado), que se muestra fuera de la tarjeta de la reserva.
  cierre?: string;
  // Identidad tras validar el carné (saludo de la pantalla). Sin el carné completo.
  identidad?: { nombres: string; apellidos: string; rol: string; programa: string | null; carne: string };
};

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
const CAMBIABLES: Record<string, (keyof SolicitudReserva)[]> = {
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
  const abre = aMin("07:00");
  const cierra = aMin("22:00");
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
      return { texto: "¿Para qué día? Por ejemplo: mañana, el jueves o 2026-11-12.", opciones: ["Hoy", "Mañana"] };
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
export function publica(d: DecisionReserva) {
  return { ...d, conflictos: d.conflictos.map((c) => ({ inicio: c.inicio, fin: c.fin, tipo: c.tipo, personas: c.personas })) };
}

function cerrado(intencion: string, respuesta: string, opciones: string[] = [], extra: Partial<RespuestaChat> = {}): RespuestaChat {
  return {
    intencion, respuesta,
    flujo: opciones.length ? { tipo: "sugerencia", pendiente: null, opciones } : null,
    ...extra,
  };
}

async function guardar(repo: Repositorio, conv: Conversacion): Promise<void> {
  await repo.guardarConversacion({ ...conv, actualizado: new Date() });
}

async function contextoPara(repo: Repositorio, carne: string | null, fecha: string | null): Promise<Contexto> {
  const h = ahora();
  return {
    hoy: { fecha: h.fecha, minutos: h.minutos },
    carne: carne ? await repo.carne(carne) : null,
    usuario: carne ? await repo.usuario(carne) : null,
    salas: await repo.salas(),
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

// Pasa lo que el mensaje trae a los campos vacíos. Nunca sobrescribe un dato dado.
function aplicar(d: SolicitudReserva, e: Extraido): boolean {
  let cambio = false;
  const llenar = <K extends keyof SolicitudReserva>(k: K, v: SolicitudReserva[K] | null) => {
    if (d[k] === null && v !== null) {
      d[k] = v;
      cambio = true;
    }
  };
  llenar("carne", e.carne);
  llenar("fecha", e.fecha);
  llenar("sala", e.sala);
  llenar("personas", e.personas);
  llenar("equipos", e.equipos);
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
function resumenDe(sol: SolicitudReserva, salas: SalaDoc[], salaId: string | null) {
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
  const ctx = await contextoPara(repo, sol.carne, sol.fecha);
  let decision: DecisionReserva | undefined;
  const res = await repo.crearReservaAtomica(
    sol.fecha!, sala,
    (actuales) => {
      decision = evaluarReserva(sol, { ...ctx, reservasDelDia: actuales });
      return decision;
    },
    (codigo) => reservaDoc(sol, codigo, decision!, "programada", jornadaDe(ctx)),
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
  const ctx = await contextoPara(repo, sol.carne, sol.fecha);
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
async function salasLibres(d: SolicitudReserva, repo: Repositorio): Promise<{ sala: SalaDoc; operativos: number }[]> {
  const ctx = await contextoPara(repo, null, d.fecha);
  return candidatas({
    carne: null, fecha: d.fecha, inicio: d.inicio, fin: d.fin, sala: null,
    personas: d.personas, equipos: d.equipos, computo_alto: d.computo_alto ?? false, materia: null,
  }, ctx).slice(0, 3).map((sala) => ({
    sala, operativos: disponibilidad(sala, d.fecha!, ctx.reservasDelDia, ctx).operativos,
  }));
}

// Respuesta con hasta 3 salas libres como chips (con puestos y equipos operativos), o, si no hay, un horario nuevo.
async function ofrecerSalas(conv: Conversacion, repo: Repositorio, causa: string): Promise<RespuestaChat> {
  const libres = await salasLibres(conv.datos, repo);
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
  const clave = claveHorario(d);
  if (!clave) return { ok: "" };
  const h = ahora();
  const causa = causaR15(d.fecha!, d.inicio!, d.fin!, { fecha: h.fecha, minutos: h.minutos });
  if (causa) {
    const chips = causa.campo === "horario" && d.inicio && d.fin
      ? chipsHorarioR15(d.inicio, d.fin, { fecha: h.fecha, minutos: h.minutos }, d.fecha!) : [];
    const conservaRango = chips.includes("Revisar mañana");
    if (!conservaRango) { d.inicio = null; d.fin = null; }
    if (causa.campo === "fecha") d.fecha = null;
    conv.validado = null;
    conv.propuesta = null;
    conv.pendiente = causa.campo;
    await guardar(repo, conv);
    const p = preguntaPara(causa.campo, docenteDe(d), d);
    return { corte: abierto(conv, `${capitalizar(causa.motivo)}. ${p.texto}`, chips.length ? chips : p.opciones) };
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
async function aforoInsuficiente(d: SolicitudReserva, repo: Repositorio): Promise<string | null> {
  if (!d.sala || !d.fecha || d.personas === null) return null;
  const ctx = await contextoPara(repo, null, d.fecha);
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
  return pistaHora && horarioPendiente(d);
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

// Turno dentro de un flujo de reserva.
async function turnoReserva(conv: Conversacion, texto: string, repo: Repositorio): Promise<RespuestaChat> {
  const h = ahora();
  const t = norm(texto);
  const pendientePrevio = conv.pendiente;
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
  let cambio = false;
  let prefijo = "";

  // "cambiar <campo>": se borra ese dato y se vuelve a pedir.
  const cambiar = t.match(/^cambiar (carne|fecha|horario|personas|equipos|sala|materia)\b/);
  if (cambiar) {
    for (const k of CAMBIABLES[cambiar[1]]) (conv.datos as Record<string, unknown>)[k] = null;
    conv.propuesta = null;
    cambio = true;
  }

  // "Usar Sala N" (chip o texto): fija la sala y vuelve a evaluar.
  const usar = t.match(/\busar sala\s*-?\s*(1[0-6]|[1-9])\b/);
  if (usar) {
    conv.datos.sala = `sala-${usar[1]}`;
    conv.propuesta = null;
    cambio = true;
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
      conv.propuesta = null;
      conv.ofrecer = null;
      cambio = true;
    }
  }
  if (usar) conv.ofrecer = null;

  const ext = extraer(texto, { hoy: h.fecha, pendiente: conv.pendiente });
  // Docente: la materia se elige entre sus espacios académicos (plan de identidad, sección 4.5).
  const carneSesion = conv.datos.carne ? await repo.carne(conv.datos.carne) : null;
  const espacios = carneSesion?.rol === "docente" ? carneSesion.espacios : [];
  if (conv.pendiente === "materia" && espacios.length) ext.materia = null;

  // Confirmación de la propuesta.
  if (conv.pendiente === "confirmar" && conv.propuesta) {
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
  }

  // Registro dentro de la reserva: "Sí, registrarme" o "No".
  if (conv.pendiente === "registro") {
    if (ext.confirmacion === "si") {
      const d = await registrarUsuarioDesde(conv.datos.carne!, repo);
      if (d.reglas_aplicadas.includes("R26")) {
        prefijo = `Listo, quedaste registrado como ${conv.datos.carne!.startsWith("D-") ? "docente" : "estudiante"} con el carné ${conv.datos.carne}. `;
      }
      conv.pendiente = null;
      cambio = true;
    } else if (ext.confirmacion === "no") {
      await repo.borrarConversacion(conv._id);
      return cerrado("cancelar", "Sin registro no puedo separar la sala. Cancelé la solicitud. No se guardó nada.");
    }
  }

  // Chip "El mismo número de estudiantes" para los equipos.
  if (conv.pendiente === "equipos" && conv.datos.equipos === null && conv.datos.personas !== null
    && /\bmismo numero\b/.test(t)) {
    conv.datos.equipos = conv.datos.personas;
    cambio = true;
  }

  cambio = aplicar(conv.datos, ext) || cambio;
  if (conv.pendiente === "materia" && espacios.length) {
    const eleccion = elegirEspacio(texto, espacios);
    if (eleccion) {
      conv.datos.materia = eleccion;
      cambio = true;
    }
  }
  if (cambio && conv.propuesta) conv.propuesta = null;

  // El carné se evalúa apenas llega: vencido (R16) o desconocido (R17) cierran el flujo en este mismo mensaje.
  if (conv.datos.carne) {
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
  }

  // "Ver otras salas" esperaba las personas: ya se pueden ofrecer las salas que alcanzan (7.0.9).
  if (conv.ofrecer && conv.datos.personas !== null && !conv.datos.sala && claveHorario(conv.datos)) {
    return ofrecerSalas(conv, repo, "");
  }

  // Respaldo del modelo (7.0.8): solo si el código no entiende la sala o el horario. Se confirma antes de usarlo.
  if (necesitaRespaldo(texto, ext, conv.datos, conv.pendiente)) {
    const campos = await aplicarRespaldo(conv, texto);
    if (campos.length) {
      conv.respaldo = campos;
      conv.pendiente = "respaldo";
      await guardar(repo, conv);
      return abierto(conv, `Entendí: ${resumenEntendido(conv.datos)}. ¿Es correcto?`, ["Sí", "Corregir"]);
    }
  }

  // Validación temprana: fecha, horario y sala antes de personas, equipos, alto cómputo o materia.
  const temprano = await revisarTemprano(conv, repo);
  if (temprano.corte) return temprano.corte;

  // Aforo temprano (7.0.9): con sala y personas, si no alcanza se ofrecen otras salas antes de pedir más datos.
  // Estudiantes: un equipo por persona. Docentes: solo el aforo (los equipos se piden después).
  const aforo = await aforoInsuficiente(conv.datos, repo);
  if (aforo) {
    conv.datos.sala = null;
    conv.validado = null;
    return ofrecerSalas(conv, repo, aforo);
  }

  const f = await faltante(conv.datos, repo);
  if (f) {
    if (!cambio && pendientePrevio) {
      conv.intentos += 1;
      if (conv.intentos >= 3) {
        await repo.borrarConversacion(conv._id);
        return cerrado("solicitud_reserva", "No entendí el dato. Empecemos de nuevo cuando quieras.");
      }
    } else {
      conv.intentos = 0;
    }
    conv.pendiente = f;
    await guardar(repo, conv);
    const p = f === "materia" && espacios.length
      ? { texto: "¿Para cuál espacio académico la requieres?", opciones: espacios }
      : preguntaPara(f, docenteDe(conv.datos), conv.datos);
    const aviso = temprano.ok ? `${temprano.ok}Ahora, ${minusculaInicial(p.texto)}` : p.texto;
    return abierto(conv, prefijo + aviso, p.opciones);
  }

  conv.intentos = 0;
  if (!conv.propuesta) return evaluar(conv, repo, prefijo);

  // Hay propuesta y no cambió nada: se vuelve a pedir la confirmación.
  if (!cambio) {
    conv.intentos += 1;
    if (conv.intentos >= 3) {
      await repo.borrarConversacion(conv._id);
      return cerrado("solicitud_reserva", "No entendí el dato. Empecemos de nuevo cuando quieras.");
    }
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
  await repo.guardarConversacion({
    _id: sesion, flujo: "disponibilidad", pendiente,
    datos: {
      ...VACIA(), fecha: datos.fecha, inicio: datos.inicio, fin: datos.fin,
      personas: datos.personas, equipos: datos.equipos, computo_alto: datos.computo_alto,
    },
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
  const operativos = equipos.filter((q) => q.inventario === "disponible" && q.mantenimiento === "disponible").length;
  const conflicto = salas.filter((s) => equipos.some((q) =>
    q.sala === s._id && q.inventario !== "desconocido" && q.mantenimiento !== "desconocido" && q.inventario !== q.mantenimiento));
  const desconocido = salas.filter((s) => equipos.some((q) =>
    q.sala === s._id && (q.inventario === "desconocido" || q.mantenimiento === "desconocido")));
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
  const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (exigirSala && !/\b(salas?|laboratorios?)\b/.test(t)) return null;
  const fs = fechas(texto, ahora().fecha);
  if (!fs.length) return null;
  return /\b(ocupad|reservad|tomad)\w*/.test(t) || fs.length >= 2 ? "ocupacion" : "disponibilidad";
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

export async function continuar(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const conv = await repo.leerConversacion(sesion);
  // El contexto de una disponibilidad no es un flujo abierto, salvo la oferta de mañana.
  if (conv?.flujo === "disponibilidad") {
    return conv.pendiente === "oferta_dia" ? respuestaOferta(texto, sesion, repo) : null;
  }
  if (!conv) return null;
  if (esCancelar(texto)) {
    await repo.borrarConversacion(sesion);
    return cerrado("cancelar", "Cancelé la solicitud. No se guardó nada.");
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
      _id: sesion, flujo, pendiente: "carne", datos: VACIA(), intentos: 0, propuesta: null, actualizado: new Date(),
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
      if (datos[k] === null && usado[k] !== null) { (datos as Record<string, unknown>)[k] = usado[k]; tomados.push(k); }
    }
    const horarioVigente = !(datos.fecha === h.fecha && yaPaso);
    if (datos.inicio === null && datos.fin === null && usado.inicio && usado.fin && horarioVigente) {
      datos.inicio = usado.inicio; datos.fin = usado.fin; tomados.push("horario");
    }
  }
  const conv: Conversacion = {
    _id: sesion, flujo, pendiente: null, datos, intentos: 0, propuesta: null, actualizado: new Date(),
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
  const p = preguntaPara(pendiente, docenteDe(conv.datos));
  return abierto(conv, `${alerta}\n\n${p.texto}`, p.opciones);
}


// ── Cancelar una reserva propia (R27, 14-11-2026) ─────────────────────────
// Sin estado: los chips llevan el código («Sí, cancelar RS-0011», «No, conservar RS-0011») y cada paso vuelve a
// comprobar con R27 que la reserva sea del carné de la sesión. Nunca se muestra una reserva de otra persona.
export const esBotonCancelacion = (texto: string): boolean =>
  /^(si,? )?cancelar (la reserva )?rs[\s-]?\d{1,5}$|^no,? conservar(la)? rs[\s-]?\d{1,5}$/.test(norm(texto).trim().replace(/[.!¡¿?]+$/g, "").replace(/\s+/g, " "));

// ADV-08: "RS-0001", "rs 0001", "RS-1" y "RS-00001" son el mismo código (4 dígitos, ceros a la izquierda).
const codigoDe = (texto: string): string | null => {
  const m = texto.match(/\bRS[\s-]?(\d{1,5})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 9999 ? `RS-${String(n).padStart(4, "0")}` : null;
};

export async function cancelacionTurno(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat> {
  const carne = (await repo.leerSesion(sesion))?.carne ?? null;
  if (!carne) return cerrado("cancelar_reserva", "Para cancelar una reserva, primero escríbeme tu carné.");
  const h = ahora();
  const salas = await repo.salas();
  const t = norm(texto).trim();
  const codigo = codigoDe(texto);
  const describir = (r: ReservaDoc) => `${r.codigo}: ${nombreSala(salas, r.sala)}, ${fechaLarga(r.fecha)}, ${r.inicio} a ${r.fin}`;
  const noEncontrada = (c: string) => cerrado("cancelar_reserva", `No encuentro una reserva tuya con el código ${c} que se pueda cancelar.`);

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
    if (dec.motivo === "ya_empezo") return cerrado("cancelar_reserva", `La reserva ${codigo} ya empezó o ya pasó; no se puede cancelar desde el chat. Consulta con el monitor.`);
    return noEncontrada(codigo);
  }

  // Solo reservas propias, programadas y que aún no empiezan.
  const propias = (await repo.reservasDeCarne(carne, h.fecha))
    .filter((r) => evaluarCancelacion(r, carne, h).decision === "cancelar");
  let lista = propias;
  if (codigo) {
    lista = propias.filter((r) => r.codigo === codigo);
    if (!lista.length) return noEncontrada(codigo);
  } else {
    const e = extraer(texto, { hoy: h.fecha, pendiente: null });
    if (e.fecha) lista = lista.filter((r) => r.fecha === e.fecha);
    if (e.sala) lista = lista.filter((r) => r.sala === e.sala);
    if (!lista.length) {
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
