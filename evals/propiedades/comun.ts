// Arnés de las pruebas basadas en propiedades (fast-check). Solo datos sintéticos, sin MongoDB ni Ollama.
// Uso: npm run propiedades (todas) o npx tsx evals/propiedades/<archivo>.ts (un grupo).
// Reproducir: SEMILLA=<número> npm run propiedades. Cada fallo imprime la semilla y el path de fast-check.
import fc from "fast-check";
import { pathToFileURL } from "node:url";

export { fc };

const env = process.env.SEMILLA;
export const SEMILLA = env !== undefined && env !== "" && Number.isFinite(Number(env)) ? Number(env) : (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;

type Prop = fc.IProperty<any> | fc.IAsyncProperty<any>;
const marcador = { fallos: 0, pasaron: 0, hallazgos: 0, hallazgosResueltos: 0 };
const filas: string[] = [];

const recortar = (l: string, max = 600) => (l.length > max ? `${l.slice(0, max)}… (${l.length} caracteres)` : l);

// Primeras líneas útiles del error de fc.assert: contraejemplo, semilla y path.
function resumenError(e: unknown): string {
  const m = (e as Error).message ?? String(e);
  const lineas = m.split("\n").filter((l) => l.trim());
  const util = lineas.filter((l) => /Counterexample|seed|path|Shrunk|Got error|Property failed/i.test(l)).slice(0, 5);
  return (util.length ? util : lineas.slice(0, 4)).map((l) => `     ${recortar(l.trim())}`).join("\n");
}

// Propiedad que debe cumplirse.
export async function propiedad(nombre: string, prop: Prop, numRuns: number): Promise<void> {
  const t0 = Date.now();
  try {
    await fc.assert(prop as fc.IAsyncProperty<any>, { numRuns, seed: SEMILLA });
    marcador.pasaron++;
    const fila = `✅ ${nombre} (${numRuns} casos, ${Date.now() - t0} ms)`;
    filas.push(fila);
    console.log(fila);
  } catch (e) {
    marcador.fallos++;
    const fila = `❌ ${nombre} (${numRuns} casos, ${Date.now() - t0} ms)`;
    filas.push(fila);
    console.log(`${fila}\n${resumenError(e)}`);
  }
}

// Hallazgo conocido: la propiedad describe el comportamiento correcto y HOY falla por un defecto del código que
// estas pruebas no corrigen. Se espera que falle; no cuenta como fallo de la corrida. Si un día pasa, el defecto
// se corrigió y hay que pasarla a `propiedad`.
export async function hallazgo(nombre: string, prop: Prop, numRuns: number, nota: string): Promise<void> {
  const t0 = Date.now();
  try {
    await fc.assert(prop as fc.IAsyncProperty<any>, { numRuns, seed: SEMILLA });
    marcador.hallazgosResueltos++;
    const fila = `✅ ${nombre} (${numRuns} casos) — el hallazgo conocido ya no se reproduce: pásala a propiedad()`;
    filas.push(fila);
    console.log(fila);
  } catch (e) {
    marcador.hallazgos++;
    const fila = `⚠️  HALLAZGO ${nombre} (${numRuns} casos, ${Date.now() - t0} ms)`;
    filas.push(fila);
    console.log(`${fila}\n     ${nota}\n${resumenError(e)}`);
  }
}

export function grupo(titulo: string): void {
  console.log(`\n── ${titulo} ──`);
}

export function terminar(t0: number): never {
  const { fallos, pasaron, hallazgos, hallazgosResueltos } = marcador;
  console.log(`\nSemilla: ${SEMILLA} · ${pasaron + fallos + hallazgos + hallazgosResueltos} propiedades · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (hallazgos) console.log(`${hallazgos} hallazgo(s) conocido(s) documentado(s) (no cuentan como fallo).`);
  console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
  process.exit(fallos === 0 ? 0 : 1);
}

// true si el archivo se ejecuta directamente (no importado por index.ts).
export const esPrincipal = (url: string): boolean => process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === url;

// ── Generadores compartidos ─────────────────────────────────────────────
export const HOY = "2026-11-09"; // lunes
export const digitos = (min: number, max: number) =>
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: min, maxLength: max }).map((d) => d.join(""));
export const carneArb = fc.tuple(fc.constantFrom("C", "D"), digitos(8, 8)).map(([p, d]) => `${p}-${d}`);
// Cambia mayúsculas y minúsculas al azar, letra por letra.
export const conMayusculasAlAzar = (texto: string) =>
  fc.array(fc.boolean(), { minLength: texto.length, maxLength: texto.length })
    .map((bs) => [...texto].map((ch, i) => (bs[i] ? ch.toUpperCase() : ch.toLowerCase())).join(""));
