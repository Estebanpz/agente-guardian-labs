// Respuestas informativas deterministas (sin modelo): ayuda, ID, franjas, reglas, reservas y salas.
// Un mismo mensaje puede traer varias preguntas; se detectan los temas y se responde cada uno.
import { readFileSync } from "node:fs";
import { resumenSalas } from "./salas.js";

const base = JSON.parse(readFileSync(new URL("../rules/reglas.json", import.meta.url), "utf-8")) as {
  version: string;
  parametros: { tolerancia_asistencia_min: number };
};

const norm = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export type Tema = "presentacion" | "id" | "induccion" | "carne" | "franjas" | "reglas" | "reserva" | "salas";

const PATRONES: [Tema, RegExp][] = [
  ["presentacion", /\b(quien eres|que eres|que haces|que puedes hacer|como te llamas|tu nombre|para que sirves)\b/],
  ["id", /\b(id|ids|identificador(es)?|letra e)\b/],
  ["induccion", /\binducci(on|ones)\b/],
  ["carne", /\bcarne(t|s|ts)?\b/],
  ["franjas", /\bfranjas?\b/],
  ["reglas", /\b(reglas?|restricciones?|requisitos?|condiciones)\b/],
  ["reserva", /\b(agendar|programar|reservar|apartar|asignar)\b/],
  ["salas", /\b(salas?|equipos?)\b.{0,25}\b(disponibles?|libres?|ocupadas?|ocupados?)\b|\bhay salas?\b|\bcupos?\b|\baforo\b/],
];

const TITULOS: Record<Tema, string> = {
  presentacion: "Quién soy",
  id: "El ID",
  induccion: "Inducción de seguridad",
  carne: "Carné",
  franjas: "Franjas horarias",
  reglas: "Restricciones",
  reserva: "Agendar salas",
  salas: "Estado de las salas",
};

export function temasDe(texto: string): Tema[] {
  const t = norm(texto);
  return PATRONES.filter(([, p]) => p.test(t)).map(([tema]) => tema);
}

export function estadoSalas(texto = ""): string {
  const n = texto.match(/sala\s*-?\s*([1-3])\b/i)?.[1];
  const lista = resumenSalas().filter((s) => !n || s.id === `sala-${n}`);
  const lineas = lista.map((s) => {
    const revisar = s.equipos
      .filter((q) => q.estado === "conflicto" || q.estado === "desconocido")
      .map((q) => `${q.id} (${q.estado})`);
    return (
      `• ${s.nombre}: ${s.franja ? `franja ${s.franja}` : "sin franja activa"} · aforo ${s.aforo_actual}/${s.capacidad}` +
      `${s.lleno ? " (llena)" : ""} · ${s.disponibles} de ${s.equipos.length} equipos disponibles` +
      (revisar.length ? ` · revisar: ${revisar.join(", ")}` : "")
    );
  });
  const conCupo = lista.filter((s) => s.franja && !s.lleno).map((s) => s.nombre);
  return [
    "Estado actual de las salas:",
    ...lineas,
    conCupo.length ? `Con cupo en este momento: ${conCupo.join(", ")}.` : "Ninguna sala con franja activa tiene cupo ahora.",
  ].join("\n");
}

export const TEXTO_RESERVA = [
  "No agendo, programo ni reservo salas: eso lo gestiona coordinación en el sistema de reservas.",
  "Yo trabajo en la puerta, con las franjas que ya están programadas: evalúo el ingreso, registro la asistencia e informo el estado de las salas.",
].join("\n");

export const AYUDA_GENERAL = [
  "Me llamo Guardian Labs, el asistente del monitor de los laboratorios de sistemas. Puedo:",
  "• Evaluar si una persona puede ingresar (escriba su ID, por ejemplo E-001, y la sala).",
  "• Registrar la salida o la asistencia al cierre de la franja.",
  "• Informar el estado de las salas: aforo, franjas y equipos.",
  "• Explicarle qué es el ID, cómo funcionan las franjas y qué restricciones aplican.",
  "Yo recomiendo con base en las reglas R1–R13; la decisión final siempre es suya.",
].join("\n");

const TEXTOS: Record<Tema, (texto: string) => string> = {
  presentacion: () =>
    "Me llamo Guardian Labs. Soy el asistente del monitor de los laboratorios de sistemas: evalúo si una persona puede ingresar, registro la asistencia e informo el estado de las salas. Yo recomiendo; la decisión final es del monitor.",
  id: () =>
    [
      "El ID es el código con el que identifico a una persona sin usar sus datos personales. Ejemplo: E-001.",
      "• Para qué sirve: con el ID busco en la base el carné, la inducción de seguridad, la reserva y la hora de llegada de esa persona, y con eso aplico las reglas.",
      "• La letra E es solo el prefijo de los IDs de prueba. No significa \"estudiante\": el rol (estudiante, docente, monitor o externo) se guarda aparte.",
      "• ¿Se puede inventar? No sirve de nada: si el ID no está en la base, no evalúo nada y le paso la solicitud al monitor.",
      "• En este prototipo los IDs válidos son E-001 a E-011 y son de prueba. En un uso real, el ID lo entregaría el sistema de carnetización.",
    ].join("\n"),
  induccion: () =>
    [
      "La inducción de seguridad es la capacitación en normas de seguridad y uso del laboratorio que una persona debe tener vigente para usar los equipos.",
      "• Si está vigente: puede usar los equipos (si nada más lo impide).",
      "• Si está vencida: no se usan los equipos y se remite a la inducción (R1).",
      "• Si no hay registro: no supongo que la tiene ni que no la tiene; escalo al monitor (R2).",
      "Quién la dicta y cuánto dura su vigencia lo define el responsable de los laboratorios.",
    ].join("\n"),
  carne: () =>
    [
      "El carné vigente acredita que la persona está activa en la universidad en el periodo actual.",
      "• Si está vencido: no ingresa y se remite a registro (R4).",
      "• Si no se sabe: escalo al monitor (R2).",
    ].join("\n"),
  franjas: () => {
    const activas = resumenSalas().filter((s) => s.franja).map((s) => `${s.nombre} ${s.franja}`);
    const tol = base.parametros.tolerancia_asistencia_min;
    return [
      "Una franja es el bloque de horario de una clase en una sala, por ejemplo 08:00–10:00.",
      "• Con la franja sé si la sala tiene clase en este momento.",
      `• Asistencia: llegar hasta ${tol} minutos después del inicio cuenta como presente; después, como tardía (R11).`,
      "• Al cierre de la franja, quien no registró entrada queda \"sin registro\", no como ausente, para que se pueda corregir (R12).",
      `• Franjas activas ahora: ${activas.length ? activas.join(", ") : "ninguna"}.`,
      "Yo no creo ni cambio franjas: eso lo programa coordinación.",
    ].join("\n");
  },
  reglas: () =>
    [
      `Las principales restricciones (reglas versión ${base.version}):`,
      "• Sin inducción de seguridad vigente no se usan los equipos (R1).",
      "• Con el carné vencido no se ingresa (R4).",
      "• Si la sala está llena no entra nadie nuevo; se ofrece lista de espera (R7).",
      "• Una reserva hecha por alguien no autorizado o una aprobación solo verbal se escala a coordinación (R5, R6).",
      "• Si falta un dato o dos fuentes se contradicen, no decido: escalo al monitor (R2, R3, R13).",
      "• No sugiero equipos en mantenimiento o en conflicto (R9), y doy prioridad a puestos accesibles cuando se necesitan (R8).",
    ].join("\n"),
  reserva: () => TEXTO_RESERVA,
  salas: (texto) => estadoSalas(texto),
};

// Una sola pregunta: respuesta directa. Varias: una sección por tema.
export function responderTemas(temas: Tema[], texto: string): string {
  if (temas.length === 1) return TEXTOS[temas[0]](texto);
  return temas.map((t) => `▸ ${TITULOS[t]}\n${TEXTOS[t](texto)}`).join("\n\n");
}
