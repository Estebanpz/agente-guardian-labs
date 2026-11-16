// Reloj de Bogotá. En producción usa la hora real; en pruebas se fija con fijarReloj.
const ZONA = "America/Bogota";

let fijo: { fecha: string; hhmm: string } | null = null;

// "13:30" → 810. Única conversión de hora a minutos (también la usa motor.ts). Hallazgo 1 de la auditoría
// (16-11-2026): una hora mal formada ("7", "7-30", "830", "25:00") lanza un error claro en vez de devolver NaN,
// que hacía falsa en silencio cualquier comparación (por ejemplo, la llegada tarde de R11).
export const aMin = (hhmm: string): number => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Hora inválida: "${hhmm}" (se espera HH:MM entre 00:00 y 23:59)`);
  return Number(m[1]) * 60 + Number(m[2]);
};

// 810 → "13:30"
export const aHora = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// 1 = lunes … 7 = domingo (ISO), para una fecha aaaa-mm-dd.
export function diaSemana(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

// Suma n días a una fecha aaaa-mm-dd (aritmética de calendario, sin zona horaria).
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Fecha y minutos del día en Bogotá (o los fijados para pruebas).
export function ahora(): { fecha: string; minutos: number; diaSemana: number } {
  if (fijo) {
    return { fecha: fijo.fecha, minutos: aMin(fijo.hhmm), diaSemana: diaSemana(fijo.fecha) };
  }
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const fecha = `${v("year")}-${v("month")}-${v("day")}`;
  const minutos = Number(v("hour")) * 60 + Number(v("minute"));
  return { fecha, minutos, diaSemana: diaSemana(fecha) };
}

// Solo pruebas.
export function fijarReloj(fecha: string, hhmm: string): void {
  fijo = { fecha, hhmm };
}

export function liberarReloj(): void {
  fijo = null;
}

// Fecha de hoy en Bogotá (aaaa-mm-dd). Respeta el reloj fijado en pruebas.
export const hoyBogota = (): string => ahora().fecha;
