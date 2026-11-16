// Filtros y estado de cada sala (plan de la vista, sección 4). Portado de la referencia (función `pasa`).
import type { ClaseEquipo, EquipoDelDia, ReservaDelDia, SalaDelDia } from "../../../../agent/api-tipos";
import { aMin, aHora, ABRE, CIERRA } from "./tiempo";

export const FILTROS = [
  ["todas", "Todas"],
  ["libres", "Libres"],
  ["reservas", "Con reservas"],
  ["escaladas", "Con escaladas"],
  ["revision", "Equipos en revisión"],
  ["alto", "Alto cómputo"],
] as const;
export type FiltroId = (typeof FILTROS)[number][0];
export const FILTRO_IDS: readonly FiltroId[] = FILTROS.map(([id]) => id);
export const esFiltro = (v: string | null): v is FiltroId => FILTRO_IDS.includes(v as FiltroId);

// Rango "Libre desde / hasta" en minutos del día.
export type RangoLibre = { desde: number; hasta: number };
// Datos de una sala para el día (datosDeSala).
export type InfoSala = {
  sala: SalaDelDia; reservas: ReservaDelDia[]; actual: ReservaDelDia | null; libreRango: boolean; escalada: boolean;
};
export type EstadoSala = { texto: string; tono: "libre" | "ocupada" | "escalada" };

// Clase de un equipo: la misma regla que agent/tools/estados.ts (el servidor la envía en `clase`; esta copia solo
// cubre una API antigua que no la envía). Si cambias una, cambia la otra y la prueba evals/auditoria.ts.
type EquipoSinClase = Pick<EquipoDelDia, "inventario" | "mantenimiento"> & { clase?: ClaseEquipo };
export const claseEquipo = (q: EquipoSinClase): ClaseEquipo => {
  if (q.clase) return q.clase;
  if (q.inventario === "disponible" && q.mantenimiento === "disponible") return "operativo";
  if (q.inventario === "desconocido" || q.mantenimiento === "desconocido") return "desconocido";
  if (q.inventario !== q.mantenimiento) return "contradictorio";
  return "no_operativo";
};

// Equipos en revisión de una sala: los que no están operativos.
export const enRevisionDe = (sala: { equipos?: EquipoSinClase[] }): number =>
  (sala.equipos ?? []).filter((q) => claseEquipo(q) !== "operativo").length;

// Etiqueta del filtro "libres" según el día y el rango elegido.
export const etiquetaLibres = ({ rango, esHoy }: { rango: boolean; esHoy: boolean }): string =>
  (rango ? "Libres en el rango" : esHoy ? "Libres ahora" : "Sin reservas");

// Datos de una sala para el día: reservas ordenadas, la que ocupa ahora, y si está libre en el rango.
export function datosDeSala(
  sala: SalaDelDia, { esHoy, ahoraMin, rango }: { esHoy: boolean; ahoraMin: number; rango: RangoLibre | null },
): InfoSala {
  const reservas = [...sala.reservas].sort((a, b) => a.inicio_min - b.inicio_min);
  const actual = esHoy ? reservas.find((r) => r.inicio_min <= ahoraMin && r.fin_min > ahoraMin) ?? null : null;
  const libreRango = rango
    ? !reservas.some((r) => r.inicio_min < rango.hasta && r.fin_min > rango.desde)
    : true;
  return {
    sala,
    reservas,
    actual,
    libreRango,
    escalada: reservas.some((r) => r.estado === "escalada"),
  };
}

// Predicado de cada filtro (portado de la referencia).
export function pasa(filtro: FiltroId, x: InfoSala, { esHoy, rango }: { esHoy: boolean; rango: RangoLibre | null }): boolean {
  switch (filtro) {
    case "libres":
      return rango ? x.libreRango : esHoy ? !x.actual : x.reservas.length === 0;
    case "reservas":
      return x.reservas.length > 0;
    case "escaladas":
      return x.escalada;
    case "revision":
      return enRevisionDe(x.sala) > 0;
    case "alto":
      return x.sala.computo === "alto";
    default:
      return true;
  }
}

// Rango "Libre desde / hasta": válido solo si la hora final es posterior a la inicial.
export const rangoDe = (desde: string, hasta: string): RangoLibre | null => {
  if (!desde || !hasta) return null;
  const d = aMin(desde);
  const h = aMin(hasta);
  return h > d ? { desde: d, hasta: h } : null;
};

// Estado que se muestra en la tabla para cada sala.
export function estadoDeSala(x: InfoSala, { esHoy, ahoraMin }: { esHoy: boolean; ahoraMin: number }): EstadoSala {
  let texto = "Libre todo el día";
  let tono: EstadoSala["tono"] = "libre";
  if (esHoy) {
    if (x.actual) {
      texto = `Ocupada hasta ${x.actual.fin}`;
      tono = x.actual.estado === "escalada" ? "escalada" : "ocupada";
    } else {
      const proxima = x.reservas.find((r) => r.inicio_min > ahoraMin);
      texto = proxima ? `Libre hasta ${proxima.inicio}` : "Libre ahora";
    }
  } else if (x.reservas.length) {
    texto = `${x.reservas.length} ${x.reservas.length === 1 ? "reserva" : "reservas"}`;
    tono = "ocupada";
  }
  if (x.escalada && tono !== "escalada") {
    texto += " · escalada";
    tono = "escalada";
  }
  return { texto, tono };
}

export { aHora, ABRE, CIERRA };
