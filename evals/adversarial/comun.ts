// Arnés de las pruebas adversariales (red team). Solo memoria y modelo simulado: no toca MongoDB ni Ollama.
// Se ejecuta con REPOSITORIO=memoria para que la API también use memoria.
import { statSync, truncateSync } from "node:fs";
import { configurarParaPruebas, mensaje } from "../../agent/orquestador.js";
import { crearMemoria } from "../../agent/store/memoria.js";
import type { Repositorio } from "../../agent/store/repositorio.js";
import { fijarReloj } from "../../agent/tools/reloj.js";
import type { Interpretacion } from "../../agent/llm/interprete.js";
import { modeloSimulado } from "../modelo-simulado.js";

if (process.env.REPOSITORIO === "mongo") {
  console.error("Abortado: estas pruebas solo corren con REPOSITORIO=memoria.");
  process.exit(2);
}

// La traza (logs/evaluaciones.jsonl, ignorado por git) se deja como estaba al terminar.
const LOG = new URL("../../logs/evaluaciones.jsonl", import.meta.url);
const tamLog = (() => { try { return statSync(LOG).size; } catch { return -1; } })();
export const restaurarLog = (): void => { if (tamLog >= 0) truncateSync(LOG, tamLog); };
export const tamanoLogInicial = tamLog;

export type Clasificador = (t: string) => Promise<Interpretacion & { fallo?: string }>;
export type Salida = Record<string, any>;

export const HOY = "2026-11-09";
export const uuid = (n: number): string => `0000${String(n).padStart(4, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;

export function nuevoEntorno(hora = "10:00", interpretar: Clasificador = modeloSimulado): Repositorio {
  fijarReloj(HOY, hora);
  const repo = crearMemoria(HOY);
  configurarParaPruebas({ repo, interpretar });
  return repo;
}

// Como lo hace la API desde el 14-11-2026: `autenticado` es el carné del token (o null sin sesión).
export async function hablarComo(sesion: string, autenticado: string | null, textos: string[]): Promise<Salida[]> {
  const out: Salida[] = [];
  for (const t of textos) out.push((await mensaje(t, { sesion, autenticado })) as Salida);
  return out;
}

export async function hablar(sesion: string | undefined, textos: string[]): Promise<Salida[]> {
  const out: Salida[] = [];
  for (const t of textos) out.push((await mensaje(t, { sesion })) as Salida);
  return out;
}

export type Fila = {
  id: string; categoria: string; entrada: string; esperado: string; observado: string; falla: boolean;
};
export const filas: Fila[] = [];
export function anotar(id: string, categoria: string, entrada: string, esperado: string, observado: string, falla: boolean): void {
  filas.push({ id, categoria, entrada, esperado, observado: observado.replace(/\s+/g, " ").slice(0, 300), falla });
}

export function imprimir(titulo: string): void {
  console.log(`\n== ${titulo} ==`);
  for (const f of filas) console.log(`${f.falla ? "FALLA " : "RESISTE"} ${f.id} [${f.categoria}] ${f.entrada}\n   esperado: ${f.esperado}\n   observado: ${f.observado}`);
  console.log(`Total ${filas.length}, fallas ${filas.filter((f) => f.falla).length}`);
}

// Nombres y apellidos de la semilla (para buscar fugas en cualquier JSON).
export const NOMBRES: Record<string, string> = {
  "C-10000002": "Juan Camilo", "D-20000001": "Carlos Eduardo", "D-20000002": "Patricia Elena",
};
export const json = (x: unknown): string => JSON.stringify(x);
