import { salas } from "../../data/salas.js";
import { equipos } from "../../data/equipos.js";
import type { Equipo } from "./esquemas.js";
import { claseEquipo } from "./estados.js";
import type { SalaLaboratorio } from "../api-tipos.js";

// Estado visible de un equipo combinando las dos fuentes (inventario y mantenimiento); clase de tools/estados.ts.
const estadoVisible = (q: Equipo) => {
  const c = claseEquipo(q);
  return c === "desconocido" ? "desconocido" : c === "contradictorio" ? "conflicto" : q.inventario;
};

export function resumenSalas(): SalaLaboratorio[] {
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
