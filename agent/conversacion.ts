// Conversación por pasos para reservas, registro y disponibilidad (sección 7.3 del plan).
// El estado vive en el repositorio (conversaciones), no en el modelo. Los datos los decide el motor.
import type {
  Conversacion, DecisionReserva, NotificacionDoc, ReservaDoc, SalaDoc, SolicitudReserva,
} from "./tools/esquemas-reservas.js";
import { ahora, aMin, aHora, sumarDias } from "./tools/reloj.js";
import { cancelar as esCancelar, extraer, type Extraido } from "./tools/extraer.js";
import { disponibilidad, enmascarar, evaluarRegistro, evaluarReserva, type Contexto } from "./tools/reservas.js";
import type { Repositorio } from "./store/repositorio.js";

export type RespuestaChat = {
  intencion: string; respuesta: string;
  flujo: { tipo: string; pendiente: string | null; opciones: string[] } | null;
  reserva?: DecisionReserva; solicitud?: object; disponibilidad?: object;
};

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const VACIA = (): SolicitudReserva => ({
  carne: null, fecha: null, inicio: null, fin: null, sala: null,
  personas: null, equipos: null, computo_alto: null, materia: null,
});

// Motivos en español para cada regla (sin códigos técnicos).
const MOTIVO: Record<string, string> = {
  R15: "la fecha u horario no están permitidos (salas de 07:00 a 22:00, de 30 minutos a 4 horas y hasta 30 días)",
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

// Pregunta y chips de cada campo pendiente (textos exactos de la tabla 7.3).
function preguntaPara(pendiente: string, docente: boolean): { texto: string; opciones: string[] } {
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
      return {
        texto: "¿De qué hora a qué hora? Las salas abren de 07:00 a 22:00. Por ejemplo: de 13:00 a 15:00.",
        opciones: ["08:00 a 10:00", "14:00 a 16:00"],
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
function reservaDoc(sol: SolicitudReserva, codigo: string, d: DecisionReserva, estado: "programada" | "escalada"): ReservaDoc {
  const docente = docenteDe(sol);
  return {
    codigo, sala: sol.sala!, fecha: sol.fecha!, inicio: sol.inicio!, fin: sol.fin!,
    inicio_min: aMin(sol.inicio!), fin_min: aMin(sol.fin!),
    tipo: docente ? "clase" : "estudiantes", carne: sol.carne!, rol: docente ? "docente" : "estudiante",
    personas: sol.personas!, equipos: sol.equipos ?? sol.personas!, computo_alto: sol.computo_alto ?? false,
    materia: sol.materia, estado, reglas_aplicadas: d.reglas_aplicadas, traza: d.traza,
    version_reglas: d.version_reglas, creada: new Date(), origen: "chat",
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
      para, motivo, regla, reserva_codigo: codigo, estado: "pendiente" as const, creada: new Date(),
    }));
  };
}

// Aviso sin reserva (R17): la identidad no se puede verificar. Motivo con carné enmascarado y, si se conocen,
// la fecha y el horario pedidos.
function avisoCarne(datos: SolicitudReserva): NotificacionDoc {
  const cuando = `fecha ${datos.fecha ?? "sin indicar"}, horario ${datos.inicio && datos.fin ? `${datos.inicio}–${datos.fin}` : "sin indicar"}`;
  return {
    para: "monitor",
    motivo: `R17: carné ${enmascarar(datos.carne!)} no aparece en carnetización o su vigencia es desconocida (${cuando}).`,
    regla: "R17", reserva_codigo: null, estado: "pendiente", creada: new Date(),
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

function textoNegar(d: DecisionReserva, sol: SolicitudReserva, salas: SalaDoc[]): string {
  const motivo = MOTIVO[d.reglas_aplicadas[0]] ?? "no se cumplen las condiciones";
  const nombre = sol.sala ? `la ${nombreSala(salas, sol.sala)}` : "una sala";
  const libres = d.alternativas.length
    ? `\nSalas libres en ese horario: ${d.alternativas.map((a) => nombreSala(salas, a)).join(", ")}.`
    : "";
  return `No puedo separar ${nombre}: ${motivo}.${libres}\n¿Quieres otro horario u otra sala?`;
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
    return `La ${nombre} ya está separada de ${c.inicio} a ${c.fin} por un grupo de estudiantes (${c.personas} personas, carné ${c.carne_enmascarado}). Avisé al monitor para que ustedes acuerden el uso.${libres}${quedo}`;
  }
  if (regla === "R21" && c) {
    return `La ${nombre} ya está separada de ${c.inicio} a ${c.fin} por otro docente (carné ${c.carne_enmascarado}). Avisé a coordinación para que acuerden el uso.${libres}${quedo}`;
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
      reserva: d, solicitud: resumenDe(sol, ctx.salas, d.sala_asignada) };
  }
  if (d.decision === "escalar") {
    let codigo: string | null = null;
    if (sol.sala) {
      codigo = await repo.registrarEscalada(
        (c) => reservaDoc(sol, c, d, "escalada"),
        avisosDe(d, sol),
      );
    }
    await repo.borrarConversacion(conv._id);
    return cerrado("solicitud_reserva", prefijo + textoEscalar(d, sol, ctx.salas, codigo), [],
      { reserva: d, solicitud: resumenDe(sol, ctx.salas, sol.sala) });
  }
  if (d.decision === "negar") {
    if (d.reglas_aplicadas.includes("R16")) {
      await repo.borrarConversacion(conv._id);
      return cerrado("solicitud_reserva",
        prefijo + "Tu carné está vencido en carnetización: no puedo separar la sala. Remítete a carnetización.",
        [], { reserva: d });
    }
    // El flujo sigue abierto: se borran horario y sala para que el usuario elija de nuevo.
    conv.datos.inicio = null;
    conv.datos.fin = null;
    conv.datos.sala = null;
    conv.propuesta = null;
    conv.pendiente = "horario";
    conv.intentos = 0;
    await guardar(repo, conv);
    const opciones = d.alternativas.map((a) => `Usar Sala ${a.slice(5)}`);
    return { ...abierto(conv, prefijo + textoNegar(d, sol, ctx.salas), opciones), reserva: d,
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
    (codigo) => reservaDoc(sol, codigo, decision!, "programada"),
  );
  if (res.reserva) {
    await repo.borrarConversacion(conv._id);
    const texto = `Listo. Reserva ${res.reserva.codigo} confirmada: ${nombreSala(ctx.salas, sala)}, ${fechaLarga(sol.fecha!)}, ${sol.inicio} a ${sol.fin}. Queda registrada en la base de demostración (datos sintéticos).`;
    return cerrado("solicitud_reserva", texto, [], { reserva: res.decision, solicitud: resumenDe(sol, ctx.salas, sala) });
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

// Turno dentro de un flujo de reserva.
async function turnoReserva(conv: Conversacion, texto: string, repo: Repositorio): Promise<RespuestaChat> {
  const h = ahora();
  const t = norm(texto);
  const pendientePrevio = conv.pendiente;
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

  const ext = extraer(texto, { hoy: h.fecha, pendiente: conv.pendiente });

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
    const p = preguntaPara(f, docenteDe(conv.datos));
    return abierto(conv, prefijo + p.texto, p.opciones);
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

// Disponibilidad: sin flujo. Con sala, la agenda del día; sin sala, las salas con un hueco de 2 h.
async function disponibilidadTurno(texto: string, repo: Repositorio): Promise<RespuestaChat> {
  const h = ahora();
  const ext = extraer(texto, { hoy: h.fecha, pendiente: null });
  const fecha = ext.fecha ?? h.fecha;
  // Sin fecha, la consulta es de hoy; la respuesta ya lo dice, así que no se repite aquí.
  const aviso = "";
  // Si la fecha es hoy, solo cuenta desde la hora actual (no se ofrecen horas que ya pasaron).
  const desde = fecha === h.fecha ? h.minutos : 0;
  const ctx = await contextoPara(repo, null, fecha);
  const reservas = ctx.reservasDelDia;

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
    return cerrado("consulta_disponibilidad", `${aviso}${fechaLarga(fecha)}\n${lineas.join("\n")}`,
      [`Reservar ${sala.nombre}`], {
        disponibilidad: { sala: sala._id, fecha, ocupadas: d.ocupadas, libres: d.libres, operativos: d.operativos, inciertos: d.inciertos },
      });
  }

  // Sin sala: salas con un hueco libre de 2 horas o más, leídas de la base.
  const todas = /\btodas\b/.test(norm(texto));
  const conHueco = ctx.salas
    .slice()
    .sort((a, b) => Number(a._id.slice(5)) - Number(b._id.slice(5)))
    .map((s) => ({ s, rangos: rangosDesde(disponibilidad(s, fecha, reservas, ctx).libres, desde, 120) }))
    .filter((x) => x.rangos.length > 0);
  // Por defecto se muestran 6; el resto se anuncia y se ofrece "Ver todas (día)" (no se corta en silencio).
  // El chip lleva el día: "Ver todas" sin fecha volvería a preguntar por hoy aunque la lista fuera de mañana.
  const etiquetaDia = fecha === h.fecha ? "hoy" : fecha === sumarDias(h.fecha, 1) ? "mañana" : fecha;
  const mostradas = todas ? conHueco : conHueco.slice(0, 6);
  const resto = conHueco.length - mostradas.length;
  const cuando = fecha === h.fecha
    ? `hoy (${fechaLarga(fecha)}) a partir de las ${aHora(desde)}`
    : `el ${fechaLarga(fecha)}`;
  if (!conHueco.length) {
    const manana = fecha === h.fecha && !ext.fecha
      ? ` ¿Quieres que revise mañana (${fechaLarga(sumarDias(h.fecha, 1))})?`
      : "";
    return cerrado("consulta_disponibilidad", `No hay salas con 2 horas libres ${cuando}.${manana}`);
  }
  const lineas = mostradas.map((x) => `• ${x.s.nombre}: ${x.rangos.join(", ")}`);
  const mas = resto > 0 ? `\ny ${resto} salas más.` : "";
  return cerrado("consulta_disponibilidad", `${aviso}Salas con 2 horas libres ${cuando}:\n${lineas.join("\n")}${mas}`,
    [...mostradas.map((x) => `Reservar ${x.s.nombre}`), ...(resto > 0 ? [`Ver todas (${etiquetaDia})`] : [])]);
}

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
  ].join("\n");
}

// Un mensaje dentro de un flujo abierto (o "cancelar" para abortarlo).
export async function continuar(texto: string, sesion: string, repo: Repositorio): Promise<RespuestaChat | null> {
  const conv = await repo.leerConversacion(sesion);
  if (!conv) return null;
  if (esCancelar(texto)) {
    await repo.borrarConversacion(sesion);
    return cerrado("cancelar", "Cancelé la solicitud. No se guardó nada.");
  }
  return conv.flujo === "registro" ? turnoRegistro(conv, texto, repo) : turnoReserva(conv, texto, repo);
}

// Abre un flujo nuevo: "reserva", "registro" o "disponibilidad".
export async function iniciar(
  flujo: "reserva" | "registro" | "disponibilidad", texto: string, sesion: string, repo: Repositorio,
): Promise<RespuestaChat> {
  if (flujo === "disponibilidad") return disponibilidadTurno(texto, repo);
  const conv: Conversacion = {
    _id: sesion,
    flujo,
    pendiente: flujo === "registro" ? "carne" : null,
    datos: VACIA(),
    intentos: 0,
    propuesta: null,
    actualizado: new Date(),
  };
  if (flujo === "registro") {
    if (extraer(texto, { hoy: ahora().fecha, pendiente: "carne" }).carne) return turnoRegistro(conv, texto, repo);
    await guardar(repo, conv);
    return abierto(conv, preguntaPara("carne", false).texto, ["Soy nuevo"]);
  }
  await guardar(repo, conv);
  return turnoReserva(conv, texto, repo);
}

// Tras una elusión, responde la alerta y repite la pregunta pendiente. No cambia ningún dato.
export async function reanudar(sesion: string, repo: Repositorio, alerta: string): Promise<RespuestaChat | null> {
  const conv = await repo.leerConversacion(sesion);
  if (!conv) return null;
  const pendiente = conv.pendiente ?? "carne";
  const p = preguntaPara(pendiente, docenteDe(conv.datos));
  return abierto(conv, `${alerta}\n\n${p.texto}`, p.opciones);
}
