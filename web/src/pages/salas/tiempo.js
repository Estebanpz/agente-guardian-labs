// Tiempo de la vista Salas: minutos del día, posiciones en la línea 07:00–22:00 y huecos libres.
// Portado de la referencia (docs/plan/diseno-salas/variante-a.dc.html, bloque de script).

export const ABRE = 420; // 07:00
export const CIERRA = 1320; // 22:00

export const aMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const aHora = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const porcentaje = (min) => ((min - ABRE) / (CIERRA - ABRE)) * 100;

// Posición de un rango dentro de la línea de tiempo (en %).
export const posicion = (inicio, fin) => ({
  left: `${porcentaje(inicio).toFixed(2)}%`,
  width: `${(((fin - inicio) / (CIERRA - ABRE)) * 100).toFixed(2)}%`,
});

export const posicionAhora = (min) => ({ left: `${porcentaje(min).toFixed(2)}%` });

// Rangos libres de al menos `minimo` minutos entre ABRE y CIERRA. `reservas` lleva inicio_min y fin_min.
export function huecos(reservas, minimo = 30) {
  const out = [];
  let cursor = ABRE;
  [...reservas]
    .sort((a, b) => a.inicio_min - b.inicio_min)
    .forEach((r) => {
      if (r.inicio_min - cursor >= minimo) out.push({ inicio: cursor, fin: r.inicio_min });
      cursor = Math.max(cursor, r.fin_min);
    });
  if (CIERRA - cursor >= minimo) out.push({ inicio: cursor, fin: CIERRA });
  return out;
}

export function duracion(inicio, fin) {
  const total = fin - inicio;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const HORAS = Array.from({ length: (CIERRA - ABRE) / 30 + 1 }, (_, i) => aHora(ABRE + i * 30));

// Fechas (aaaa-mm-dd) en la zona de Bogotá, sin depender de la del navegador.
export const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

export function minutosAhora() {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = Number(partes.find((p) => p.type === "hour").value) % 24;
  const m = Number(partes.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

export const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// "lunes 9 de noviembre" (sin coma, como en la referencia).
export const fechaLarga = (fecha) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(",", "");

export const fechaCorta = (fecha) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(".", "");

// Hora de un instante (aviso atendido) en Bogotá: "9 nov, 10:31".
export const cuandoBogota = (fecha) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  }).format(new Date(fecha));
