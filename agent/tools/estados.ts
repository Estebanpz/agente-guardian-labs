// Única definición del estado de un equipo (hallazgo 6 de la auditoría del 16-11-2026). La usan el motor de
// reservas, el chat, la API y la vista Laboratorios; no la copies en otro módulo:
// - operativo: inventario y mantenimiento "disponible";
// - desconocido: alguna de las dos fuentes no sabe (R2/R19);
// - contradictorio: ambas fuentes saben y no coinciden (R3/R19);
// - no_operativo: ambas coinciden en un estado distinto de "disponible" (mantenimiento o diagnóstico).
// "Incierto" = desconocido o contradictorio. "En revisión" (vista Salas) = todo lo que no es operativo.
type Estado = "disponible" | "mantenimiento" | "diagnostico" | "desconocido";

export type ClaseEquipo = "operativo" | "desconocido" | "contradictorio" | "no_operativo";

export function claseEquipo(q: { inventario: Estado; mantenimiento: Estado }): ClaseEquipo {
  if (q.inventario === "disponible" && q.mantenimiento === "disponible") return "operativo";
  if (q.inventario === "desconocido" || q.mantenimiento === "desconocido") return "desconocido";
  if (q.inventario !== q.mantenimiento) return "contradictorio";
  return "no_operativo";
}

export const esIncierto = (c: ClaseEquipo): boolean => c === "desconocido" || c === "contradictorio";
