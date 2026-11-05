// Extractores deterministas del chat de reservas (sin modelo).
// Orden obligatorio en `extraer`: carné → fecha → horario → sala → (quitar esos fragmentos) → números.
import { aHora, diaSemana, sumarDias } from "./reloj.js";

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

// ── Carné ────────────────────────────────────────────────────────────────
export function carne(t: string): string | null {
  const m = norm(t).match(/\b([cd])-?(\d{8})\b/);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

// ── Fecha ────────────────────────────────────────────────────────────────
function buscarFecha(t: string, hoy: string): Hallazgo<string> | null {
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

// ── Horario ──────────────────────────────────────────────────────────────
// Horas sin am/pm: 7–11 mañana, 12 mediodía, 1–6 tarde (+12), 13–22 tal cual.
// Con am/pm se respeta el sufijo; si la hora de inicio no lo trae, usa el del final.
function a24(h: number, min: number, sufijo: string | undefined): string | null {
  if (h > 24 || min > 59) return null;
  let hora = h;
  if (sufijo === "pm" && h < 12) hora = h + 12;
  else if (sufijo === "am" && h === 12) hora = 0;
  else if (!sufijo && h >= 1 && h <= 6) hora = h + 12;
  if (hora > 23) return null;
  return aHora(hora * 60 + min);
}

function buscarHorario(t: string): Hallazgo<{ inicio: string; fin: string }> | null {
  const m = norm(t).match(
    /(?:desde las |desde |de )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:a|hasta|-|–|al)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/,
  );
  if (!m) return null;
  const inicio = a24(Number(m[1]), Number(m[2] ?? 0), m[3] ?? m[6]);
  const fin = a24(Number(m[4]), Number(m[5] ?? 0), m[6]);
  if (!inicio || !fin) return null;
  return { valor: { inicio, fin }, texto: m[0] };
}

export function horario(t: string): { inicio: string; fin: string } | null {
  return buscarHorario(t)?.valor ?? null;
}

// ── Sala ─────────────────────────────────────────────────────────────────
function buscarSala(t: string): Hallazgo<string> | null {
  const m = norm(t).match(/\b(?:sala|laboratorio)\s*-?\s*(1[0-6]|[1-9])\b/);
  return m ? { valor: `sala-${m[1]}`, texto: m[0] } : null;
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

export function cancelar(t: string): boolean {
  return /\b(cancelar|cancela|olvidalo|salir|empezar de nuevo)\b/.test(norm(t));
}

// ── Extracción completa de un mensaje ────────────────────────────────────
export type Extraido = {
  carne: string | null; fecha: string | null; inicio: string | null; fin: string | null;
  sala: string | null; personas: number | null; equipos: number | null;
  computo_alto: boolean | null; materia: string | null;
  confirmacion: "si" | "no" | null; cancelar: boolean;
};

export function extraer(texto: string, opts: { hoy: string; pendiente: string | null }): Extraido {
  // 1) carné
  const c = carne(texto);
  let r = norm(texto);
  if (c) r = r.replace(/\b[cd]-?\d{8}\b/, " ");
  // 2) fecha
  const f = buscarFecha(r, opts.hoy);
  if (f) r = r.replace(f.texto, " ");
  // 3) horario
  const h = buscarHorario(r);
  if (h) r = r.replace(h.texto, " ");
  // 4) sala
  const s = buscarSala(r);
  if (s) r = r.replace(s.texto, " ");
  // 5) números, sobre el texto ya sin esos fragmentos
  return {
    carne: c,
    fecha: f?.valor ?? null,
    inicio: h?.valor.inicio ?? null,
    fin: h?.valor.fin ?? null,
    sala: s?.valor ?? null,
    personas: personas(r, opts.pendiente),
    equipos: equipos(r, opts.pendiente),
    computo_alto: computoAlto(r, opts.pendiente),
    materia: materia(texto, opts.pendiente),
    confirmacion: confirmacion(texto),
    cancelar: cancelar(texto),
  };
}
