// Filtros y estado de cada sala (plan de la vista, sección 4). Portado de la referencia (función `pasa`).
import { aMin, aHora, ABRE, CIERRA } from "./tiempo.js";

export const FILTROS = [
  ["todas", "Todas"],
  ["libres", "Libres"],
  ["reservas", "Con reservas"],
  ["escaladas", "Con escaladas"],
  ["revision", "Equipos en revisión"],
  ["alto", "Alto cómputo"],
];
export const FILTRO_IDS = FILTROS.map(([id]) => id);

// Equipos en revisión de una sala: los que no están operativos (inventario o mantenimiento distintos de "disponible").
// Se calcula desde la lista de equipos: no depende de un campo que una API antigua no envía.
export const enRevisionDe = (sala) =>
  (sala.equipos ?? []).filter((q) => !(q.inventario === "disponible" && q.mantenimiento === "disponible")).length;

// Etiqueta del filtro "libres" según el día y el rango elegido.
export const etiquetaLibres = ({ rango, esHoy }) => (rango ? "Libres en el rango" : esHoy ? "Libres ahora" : "Sin reservas");

// Datos de una sala para el día: reservas ordenadas, la que ocupa ahora, y si está libre en el rango.
export function datosDeSala(sala, { esHoy, ahoraMin, rango }) {
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
export function pasa(filtro, x, { esHoy, rango }) {
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
export const rangoDe = (desde, hasta) => {
  if (!desde || !hasta) return null;
  const d = aMin(desde);
  const h = aMin(hasta);
  return h > d ? { desde: d, hasta: h } : null;
};

// Estado que se muestra en la tabla para cada sala.
export function estadoDeSala(x, { esHoy, ahoraMin }) {
  let texto = "Libre todo el día";
  let tono = "libre";
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
