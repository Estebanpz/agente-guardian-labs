// Utilidades compartidas de los análisis de la sección 5 de la guía (Fase 2).
// Todo es determinista: los datos simulados usan una semilla fija.
import type { DecisionReserva, SolicitudReserva } from "../agent/tools/esquemas-reservas.js";
import { evaluarReserva, type Contexto } from "../agent/tools/reservas.js";
import { ahora } from "../agent/tools/reloj.js";
import type { Repositorio } from "../agent/store/repositorio.js";

export type Seccion = {
  id: string;
  titulo: string;
  uso: "Se usa" | "Ejemplo, no se usa en producción" | "Justificado, no se usa";
  evidencia: string;
  md: string;
  verificaciones: [string, boolean][];
};

// Generador pseudoaleatorio con semilla (mulberry32): mismos números en cada ejecución.
export function rng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Número con coma decimal (estilo del informe).
export const num = (x: number, d = 2): string => x.toFixed(d).replace(".", ",");
export const pct = (x: number): string => `${num(100 * x, 1)} %`;

export function tabla(encabezado: string[], filas: (string | number)[][]): string {
  const linea = (c: (string | number)[]) => `| ${c.map((x) => String(x).replaceAll("|", "\\|")).join(" | ")} |`;
  return [linea(encabezado), `|${encabezado.map(() => "---").join("|")}|`, ...filas.map(linea)].join("\n");
}

export const FECHA_PRUEBA = "2026-11-10"; // mañana, con el reloj fijo en lunes 2026-11-09 08:00

export const solicitud = (p: Partial<SolicitudReserva>): SolicitudReserva => ({
  carne: null, fecha: FECHA_PRUEBA, inicio: null, fin: null, sala: null,
  personas: null, equipos: null, computo_alto: null, materia: null, ...p,
});

export async function contexto(repo: Repositorio, carne: string | null, fecha: string | null): Promise<Contexto> {
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

export async function decidir(repo: Repositorio, s: SolicitudReserva): Promise<DecisionReserva> {
  return evaluarReserva(s, await contexto(repo, s.carne, s.fecha));
}

// Intervalo de Wilson al 95 % para una proporción (muestra la incertidumbre del tamaño de muestra).
export function wilson(exitos: number, n: number): [number, number] {
  const z = 1.96;
  const p = exitos / n;
  const den = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / den;
  const margen = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [centro - margen, centro + margen];
}
