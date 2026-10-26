import type { Equipo } from "../agent/tools/esquemas.js";

// Inventario sintético. PC-07 está en conflicto entre fuentes (P-05 y P-09).
export const equipos: Equipo[] = [
  { sala: "sala-1", id: "PC-01", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-1", id: "PC-02", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-1", id: "PC-03", inventario: "disponible", mantenimiento: "disponible", accesible: true },
  { sala: "sala-1", id: "PC-04", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-1", id: "PC-05", inventario: "disponible", mantenimiento: "disponible", accesible: true },
  { sala: "sala-1", id: "PC-06", inventario: "mantenimiento", mantenimiento: "mantenimiento", accesible: false },
  { sala: "sala-1", id: "PC-07", inventario: "disponible", mantenimiento: "diagnostico", accesible: false },
  { sala: "sala-1", id: "PC-08", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-1", id: "PC-09", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-1", id: "PC-10", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-2", id: "S2-01", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-2", id: "S2-02", inventario: "mantenimiento", mantenimiento: "mantenimiento", accesible: false },
  { sala: "sala-2", id: "S2-03", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-2", id: "S2-04", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-2", id: "S2-05", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-2", id: "S2-06", inventario: "disponible", mantenimiento: "disponible", accesible: true },
  { sala: "sala-3", id: "S3-01", inventario: "disponible", mantenimiento: "disponible", accesible: true },
  { sala: "sala-3", id: "S3-02", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-3", id: "S3-03", inventario: "diagnostico", mantenimiento: "diagnostico", accesible: false },
  { sala: "sala-3", id: "S3-04", inventario: "disponible", mantenimiento: "disponible", accesible: false },
  { sala: "sala-3", id: "S3-05", inventario: "disponible", mantenimiento: "desconocido", accesible: false },
];
