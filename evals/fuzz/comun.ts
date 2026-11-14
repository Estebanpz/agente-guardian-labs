// Arnés común del fuzzing (pruebas difusas). Sin dependencias nuevas: generador con semilla propio (mulberry32)
// y fast-check solo donde conviene. Solo memoria y modelo simulado: no toca MongoDB ni Ollama.
//
// Cada fuzzer corre en un proceso hijo vigilado: un mensaje que congela el bucle de eventos (bucle infinito de
// promesas) o que tumba el proceso no se puede detectar desde dentro. El hijo escribe de forma síncrona la entrada
// que va a probar; si deja de avanzar o muere, el padre lo mata, registra la entrada como hallazgo, intenta
// reducirla (entrada mínima) y relanza el hijo desde la entrada siguiente.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Semilla e iteraciones ─────────────────────────────────────────────────
export const SEMILLA = Number(process.env.SEMILLA ?? Math.floor(Math.random() * 2 ** 31));
export const ITERACIONES = process.env.ITERACIONES ? Math.max(1, Number(process.env.ITERACIONES)) : null;
// Iteraciones de un objetivo: ITERACIONES escala todos los objetivos respecto a 1000 (por defecto, `base`).
export const cuantas = (base: number): number => (ITERACIONES ? Math.max(1, Math.round((base * ITERACIONES) / 1000)) : base);

// Generador pseudoaleatorio reproducible (mulberry32).
export type Azar = {
  n: () => number; entero: (a: number, b: number) => number; si: (p?: number) => boolean;
  uno: <T>(xs: readonly T[]) => T; varios: <T>(xs: readonly T[], k: number) => T[];
};
export function azar(semilla: number): Azar {
  let s = semilla >>> 0;
  const n = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entero = (a: number, b: number) => a + Math.floor(n() * (b - a + 1));
  const uno = <T>(xs: readonly T[]): T => xs[Math.floor(n() * xs.length)];
  return { n, entero, si: (p = 0.5) => n() < p, uno, varios: (xs, k) => Array.from({ length: k }, () => uno(xs)) };
}

// ── Material de entradas raras ────────────────────────────────────────────
export const RAROS = [
  "\u0000", "́", "̧", "​", "‍", "‮", "‭", "⁦", "﻿", " ", "　",
  "\ud83d", "\ude00", "😀", "👩‍💻", "🏳️‍🌈", "ﷺ", "עברית", "العربية", "１２３", "Ｃ－", "ℂ", "𝐂", "ǅ", "ß", "İ",
  "\r\n", "\t", "\\", "\"", "'", "`", "${", "{{", "}}", "<script>", "%00", "%s", "../", " ", " ",
];
export function cadenaRara(a: Azar, largo: number): string {
  let s = "";
  while (s.length < largo) {
    const r = a.n();
    if (r < 0.45) s += String.fromCharCode(a.entero(32, 126));
    else if (r < 0.75) s += a.uno(RAROS);
    else if (r < 0.9) s += String.fromCharCode(a.entero(0x80, 0xffff));
    else s += String.fromCodePoint(a.entero(0x10000, 0x10ffff));
  }
  return s.slice(0, largo);
}

// ── Invariantes de fuga ───────────────────────────────────────────────────
export const CARNE_COMPLETO = /\b[CD]-\d{8}\b/g;
const FUGAS: [string, RegExp][] = [
  ["stack trace", /\n\s+at [^\n]*[(<]|at [\w.<>$]+ \([^)]*:\d+:\d+\)|node:internal|node_modules[\\/]/],
  ["cadena mongodb", /mongodb(?:\+srv)?:\/\//i],
  ["hash scrypt", /scrypt\$/],
];
// Fugas en un texto de respuesta: tipo y fragmento. `permitidos` = carnés que sí pueden salir (ninguno por defecto).
export function fugas(texto: string, permitidos: string[] = []): string[] {
  const out: string[] = [];
  for (const [tipo, re] of FUGAS) {
    const m = texto.match(re);
    if (m) out.push(`${tipo}: «${texto.slice(Math.max(0, m.index! - 40), m.index! + 80).replace(/\s+/g, " ")}»`);
  }
  const carnes = [...new Set([...texto.matchAll(CARNE_COMPLETO)].map((m) => m[0]))].filter((c) => !permitidos.includes(c));
  if (carnes.length) out.push(`carné completo: ${carnes.join(", ")}`);
  return out;
}

// ── Traza: logs/evaluaciones.jsonl vuelve a su tamaño inicial ─────────────
const LOG = fileURLToPath(new URL("../../logs/evaluaciones.jsonl", import.meta.url));
export const tamLog = (): number => { try { return statSync(LOG).size; } catch { return -1; } };
export function restaurarLog(tam: number): void {
  try { if (tam >= 0 && tamLog() > tam) truncateSync(LOG, tam); } catch { /* sin traza */ }
}

// ── Protocolo hijo → padre ────────────────────────────────────────────────
export type Hallazgo = { objetivo: string; detalle: string; entrada: unknown; minima?: unknown; ms?: number };
type Registro =
  | { tipo: "objetivo"; id: string; texto: string }
  | { tipo: "fallo"; h: Hallazgo }
  | { tipo: "nota"; id: string; texto: string }
  | { tipo: "volumen"; id: string; n: number }
  | { tipo: "fin"; ms: number };

const ES_HIJO = (nombre: string) => process.env.FUZZ_HIJO === nombre;
const leerRegistros = (archivo: string): Registro[] =>
  existsSync(archivo) ? readFileSync(archivo, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Registro) : [];
const anotarReg = (archivo: string, r: Registro) => appendFileSync(archivo, JSON.stringify(r) + "\n");
const corto = (x: unknown, n = 260): string => {
  const s = typeof x === "string" ? JSON.stringify(x) : JSON.stringify(x);
  return s.length > n ? `${s.slice(0, n)}… (${s.length} car.)` : s;
};

// Contexto que recibe el fuzzer dentro del hijo.
export type Fuzz = {
  semilla: number; desde: number; repro: unknown | null;
  objetivo: (id: string, texto: string) => void;
  // Antes de cada entrada (síncrono): si el proceso se congela aquí, el padre sabe cuál fue.
  paso: (i: number, objetivo: string, unidad: unknown) => void;
  fallo: (h: Hallazgo) => void;
  nota: (id: string, texto: string) => void;
  volumen: (id: string, n: number) => void;
  fallosDe: (id: string) => number;
  terminar: () => never;
};

export function contextoHijo(nombre: string): Fuzz {
  if (!ES_HIJO(nombre)) throw new Error("contextoHijo solo dentro del proceso hijo");
  const progreso = process.env.FUZZ_PROGRESO!, resultados = process.env.FUZZ_RESULTADOS!;
  const inicio = Date.now();
  const cuenta = new Map<string, number>();
  const tam = Number(process.env.FUZZ_TAM_LOG ?? tamLog());
  const repro = process.env.FUZZ_REPRO ? JSON.parse(process.env.FUZZ_REPRO) : null;
  return {
    semilla: SEMILLA,
    desde: Number(process.env.FUZZ_DESDE ?? 0),
    repro,
    objetivo: (id, texto) => { if (!repro) anotarReg(resultados, { tipo: "objetivo", id, texto }); },
    paso: (i, objetivo, unidad) => writeFileSync(progreso, JSON.stringify({ i, objetivo, unidad, t: Date.now() })),
    fallo: (h) => {
      cuenta.set(h.objetivo, (cuenta.get(h.objetivo) ?? 0) + 1);
      if (repro) return;
      anotarReg(resultados, { tipo: "fallo", h });
      if ((cuenta.get(h.objetivo) ?? 0) <= 3) {
        console.log(`   ❌ [${h.objetivo}] ${h.detalle}\n      entrada: ${corto(h.entrada)}${h.minima !== undefined ? `\n      mínima:  ${corto(h.minima)}` : ""}`);
      }
    },
    nota: (id, texto) => { if (!repro) { anotarReg(resultados, { tipo: "nota", id, texto }); console.log(`   · ${texto}`); } },
    volumen: (id, n) => { if (!repro) anotarReg(resultados, { tipo: "volumen", id, n }); },
    fallosDe: (id) => cuenta.get(id) ?? 0,
    terminar: () => {
      restaurarLog(tam);
      if (!repro) anotarReg(resultados, { tipo: "fin", ms: Date.now() - inicio });
      process.exit(repro ? (cuenta.size ? 1 : 0) : 0);
    },
  };
}

// ── Reducción de entradas (delta debugging sencillo) ──────────────────────
// Unidad = lista de mensajes. Quita mensajes, luego palabras, luego caracteres, mientras la prueba siga fallando.
export async function reducir(unidad: string[], falla: (u: string[]) => Promise<boolean>, presupuesto = 200): Promise<string[]> {
  let actual = unidad.slice();
  let gastado = 0;
  const intentar = async (c: string[]) => {
    if (gastado++ >= presupuesto) return false;
    if (await falla(c)) { actual = c; return true; }
    return false;
  };
  // 1) Mensajes: primero solo el último, luego quitar de a uno.
  if (actual.length > 1) await intentar([actual[actual.length - 1]]);
  for (let i = 0; i < actual.length && actual.length > 1;) {
    if (!(await intentar(actual.filter((_, j) => j !== i)))) i++;
  }
  // 2) Palabras y 3) caracteres de cada mensaje.
  for (let k = 0; k < actual.length; k++) {
    for (const sep of [" ", ""]) {
      let partes = sep ? actual[k].split(" ") : [...actual[k]];
      for (let tam = Math.max(1, Math.floor(partes.length / 2)); tam >= 1; tam = Math.floor(tam / 2)) {
        for (let i = 0; i + tam <= partes.length;) {
          const cand = partes.slice(0, i).concat(partes.slice(i + tam));
          const msg = cand.join(sep);
          if (msg.length && (await intentar(actual.map((m, j) => (j === k ? msg : m))))) partes = cand;
          else i += tam;
        }
        if (tam === 1) break;
      }
    }
  }
  return actual;
}

// ── Padre: lanza y vigila al hijo ─────────────────────────────────────────
export type Resumen = { nombre: string; fallos: number; objetivos: number; ms: number; hallazgos: Hallazgo[] };

type OpcionesVigilar = { limiteSinAvanceMs?: number; nodeArgs?: string[]; maxReinicios?: number; reducirBloqueos?: boolean };

function lanzar(archivo: string, env: Record<string, string>, nodeArgs: string[], limiteMs: number, progreso: string, eco: boolean):
  Promise<{ codigo: number | null; senal: string | null; colgado: boolean; stderr: string }> {
  return new Promise((listo) => {
    const hijo = spawn(process.execPath, [...process.execArgv, ...nodeArgs, archivo], {
      env: { ...process.env, ...env }, stdio: ["ignore", eco ? "inherit" : "ignore", "pipe"],
    });
    let stderr = "";
    hijo.stderr!.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-4000); });
    let ultimo = "", visto = Date.now(), colgado = false;
    const reloj = setInterval(() => {
      let ahora = "";
      try { ahora = readFileSync(progreso, "utf8"); } catch { /* aún no escribe */ }
      if (ahora !== ultimo) { ultimo = ahora; visto = Date.now(); return; }
      if (Date.now() - visto > limiteMs) { colgado = true; hijo.kill("SIGKILL"); }
    }, 200);
    hijo.on("exit", (codigo, senal) => { clearInterval(reloj); listo({ codigo, senal, colgado, stderr }); });
  });
}

// Lanza `archivo` como hijo del fuzzer `nombre`, reintenta tras un bloqueo y devuelve el resumen.
export async function vigilar(nombre: string, archivo: string, op: OpcionesVigilar = {}): Promise<Resumen> {
  const limite = op.limiteSinAvanceMs ?? 10_000;
  const base = join(tmpdir(), `guardian-fuzz-${nombre}-${process.pid}`);
  const progreso = `${base}.progreso`, resultados = `${base}.resultados`;
  writeFileSync(resultados, "");
  writeFileSync(progreso, "");
  const tam = tamLog();
  const envBase = {
    FUZZ_HIJO: nombre, FUZZ_PROGRESO: progreso, FUZZ_RESULTADOS: resultados, FUZZ_TAM_LOG: String(tam),
    SEMILLA: String(SEMILLA), REPOSITORIO: "memoria", PROVEEDOR: "ollama", MODELO_TIEMPO_MS: "2000",
    ...(process.env.ITERACIONES ? { ITERACIONES: process.env.ITERACIONES } : {}),
  };
  const inicio = Date.now();
  let desde = 0;
  for (let intento = 0; intento <= (op.maxReinicios ?? 4); intento++) {
    const r = await lanzar(archivo, { ...envBase, FUZZ_DESDE: String(desde) }, op.nodeArgs ?? [], limite, progreso, true);
    restaurarLog(tam);
    if (leerRegistros(resultados).some((x) => x.tipo === "fin")) break;
    // El hijo no terminó: congelado (sin avance) o caído (excepción no atrapada, memoria agotada…).
    let p: { i: number; objetivo: string; unidad: unknown } | null = null;
    try { p = JSON.parse(readFileSync(progreso, "utf8")); } catch { /* murió antes de la primera entrada */ }
    const causa = r.colgado ? `el proceso se congeló (sin avance en ${limite / 1000} s)` : `el proceso cayó (código ${r.codigo}, señal ${r.senal}): ${r.stderr.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`;
    const h: Hallazgo = { objetivo: p?.objetivo ?? "arranque", detalle: causa, entrada: p?.unidad ?? null };
    if (p && Array.isArray(p.unidad) && op.reducirBloqueos !== false) {
      console.log(`   … reduciendo la entrada que ${r.colgado ? "congeló" : "tumbó"} el proceso`);
      const reproLimite = Math.min(limite, 3000);
      h.minima = await reducir(p.unidad as string[], async (u) => {
        const x = await lanzar(archivo, { ...envBase, FUZZ_REPRO: JSON.stringify({ objetivo: p!.objetivo, unidad: u }) }, op.nodeArgs ?? [], reproLimite, progreso, false);
        restaurarLog(tam);
        return x.colgado || (x.codigo !== 0 && x.codigo !== 1);
      }, 14);
    }
    anotarReg(resultados, { tipo: "fallo", h });
    console.log(`   ❌ [${h.objetivo}] ${h.detalle}\n      entrada: ${corto(h.entrada)}${h.minima ? `\n      mínima:  ${corto(h.minima)}` : ""}`);
    if (!p) break;
    desde = p.i + 1;
  }
  restaurarLog(tam);
  // Resumen por objetivo.
  const regs = leerRegistros(resultados);
  const objetivos = regs.filter((x): x is Extract<Registro, { tipo: "objetivo" }> => x.tipo === "objetivo");
  const unicos = [...new Map(objetivos.map((o) => [o.id, o])).values()];
  const hallazgos = regs.filter((x): x is Extract<Registro, { tipo: "fallo" }> => x.tipo === "fallo").map((x) => x.h);
  const volumen = new Map<string, number>();
  for (const v of regs) if (v.tipo === "volumen") volumen.set(v.id, (volumen.get(v.id) ?? 0) + v.n);
  console.log(`\n── ${nombre}: resumen (semilla ${SEMILLA}, ${((Date.now() - inicio) / 1000).toFixed(1)} s) ──`);
  let fallos = 0;
  for (const o of unicos) {
    const n = hallazgos.filter((h) => h.objetivo === o.id).length;
    if (n) fallos++;
    const vol = volumen.get(o.id);
    console.log(`${n ? "❌" : "✅"} ${o.id}: ${o.texto}${vol ? ` (${vol} entradas)` : ""}${n ? ` — ${n} hallazgo(s)` : ""}`);
  }
  for (const h of hallazgos.filter((h) => !unicos.some((o) => o.id === h.objetivo))) {
    fallos++;
    console.log(`❌ ${h.objetivo}: ${h.detalle}`);
  }
  return { nombre, fallos, objetivos: unicos.length, ms: Date.now() - inicio, hallazgos };
}

// Punto de entrada de cada fuzzer: en el padre vigila al hijo y sale; en el hijo devuelve el contexto.
export async function arrancar(nombre: string, url: string, op: OpcionesVigilar = {}): Promise<Fuzz> {
  if (ES_HIJO(nombre)) return contextoHijo(nombre);
  console.log(`Fuzzing ${nombre} — semilla ${SEMILLA} (repetir con SEMILLA=${SEMILLA})`);
  const r = await vigilar(nombre, fileURLToPath(url), op);
  console.log(r.fallos === 0 ? "\nTodas pasaron" : `\n${r.fallos} fallaron`);
  process.exit(r.fallos === 0 ? 0 : 1);
}

export const OPCIONES: Record<string, OpcionesVigilar> = {
  redos: { limiteSinAvanceMs: 20_000, reducirBloqueos: false },
  api: { limiteSinAvanceMs: 10_000 },
  login: { limiteSinAvanceMs: 15_000, reducirBloqueos: false },
  chat: { limiteSinAvanceMs: 6_000, nodeArgs: ["--max-old-space-size=768"] },
  memoria: { limiteSinAvanceMs: 30_000, nodeArgs: ["--expose-gc"], reducirBloqueos: false },
};
