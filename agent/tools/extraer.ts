// Extractores deterministas del chat de reservas (sin modelo).
// Orden obligatorio en `extraer`: carné → fecha → sala → horario → números (cada fragmento leído se quita del texto).
import { aHora, aMin, diaSemana, sumarDias } from "./reloj.js";

// Minúsculas y sin tildes, para reconocer las frases.
const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── Correcciones dentro del mismo mensaje (7.0.27) ───────────────────────
// «sala 4 para 10 personas, bueno no, somos 40» tomaba 10: con un marcador de corrección manda el último valor
// del campo. Sin marcador («somos 10 o 12») no se supone: el llamador pregunta cuál.
const RE_CORRECCION = /\b(bueno no|mejor|perdon|digo|corrijo|mas bien)\b/;
export const tieneCorreccion = (t: string): boolean => RE_CORRECCION.test(norm(t));
// Texto que sigue al último marcador, o null si no hay ninguno.
function trasCorreccion(n: string): string | null {
  let fin: number | null = null;
  for (const m of n.matchAll(new RegExp(RE_CORRECCION.source, "g"))) {
    fin = (m.index ?? 0) + m[0].length;
  }
  return fin === null ? null : n.slice(fin).trim();
}
// Busca primero en lo que sigue al último marcador; si allí no hay valor, en el mensaje completo. Así «mejor la
// sala 6» corrige la sala pero no borra la fecha que ya venía antes («mañana mejor la sala 6»).
function conUltimo<T>(texto: string, buscar: (n: string) => T | null): T | null {
  const n = norm(texto);
  const cola = trasCorreccion(n);
  if (cola !== null) {
    const v = buscar(cola);
    if (v !== null) return v;
  }
  return buscar(n);
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const DIAS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};
const NUMEROS: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40,
};
const NUM = `(\\d{1,3}|${Object.keys(NUMEROS).join("|")})`;
// Cantidades de personas/equipos: hasta 4 cifras y negativas, para poder explicar el rango en vez de fallar (7.0.25).
const NUM_CANTIDAD = `(-?\\d{1,4}|${Object.keys(NUMEROS).join("|")})`;
const valorNum = (tok: string): number => (/^-?\d+$/.test(tok) ? Number(tok) : NUMEROS[tok]);

const pad = (n: number): string => String(n).padStart(2, "0");
const fmtFecha = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

type Hallazgo<T> = { valor: T; texto: string };

// ADV-07: una fecha que no existe ("31 de febrero", "2026-13-01") no se normaliza: se descarta y el flujo la pide.
const existe = (f: string): boolean => {
  const [y, m, d] = f.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && m <= 12 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const valida = (h: Hallazgo<string> | null): Hallazgo<string> | null => (h && existe(h.valor) ? h : null);

// ── Carné ────────────────────────────────────────────────────────────────
// Todos los carnés del texto, con la MISMA normalización que carne() (sin tildes ni marcas combinadas):
// «Ć-10000002» o «Ç-10000002» también cuentan. Lo usan el orquestador y la privacidad (hallazgo de fuzzing, 14-11-2026).
export function carnesEn(t: string): string[] {
  return [...norm(t).matchAll(/\b([cd])-?(\d{8})\b/g)].map((m) => `${m[1].toUpperCase()}-${m[2]}`);
}

// Quita los carnés del texto aunque traigan marcas combinadas o letras con tilde (C, Ç, Ć, Č…). Se trabaja sobre la
// forma NFD (letra base + marcas) y se vuelve a NFC: el resto del mensaje conserva sus tildes.
export function sinCarnes(t: string): string {
  return t.normalize("NFD")
    .replace(/(?<![\p{L}\p{N}])[CDcd]\p{M}*\s*-?\s*\p{M}*\d{8}(?!\d)/gu, " ")
    .normalize("NFC").replace(/\s+/g, " ").trim();
}

export function carne(t: string): string | null {
  const m = norm(t).match(/\b([cd])-?(\d{8})\b/);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

// ── Fecha ────────────────────────────────────────────────────────────────
function buscarFecha(t: string, hoy: string): Hallazgo<string> | null {
  return valida(buscarFechaTexto(t, hoy));
}

function buscarFechaTexto(t: string, hoy: string): Hallazgo<string> | null {
  const n = norm(t);
  let m = n.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { valor: m[0], texto: m[0] };
  m = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (m) return { valor: fmtFecha(Number(m[3] ?? hoy.slice(0, 4)), Number(m[2]), Number(m[1])), texto: m[0] };
  if (/\bpasado manana\b/.test(n)) return { valor: sumarDias(hoy, 2), texto: "pasado manana" };
  if (/\bhoy\b/.test(n)) return { valor: hoy, texto: "hoy" };
  // "mañana" como día, no si va precedido de "la ", "en la " o "por la " ("en la mañana" es la franja).
  m = n.match(/(?<!la |en la |por la )\bmanana\b/);
  if (m) return { valor: sumarDias(hoy, 1), texto: m[0] };
  // Días ya pasados: se reconocen para poder rechazarlos («esa fecha ya pasó») en vez de no entenderlos.
  if (/\b(?:antier|anteayer)\b/.test(n)) return { valor: sumarDias(hoy, -2), texto: n.match(/\b(?:antier|anteayer)\b/)![0] };
  if (/\bayer\b/.test(n)) return { valor: sumarDias(hoy, -1), texto: "ayer" };
  // "10 de noviembre" (año de hoy). Va antes que el día de la semana: en «el sábado 13 de noviembre» manda el 13.
  // El día de la semana que lo precede forma parte de la misma fecha (si no, `fechas` lo contaría como otra).
  m = n.match(new RegExp(`((?:\\b(?:el |este |del )?(?:${Object.keys(DIAS).join("|")})\\s+)?)\\b(\\d{1,2}) de (${Object.keys(MESES).join("|")})\\b`));
  if (m) return { valor: fmtFecha(Number(hoy.slice(0, 4)), MESES[m[3]], Number(m[2])), texto: m[0] };
  // Día de la semana: la fecha más cercana igual o posterior a hoy.
  m = n.match(new RegExp(`\\b(?:el |este |del )?(${Object.keys(DIAS).join("|")})\\b`));
  if (m) {
    const delta = (DIAS[m[1]] - diaSemana(hoy) + 7) % 7;
    return { valor: sumarDias(hoy, delta), texto: m[0] };
  }
  return null;
}

export function fecha(t: string, hoy: string): string | null {
  return buscarFecha(t, hoy)?.valor ?? null;
}

// Todas las fechas del texto ("el jueves y viernes"), sin repetir y en orden cronológico; máximo 7.
// Cada hallazgo se quita del texto, así "pasado mañana" no cuenta también como "mañana".
export function fechas(t: string, hoy: string): string[] {
  let resto = norm(t);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const h = buscarFecha(resto, hoy);
    if (!h) break;
    if (!out.includes(h.valor)) out.push(h.valor);
    resto = resto.replace(h.texto, " ");
  }
  return out.sort();
}

// Frases de franja que equivalen a am/pm: "de la noche" y "de la tarde" son pm; "de la mañana" es am.
// Se aplica una sola vez al texto, para que los fragmentos que se quitan después coincidan con él.
const normalizarHorario = (n: string): string =>
  n.replace(/\b([ap])\.?\s?m\b\.?/g, "$1m")
    .replace(/\bde la (noche|tarde)\b/g, "pm")
    .replace(/\bde la manana\b/g, "am");

// ── Horario ──────────────────────────────────────────────────────────────
// Horas sin am/pm: 7–11 mañana, 12 mediodía, 1–6 tarde (+12), 13–22 tal cual.
// Con am/pm se respeta el sufijo; si la hora de inicio no lo trae, usa el del final.
// Hora de 24 h a partir de la hora dicha: 7–11 mañana, 12 mediodía, 1–6 tarde (+12), 13–22 tal cual.
// Con am/pm se respeta el sufijo (si la hora de inicio no lo trae, usa el del final).
function a24(h: number, min: number, sufijo: string | undefined): string | null {
  if (h > 24 || min > 59) return null;
  let hora = h;
  if (sufijo === "pm" && h < 12) hora = h + 12;
  else if (sufijo === "am" && h === 12) hora = 0;
  else if (!sufijo && h >= 1 && h <= 6) hora = h + 12;
  if (hora > 23) return null;
  return aHora(hora * 60 + min);
}

// Hora dicha como "8", "8:30", "8.30", "8h30", "8 y media" o "8 y cuarto".
const HORA = "(\\d{1,2})(?:(?::|\\.|h)(\\d{2})|\\s*y\\s*(media|cuarto))?";
// Sufijo am/pm opcional (después de "a. m." normalizado a "am").
const SUFIJO = "(?:\\s*(am|pm))?";
// Prefijos del rango: "desde (las) X", "de (la/las) X", "a (la/las) X", "hasta (la/las) X".
const PREFIJO = "(?:(?:desde|de|a|hasta) (?:las?\\s+)?)?";
const RE_HORARIO = new RegExp(
  PREFIJO + HORA + SUFIJO + "\\s*(?:a|hasta|-|–|al)\\s*(?:las?\\s+)?" + HORA + SUFIJO,
);

function minutosDe(exacto: string | undefined, fraccion: string | undefined): number {
  if (exacto !== undefined) return Number(exacto);
  if (fraccion === "media") return 30;
  if (fraccion === "cuarto") return 15;
  return 0;
}

function buscarHorario(t: string): Hallazgo<{ inicio: string; fin: string }> | null {
  const n = normalizarHorario(norm(t));
  const m = n.match(RE_HORARIO);
  if (!m) return null;
  const h1 = Number(m[1]), min1 = minutosDe(m[2], m[3]), suf1 = m[4];
  const h2 = Number(m[5]), min2 = minutosDe(m[6], m[7]), suf2 = m[8];
  // El am/pm del final se aplica también al inicio ("7 a 9 pm" = 19:00–21:00). Si ese rango no es válido,
  // el inicio se toma con su propio sufijo ("11 a 1 pm" = 11:00–13:00).
  let primero: { inicio: string; fin: string } | null = null;
  for (const suf of new Set([suf1 ?? suf2, suf1])) {
    const inicio = a24(h1, min1, suf);
    let fin = a24(h2, min2, suf2);
    if (!inicio || !fin) continue;
    // Fin sin am/pm que queda antes del inicio: se suman 12 h si cae en 07:00–22:00 y después del inicio.
    if (!suf2 && aMin(fin) <= aMin(inicio)) {
      const pm = aMin(fin) + 12 * 60;
      if (pm >= 7 * 60 && pm <= 22 * 60 && pm > aMin(inicio)) fin = aHora(pm);
    }
    primero ??= { inicio, fin };
    if (aMin(fin) > aMin(inicio)) return { valor: { inicio, fin }, texto: m[0] };
  }
  // Ningún candidato es válido: se devuelve el primero para que el motor diga qué falla (fin antes del inicio).
  return primero ? { valor: primero, texto: m[0] } : null;
}

export function horario(t: string): { inicio: string; fin: string } | null {
  return buscarHorario(t)?.valor ?? null;
}

// ── Sala ─────────────────────────────────────────────────────────────────
function buscarSala(t: string): Hallazgo<string> | null {
  const m = norm(t).match(/\b(?:sala|laboratorio)\s*-?\s*(1[0-6]|[1-9])\b/);
  return m ? { valor: `sala-${m[1]}`, texto: m[0] } : null;
}

// ADV-09: el número de una sala que no existe ("sala 99", "sala 0"); null si no hay o si existe (1 a 16).
export function salaInexistente(t: string): number | null {
  const m = norm(t).match(/\b(?:sala|laboratorio)\s*-?\s*(\d{1,3})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 16 ? null : n;
}

export function sala(t: string): string | null {
  return buscarSala(t)?.valor ?? null;
}

// Salas que el mensaje rechaza (7.0.27): «no quiero la sala 13 dame otra», «la 13 no», «otra que no sea la 13».
// Se guardan en la conversación y no se vuelven a proponer ni a asignar.
export function salasNegadas(t: string): string[] {
  const n = norm(t);
  const NUM_SALA = "(1[0-6]|[1-9])";
  const re = [
    new RegExp(`\\bno\\s+(?:quiero|deseo|necesito|uso|usar|tomo|tomar)\\s+(?:la\\s+|el\\s+|sala\\s+|laboratorio\\s+)*(?:sala\\s+|laboratorio\\s+)?(?:numero\\s+)?${NUM_SALA}\\b`, "g"),
    new RegExp(`\\b(?:la|el|sala|laboratorio)\\s+(?:sala\\s+|laboratorio\\s+)?(?:numero\\s+)?${NUM_SALA}\\s+no\\b`, "g"),
    new RegExp(`\\b(?:otra|otro)\\s+(?:que\\s+)?no\\s+(?:sea|fuera|es)\\s+(?:la\\s+|el\\s+|sala\\s+|laboratorio\\s+)*(?:sala\\s+|laboratorio\\s+)?${NUM_SALA}\\b`, "g"),
    new RegExp(`\\b(?:menos|excepto|salvo|sin|que\\s+no\\s+sea|que\\s+no\\s+fuera)\\s+(?:la\\s+|el\\s+|sala\\s+|laboratorio\\s+)*(?:sala\\s+|laboratorio\\s+)?${NUM_SALA}\\b`, "g"),
    new RegExp(`\\bno\\s+(?:la|el|sala|laboratorio)\\s+(?:sala\\s+)?(?:numero\\s+)?${NUM_SALA}\\b`, "g"),
  ];
  const out: string[] = [];
  for (const r of re) {
    for (const m of n.matchAll(r)) {
      const id = `sala-${m[1]}`;
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

// ── Números (sobre el texto ya sin carné, fecha, horario y sala) ─────────
function personasEn(n: string, pendiente: string | null): number | null {
  let m = n.match(new RegExp(`\\b(?:somos|para|grupo de)\\s+${NUM_CANTIDAD}\\b`));
  if (m) return valorNum(m[1]);
  m = n.match(new RegExp(`(?:^|\\s)${NUM_CANTIDAD}\\s+(?:personas|estudiantes|alumnos|integrantes|companeros)\\b`));
  if (m) return valorNum(m[1]);
  // También «personas 0» / «estudiantes 1000» (la cantidad antes se exigía detrás de la palabra).
  m = n.match(new RegExp(`\\b(?:personas|estudiantes|alumnos|integrantes|companeros)\\s*:?\\s*${NUM_CANTIDAD}\\b`));
  if (m) return valorNum(m[1]);
  if (pendiente === "personas") {
    m = n.match(new RegExp(`^\\s*${NUM_CANTIDAD}\\s*$`));
    if (m) return valorNum(m[1]);
  }
  return null;
}

export function personas(t: string, pendiente: string | null = null): number | null {
  return conUltimo(t, (n) => personasEn(n, pendiente));
}

// «somos 10 o 12»: dos valores sin marcador de corrección. El flujo pregunta cuál en vez de tomar el primero.
export function personasAmbiguas(t: string): number[] | null {
  const n = norm(t);
  const m = n.match(new RegExp(`\\b(?:somos|para|grupo de)\\s+${NUM_CANTIDAD}\\s+o\\s+${NUM_CANTIDAD}\\b`))
    ?? n.match(new RegExp(`\\b${NUM_CANTIDAD}\\s+o\\s+${NUM_CANTIDAD}\\s+(?:personas|estudiantes|alumnos|integrantes|companeros)\\b`));
  if (!m) return null;
  const a = valorNum(m[1]);
  const b = valorNum(m[2]);
  return a === b ? null : [a, b];
}

function equiposEn(n: string, pendiente: string | null): number | null {
  let m = n.match(new RegExp(`(?:^|\\s)${NUM_CANTIDAD}\\s+(?:computadores|computadoras|equipos|pcs?|maquinas)\\b`));
  if (m) return valorNum(m[1]);
  // «equipos 0», «computadores 1000»: la cantidad también puede ir después de la palabra.
  m = n.match(new RegExp(`\\b(?:computadores|computadoras|equipos|pcs?|maquinas)\\s*:?\\s*${NUM_CANTIDAD}\\b`));
  if (m) return valorNum(m[1]);
  if (pendiente === "equipos") {
    const s = n.match(new RegExp(`^\\s*${NUM_CANTIDAD}\\s*$`));
    if (s) return valorNum(s[1]);
  }
  return null;
}

export function equipos(t: string, pendiente: string | null = null): number | null {
  return conUltimo(t, (n) => equiposEn(n, pendiente));
}

export function computoAlto(t: string, pendiente: string | null = null): boolean | null {
  const n = norm(t);
  if (pendiente === "computo_alto") {
    if (/\bno\b/.test(n)) return false;
    if (/\b(si|claro|necesito)\b/.test(n)) return true;
    return null;
  }
  return /alto( poder)?( de)? computo|alto rendimiento|\bgpu\b|\bpotentes?\b/.test(n) ? true : null;
}

// ── Materia (se guarda con sus tildes: se trabaja sobre el texto original) ──
export function materia(t: string, pendiente: string | null = null): string | null {
  if (pendiente === "materia") {
    const v = t.replace(/\bpara\s+(la clase de|la materia|el espacio de)?/i, "").trim();
    return v.length >= 2 ? v.slice(0, 60).trim() : null;
  }
  const m = t.match(/(?:clase|materia|asignatura) de ([a-zA-ZÀ-ÿ ]{3,40})/i);
  return m ? m[1].trim().slice(0, 60) : null;
}

// ── Respuestas cortas ────────────────────────────────────────────────────
// 7.0.27: solo confirma un afirmativo puro, de inicio a fin. «si, claro que no» o «si pero mejor a las 4» no
// confirman: el flujo pregunta «No entendí si confirmas» (o aplica el dato nuevo y vuelve a revisar).
// «no, cancela» sigue siendo un no (lo usan los guiones y la cancelación de la solicitud).
const AFIRMATIVO = /^(si|si confirmar|confirmo|confirmo la reserva|confirmar|confirmar la reserva|dale|de una|ok|okay|listo|👍)$/;
const NEGATIVO = /^(no|no gracias|nel|no cancela|no cancelalo|no cancelarla|no cancelar|no cancela la reserva)$/;
export function confirmacion(t: string): "si" | "no" | null {
  const n = norm(t).replace(/[.,!?¡¿;:]+/g, " ").replace(/\s+/g, " ").trim();
  if (AFIRMATIVO.test(n)) return "si";
  if (NEGATIVO.test(n)) return "no";
  return null;
}

// «a las 4», «4 pm», «hasta las 3»: una hora suelta, sin rango. Sirve para pedir las dos horas conservando la fecha.
export function horaSuelta(t: string): boolean {
  const n = normalizarHorario(norm(t));
  if (buscarHorario(n)) return false;
  return /\b(?:a|desde|de|hasta)\s+las?\s+\d{1,2}(?::\d{2})?\b/.test(n)
    || /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/.test(n);
}

// "salir" cancela solo como mensaje completo: "hasta salir de clase" no cancela la reserva.
// 7.0.24: la solicitud se cancela solo cuando el mensaje ES el pedido, de inicio a fin. Que la palabra aparezca
// suelta no basta: «se me olvidaba decir que somos 4», «ya no quiero esa sala, mejor la 5» (cambio de sala) o
// «cancelación de la clase pero igual necesito la sala» no cancelan la solicitud.
const MULETILLA = "(?:por favor|porfa|mejor|ya|no|oye|bueno|entonces|vale|ok)";
const CANCELA_SOLICITUD = new RegExp(
  `^(?:${MULETILLA}\\s+)*` +
  "(?:cancel(?:ar|a|alo|ala|arlo|arla)(?:\\s+(?:la|esta|esa|mi)\\s+solicitud)?" +
  "|olvida(?:lo|te|r)?" +
  "|empezar de nuevo" +
  "|ya no (?:la |lo |las |los )?quiero(?:\\s+(?:reservar|reservarla|reservarlo))?" +
  "|salir)" +
  `(?:\\s+${MULETILLA})*$`,
);
export function cancelar(t: string): boolean {
  // Sin signos ni muletillas: «¡No, cancélalo, por favor!» es el mismo pedido que «cancelar».
  const n = norm(t).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return CANCELA_SOLICITUD.test(n);
}

// ── Duración pedida sin rango (plan de rango horario, 3.1) ───────────────
// "por 5 horas", "hora y media", "3 horas y media", "media hora", "90 minutos", "5 h". Solo se usa cuando el texto
// no trae un rango de horas: "a las 3" y "3 de la tarde" son horas del día, no duración.
function duracionDe(r: string): number | null {
  const valor = (x: string): number => (x === "una" || x === "un" ? 1 : valorNum(x));
  let m = r.match(new RegExp(`\\b${NUM}\\s+horas?\\s+y\\s+media\\b`));
  if (m) return valor(m[1]) * 60 + 30;
  if (/\bhora\s+y\s+media\b/.test(r)) return 90;
  m = r.match(new RegExp(`\\b${NUM}\\s+horas?\\b`));
  if (m) return valor(m[1]) * 60;
  if (/\bmedia\s+hora\b/.test(r)) return 30;
  if (/\buna\s+hora\b/.test(r)) return 60;
  m = r.match(new RegExp(`\\b${NUM}\\s+minutos?\\b`));
  if (m) return valor(m[1]);
  m = r.match(new RegExp(`\\b${NUM}\\s+h\\b`));
  if (m) return valor(m[1]) * 60;
  return null;
}

// ── Extracción completa de un mensaje ────────────────────────────────────
export type Extraido = {
  carne: string | null; fecha: string | null; inicio: string | null; fin: string | null;
  duracion_min: number | null;
  sala: string | null; personas: number | null; equipos: number | null;
  computo_alto: boolean | null; materia: string | null;
  confirmacion: "si" | "no" | null; cancelar: boolean;
};

export function extraer(texto: string, opts: { hoy: string; pendiente: string | null }): Extraido {
  // 1) carné
  const c = carne(texto);
  let r = normalizarHorario(norm(texto));
  if (c) r = r.replace(/\b[cd]-?\d{8}\b/, " ");
  // 2) fecha
  const f = conUltimo(r, (n) => buscarFecha(n, opts.hoy));
  if (f) r = r.replace(f.texto, " ");
  // 3) sala: antes del horario, para que su número no se lea como una hora ("sala 6 de 2 a 4" → 14:00–16:00)
  const s = conUltimo(r, buscarSala);
  if (s) r = r.replace(s.texto, " ");
  // 4) horario
  const h = conUltimo(r, buscarHorario);
  if (h) r = r.replace(h.texto, " ");
  // 5) números, sobre el texto ya sin esos fragmentos
  return {
    carne: c,
    fecha: f?.valor ?? null,
    inicio: h?.valor.inicio ?? null,
    fin: h?.valor.fin ?? null,
    duracion_min: h ? null : duracionDe(r),
    sala: s?.valor ?? null,
    personas: personas(r, opts.pendiente),
    equipos: equipos(r, opts.pendiente),
    computo_alto: computoAlto(r, opts.pendiente),
    materia: materia(texto, opts.pendiente),
    confirmacion: confirmacion(texto),
    cancelar: cancelar(texto),
  };
}
