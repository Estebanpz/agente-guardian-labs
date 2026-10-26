import { salas } from "../../data/salas.js";
import { equipos } from "../../data/equipos.js";
import type { Equipo } from "./esquemas.js";

// Estado visible de un equipo combinando las dos fuentes (inventario y mantenimiento).
const estadoVisible = (q: Equipo) => {
  if (q.inventario === "desconocido" || q.mantenimiento === "desconocido") return "desconocido";
  if (q.inventario !== q.mantenimiento) return "conflicto"; // misma condición que R3
  return q.inventario;
};

export function resumenSalas() {
  return salas.map((s) => {
    const eq = equipos
      .filter((q) => q.sala === s.id)
      .map((q) => ({
        id: q.id,
        accesible: q.accesible,
        estado: estadoVisible(q),
        inventario: q.inventario,
        mantenimiento: q.mantenimiento,
      }));
    return {
      ...s,
      ocupacion: s.capacidad ? Math.round((100 * s.aforo_actual) / s.capacidad) : 0,
      lleno: s.aforo_actual >= s.capacidad,
      disponibles: eq.filter((q) => q.estado === "disponible").length,
      equipos: eq,
    };
  });
}
