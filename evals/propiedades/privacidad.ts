// Propiedades de datosProhibidos (agent/tools/privacidad.ts): correo, teléfono y documento se detectan en
// cualquier formato; carnés, códigos RS, fechas, horas, salas y "somos N" nunca se confunden con ellos.
import { datosProhibidos, enmascararCarnes } from "../../agent/tools/privacidad.js";
import { carneArb, digitos, esPrincipal, fc, grupo, propiedad, terminar } from "./comun.js";

const relleno = fc.constantFrom("", "hola, ", "buenas, ", "profe, ", "por favor ");
const cierre = fc.constantFrom("", ".", " gracias", ", ¿puedo entrar?", " y quiero reservar");

// Parte una cadena de dígitos en grupos de 1 a 4 y los une con separadores al azar.
const conSeparadores = (num: string) =>
  fc.array(fc.tuple(fc.integer({ min: 1, max: 4 }), fc.constantFrom(" ", ".", "-", "", "  ", " - ")), { minLength: 1, maxLength: 12 })
    .map((cortes) => {
      let out = "", i = 0, k = 0;
      while (i < num.length) {
        const [n, sep] = cortes[k++ % cortes.length];
        out += num.slice(i, i + n);
        i += n;
        if (i < num.length) out += sep;
      }
      return out;
    });

const palabraClave = fc.constantFrom("cédula", "cedula", "Cédula", "C.C.", "c.c", "CC", "documento", "Documento No.",
  "cédula número", "mi cédula", "documento:", "c.c.", "cédula #");
// Con un verbo entre la palabra clave y el número ya no aplica el patrón de palabra clave: decide el número solo.
const palabraConVerbo = fc.constantFrom("mi cédula es", "el documento es", "mi c.c. es", "la cédula de mi mamá es");

// Documento con formato típico colombiano, sin palabra clave: 1.070.612.345, 52.345.678, 1070 612 345.
const documentoTipico = fc.tuple(fc.integer({ min: 1, max: 9 }), digitos(6, 9), fc.constantFrom(".", " "))
  .map(([a, resto, sep]) => {
    const num = `${a}${resto}`;
    const grupos: string[] = [];
    for (let i = num.length; i > 0; i -= 3) grupos.unshift(num.slice(Math.max(0, i - 3), i));
    return grupos.join(sep);
  });

const minus = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz");
const alnum = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789");
const etiqueta = fc.array(minus, { minLength: 2, maxLength: 10 }).map((a) => a.join(""));
// Correo "realista": local con letras, dígitos y . _ + - (sin empezar ni terminar en signo), dominio con letras.
const correoRealista = fc.tuple(
  alnum, fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789._+-"), { maxLength: 14 }).map((a) => a.join("")), alnum,
  fc.array(etiqueta, { minLength: 1, maxLength: 3 }), fc.constantFrom("com", "co", "org", "edu.co", "net", "test"),
).map(([a, medio, z, dom, tld]) => `${a}${medio}${z}@${dom.join(".")}.${tld}`);

// Ofuscaciones que el patrón dice aceptar.
const ofuscar = (correo: string) => fc.tuple(
  fc.constantFrom(" arroba ", "[at]", " [at] ", "(at)", " (AT) ", " ARROBA ", "@"),
  fc.constantFrom(" punto ", "[dot]", " [dot] ", "(dot)", " PUNTO ", "."),
).map(([at, dot]) => {
  const [local, dominio] = correo.split("@");
  return `${local}${at}${dominio.split(".").join(dot)}`;
});

const celular = fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), digitos(7, 7))
  .map(([a, b, r]) => `3${a}${b}${r}`);
const formatoCelular = (n: string) => fc.constantFrom(
  n, `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`, `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`,
  `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`, `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`,
  `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}`, `${n.slice(0, 3)} ${n.slice(3)}`,
);
const prefijoPais = fc.constantFrom("", "+57", "+57 ", "57 ", "(+57) ", "+57-", "+ 57 ", "(57) ");

// Fragmentos permitidos (no son datos personales).
const fechaIso = fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2027-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
const fechaDma = fechaIso.chain((f) => fc.constantFrom("-", "/", ".").map((s) => f.split("-").reverse().join(s)));
const horaHHMM = fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
const codigoRS = fc.integer({ min: 1, max: 9999 }).map((n) => `RS-${String(n).padStart(4, "0")}`);
const permitido = fc.oneof(
  carneArb, codigoRS, fechaIso, fechaDma, horaHHMM,
  fc.integer({ min: 1, max: 16 }).map((n) => `sala ${n}`),
  fc.integer({ min: 1, max: 16 }).map((n) => `laboratorio ${n}`),
  fc.integer({ min: 1, max: 40 }).map((n) => `somos ${n}`),
  fc.integer({ min: 1, max: 40 }).map((n) => `${n} personas`),
  fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 })).map(([a, b]) => `de ${a} a ${b}`),
  fc.constantFrom("mañana", "el jueves", "en la tarde", "pm", "con alto cómputo"),
);
const conector = fc.constantFrom(" ", ", ", " y ", " el ", " de ", " para ", " en la ", ". ");
const mensajePermitido = fc.array(fc.tuple(permitido, conector), { minLength: 1, maxLength: 8 })
  .map((partes) => partes.map(([p, c]) => p + c).join("").trim());

export async function correr(): Promise<void> {
  grupo("Privacidad (datosProhibidos)");

  await propiedad("documento: 6–12 dígitos con separadores tras cédula/C.C./documento se detecta",
    fc.property(relleno, palabraClave, digitos(6, 12).chain(conSeparadores), cierre,
      (r, kw, num, c) => datosProhibidos(`${r}${kw} ${num}${c}`).includes("documento")), 3000);

  await propiedad("documento: tras \"mi cédula es\", 6–12 dígitos con separadores arbitrarios se detectan",
    fc.property(palabraConVerbo, digitos(6, 12).chain(conSeparadores), (kw, num) => datosProhibidos(`${kw} ${num}`).includes("documento")), 3000);

  await propiedad("documento: formatos típicos sin palabra clave (1.070.612.345, 52 345 678) se detectan",
    fc.property(relleno, documentoTipico, cierre, (r, num, c) => datosProhibidos(`${r}mi número es ${num}${c}`).includes("documento")), 3000);

  await propiedad("correo realista (letras, dígitos, . _ + -) se detecta, también ofuscado (arroba, [at], punto, [dot])",
    fc.property(relleno, correoRealista.chain(ofuscar), cierre, (r, correo, c) => datosProhibidos(`${r}escríbeme a ${correo}${c}`).includes("correo")), 3000);

  await propiedad("correo: cualquier dirección de fc.emailAddress() se detecta",
    fc.property(fc.emailAddress(), (correo) => datosProhibidos(`escríbeme a ${correo}`).includes("correo")), 3000);

  await propiedad("teléfono celular 3xxxxxxxxx con o sin +57 y en formatos variados se detecta",
    fc.property(relleno, prefijoPais, celular.chain(formatoCelular), cierre,
      (r, p, tel, c) => datosProhibidos(`${r}llámame al ${p}${tel}${c}`).includes("telefono")), 3000);

  await propiedad("sin falsos positivos: carnés, RS-0001..9999, fechas, horas, sala N, somos N → nada",
    fc.property(mensajePermitido, (m) => datosProhibidos(m).length === 0), 5000);

  await propiedad("enmascararCarnes: un carné separado por espacios o signos (con o sin guion) nunca queda completo",
    fc.property(fc.array(fc.oneof(carneArb, carneArb.map((c) => c.replace("-", "").toLowerCase()), fc.constantFrom("soy", "el", ",", "¿", "?", "(", ")", ":")), { maxLength: 8 }),
      fc.constantFrom(" ", ", ", ": ", " - "), (partes, sep) => !/[CD]-?\d{8}/i.test(enmascararCarnes(partes.join(sep)))), 3000);

  await propiedad("enmascararCarnes: un carné pegado a letras (\"soyC-10000001\") tampoco queda completo en la traza",
    fc.property(fc.constantFrom("soy", "carné", "x", "_"), carneArb, (pre, c) => !enmascararCarnes(`${pre}${c}`).includes(c)), 1000);

  await propiedad("sin falsos positivos: una lista de números pequeños separados por espacios (salas 10 12 14, el 20 11 2026)",
    fc.property(fc.array(fc.integer({ min: 1, max: 31 }), { minLength: 3, maxLength: 5 }),
      (ns) => datosProhibidos(`¿las salas ${ns.join(" ")} tienen cupo?`).length === 0), 2000);
}

if (esPrincipal(import.meta.url)) {
  const t0 = Date.now();
  await correr();
  terminar(t0);
}
