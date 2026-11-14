// Extractores deterministas del chat de reservas (sin modelo).
// Orden obligatorio en `extraer`: carné → fecha → sala → horario → números (cada fragmento leído se quita del texto).
import { aHora, aMin, diaSemana, sumarDias } from "./reloj.js";

// Minúsculas y sin tildes, para reconocer las frases.
const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
const valorNum = (tok: string): number => (/^\d+$/.test(tok) ? Number(tok) : NUMEROS[tok]);

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
  // Día de la semana: la fecha más cercana igual o posterior a hoy.
  m = n.match(new RegExp(`\\b(?:el |este |del )?(${Object.keys(DIAS).join("|")})\\b`));
  if (m) {
    const delta = (DIAS[m[1]] - diaSemana(hoy) + 7) % 7;
    return { valor: sumarDias(hoy, delta), texto: m[0] };
  }
  // "10 de noviembre" (año de hoy).
  m = n.match(new RegExp(`\\b(\\d{1,2}) de (${Object.keys(MESES).join("|")})\\b`));
  if (m) return { valor: fmtFecha(Number(hoy.slice(0, 4)), MESES[m[2]], Number(m[1])), texto: m[0] };
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

// ── Números (sobre el texto ya sin carné, fecha, horario y sala) ─────────
export function personas(t: string, pendiente: string | null = null): number | null {
  const n = norm(t);
  let m = n.match(new RegExp(`\\b(?:somos|para|grupo de)\\s+${NUM}\\b`));
  if (m) return valorNum(m[1]);
  m = n.match(new RegExp(`\\b${NUM}\\s+(?:personas|estudiantes|alumnos|integrantes|companeros)\\b`));
  if (m) return valorNum(m[1]);
  if (pendiente === "personas") {
    m = n.match(new RegExp(`^\\s*${NUM}\\s*$`));
    if (m) return valorNum(m[1]);
  }
  return null;
}

export function equipos(t: string, pendiente: string | null = null): number | null {
  const n = norm(t);
  const m = n.match(new RegExp(`\\b${NUM}\\s+(?:computadores|computadoras|equipos|pcs?|maquinas)\\b`));
  if (m) return valorNum(m[1]);
  if (pendiente === "equipos") {
    const s = n.match(new RegExp(`^\\s*${NUM}\\s*$`));
    if (s) return valorNum(s[1]);
  }
  return null;
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
export function confirmacion(t: string): "si" | "no" | null {
  const n = norm(t);
  if (/\b(si|confirmo|dale|de una|ok|listo)\b/.test(n)) return "si";
  if (/\b(no|cancela)\b/.test(n)) return "no";
  return null;
}

// "salir" cancela solo como mensaje completo: "hasta salir de clase" no cancela la reserva.
export function cancelar(t: string): boolean {
  const n = norm(t).replace(/^[¡¿\s]+|[.!?¡¿,;:\s]+$/g, "");
  return /\b(cancelar|cancela|olvidalo|empezar de nuevo)\b/.test(n) || n === "salir";
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
  const f = buscarFecha(r, opts.hoy);
  if (f) r = r.replace(f.texto, " ");
  // 3) sala: antes del horario, para que su número no se lea como una hora ("sala 6 de 2 a 4" → 14:00–16:00)
  const s = buscarSala(r);
  if (s) r = r.replace(s.texto, " ");
  // 4) horario
  const h = buscarHorario(r);
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
