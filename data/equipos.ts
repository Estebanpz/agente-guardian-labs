import type { Equipo } from "../agent/tools/esquemas.js";

// Inventario sintético. PC-07 está en conflicto entre fuentes (P-05 y P-09).
export const equipos: Equipo[] = [
  { id: "PC-01", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { id: "PC-02", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { id: "PC-03", inventario: "disponible", mantenimiento: "disponible", accesible: true },
  { id: "PC-04", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { id: "PC-05", inventario: "disponible", mantenimiento: "disponible", accesible: true },
  { id: "PC-06", inventario: "mantenimiento", mantenimiento: "mantenimiento", accesible: false },
  { id: "PC-07", inventario: "disponible", mantenimiento: "diagnostico", accesible: false },
  { id: "PC-08", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { id: "PC-09", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { id: "PC-10", inventario: "disponible", mantenimiento: "disponible", accesible: false },
];
