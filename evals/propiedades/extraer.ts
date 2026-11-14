// Propiedades de los extractores deterministas (agent/tools/extraer.ts): fechas, salas y carné.
import { carne, extraer, fecha, fechas, sala, salaInexistente } from "../../agent/tools/extraer.js";
import { HOY, carneArb, conMayusculasAlAzar, esPrincipal, fc, grupo, propiedad, terminar } from "./comun.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (n: number) => String(n).padStart(2, "0");
const existe = (f: string): boolean => {
  const [y, m, d] = f.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return /^\d{4}-\d{2}-\d{2}$/.test(f) && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const diasDelMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

const fechaValida = fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2027-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
// Fecha imposible: día más allá del fin de mes (31 de abril, 30 de febrero…) o mes 0/13+.
const fechaImposible = fc.oneof(
  fc.tuple(fc.integer({ min: 2026, max: 2027 }), fc.constantFrom(2, 4, 6, 9, 11)).chain(([y, m]) =>
    fc.integer({ min: diasDelMes(y, m) + 1, max: 31 }).map((d) => ({ y, m, d }))),
  fc.tuple(fc.integer({ min: 2026, max: 2027 }), fc.constantFrom(0, 13, 14, 19, 20, 99), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => ({ y, m, d })),
  fc.tuple(fc.integer({ min: 2026, max: 2027 }), fc.integer({ min: 1, max: 12 })).map(([y, m]) => ({ y, m, d: 0 })),
);
const frase = fc.constantFrom("", "quiero la sala 3 ", "reservar ", "somos 5, ", "de 2 a 4 ");
const final = fc.constantFrom("", " por favor", " de 2 a 4", ", somos 12", "?");

// Texto con fragmentos que parecen fechas: números, barras, guiones, meses y palabras de día.
const pedazo = fc.oneof(
  fc.integer({ min: 0, max: 99 }).map(String), fc.integer({ min: 0, max: 9999 }).map((n) => String(n).padStart(4, "0")),
  fc.constantFrom("/", "-", " de ", " ", "hoy", "mañana", "pasado mañana", "el lunes", "viernes", ...MESES),
);
const casiFecha = fc.array(pedazo, { minLength: 1, maxLength: 9 }).map((a) => a.join(""));

export async function correr(): Promise<void> {
  grupo("Extractores (fechas, salas, carné)");

  await propiedad("fecha ISO válida (2026–2027) se extrae igual en extraer(), fecha() y fechas()",
    fc.property(frase, fechaValida, final, (a, f, b) => {
      const t = `${a}el ${f}${b}`;
      return extraer(t, { hoy: HOY, pendiente: null }).fecha === f && fecha(t, HOY) === f
        && JSON.stringify(fechas(t, HOY)) === JSON.stringify([f]);
    }), 3000);

  await propiedad("fecha dd/mm/aaaa y \"d de mes\" (año de hoy) se normalizan a la misma ISO",
    fc.property(fechaValida, frase, (f, a) => {
      const [y, m, d] = f.split("-").map(Number);
      const conBarras = extraer(`${a}el ${d}/${m}/${y}`, { hoy: HOY, pendiente: null }).fecha === f;
      const conMes = extraer(`${a}el ${d} de ${MESES[m - 1]}`, { hoy: `${y}-01-01`, pendiente: null }).fecha === f;
      return conBarras && conMes;
    }), 3000);

  await propiedad("día imposible (31 de abril, 30 de febrero, mes 13, día 0) → fecha null en sus tres formas",
    fc.property(fechaImposible, frase, final, ({ y, m, d }, a, b) => {
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      const textos = [`${a}el ${iso}${b}`, `${a}el ${d}/${m}/${y}${b}`];
      if (m >= 1 && m <= 12) textos.push(`${a}el ${d} de ${MESES[m - 1]}${b}`);
      return textos.every((t) => extraer(t, { hoy: `${y}-01-01`, pendiente: null }).fecha === null && fechas(t, `${y}-01-01`).length === 0);
    }), 3000);

  await propiedad("toda fecha extraída existe en el calendario; fechas() sale ordenada, sin repetir y con máximo 7",
    fc.property(casiFecha, fechaValida, (t, hoy) => {
      const f = extraer(t, { hoy, pendiente: null }).fecha;
      const fs = fechas(t, hoy);
      const ordenada = fs.every((x, i) => i === 0 || fs[i - 1] < x);
      return (f === null || existe(f)) && fs.every(existe) && ordenada && fs.length <= 7;
    }), 5000);

  await propiedad("salaInexistente(\"sala n\"): null si 1 ≤ n ≤ 16 y n en otro caso (0–999); sala() coincide",
    fc.property(fc.integer({ min: 0, max: 999 }), fc.constantFrom("sala ", "Sala ", "SALA", "sala-", "laboratorio ", "Laboratorio "),
      (n, pre) => {
        const t = `quiero la ${pre}${n}`;
        const existeSala = n >= 1 && n <= 16;
        return salaInexistente(t) === (existeSala ? null : n) && sala(t) === (existeSala ? `sala-${n}` : null);
      }), 3000);

  await propiedad("carné C/D-######## se lee igual con mayúsculas/minúsculas, con o sin guion, y extraer() no lo deja como número",
    fc.property(
      fc.tuple(carneArb, fc.boolean()).chain(([c, guion]) => conMayusculasAlAzar(guion ? c : c.replace("-", "")).map((t) => ({ c, t }))),
      ({ c, t }) => {
        const e = extraer(`soy ${t}, somos 5`, { hoy: HOY, pendiente: null });
        return carne(`soy ${t}`) === c && e.carne === c && e.personas === 5;
      }), 3000);
}

if (esPrincipal(import.meta.url)) {
  const t0 = Date.now();
  await correr();
  terminar(t0);
}
