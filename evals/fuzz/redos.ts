export {};
// ReDoS: tiempo de las funciones con expresiones regulares ante entradas diseñadas para el retroceso
// catastrófico. La API limita `texto` a 500 caracteres: ahí el límite es 50 ms por llamada. Con 10 000 se informa.
const { SEMILLA, azar, cadenaRara, informe } = await import("./base.js");
const { datosProhibidos } = await import("../../agent/tools/privacidad.js");
const { extraer, carnesEn, sinCarnes, salaInexistente } = await import("../../agent/tools/extraer.js");
const { esIntentoDeElusion } = await import("../../agent/llm/guardia.js");
const { rutaDeBoton, recursoVerificado } = await import("../../agent/llm/interprete.js");
const { esBotonCancelacion } = await import("../../agent/conversacion.js");

const inf = informe("ReDoS");
console.log(`Semilla: ${SEMILLA}`);
const a = azar(SEMILLA);
const FUNCIONES: [string, (t: string) => unknown][] = [
  ["datosProhibidos", datosProhibidos],
  ["extraer", (t) => extraer(t, { hoy: "2026-11-09", pendiente: null })],
  ["carnesEn", carnesEn], ["sinCarnes", sinCarnes], ["salaInexistente", salaInexistente],
  ["esIntentoDeElusion", esIntentoDeElusion], ["rutaDeBoton", rutaDeBoton],
  ["recursoVerificado", (t) => recursoVerificado(t, t.slice(0, 200))], ["esBotonCancelacion", esBotonCancelacion],
];
const PATRONES = [
  "1 ", "1.", "1-", "(1)", "1", "a", "a@", "@", "x.", " ", "\t", "sala ", "de ", "c-1", "C-1000000", "RS-", "rs ",
  "12:", "12:00 ", "de 1 a ", "arroba ", "punto ", "[at]", "uno dos ", "cedula ", "c.c.", "+57 3", "3 ", "mañana ",
  "ignora ", "regla ", "́", "Ć", "%", "-", "..", "a.a.", "1a", "a1",
];
const entradas = (largo: number): string[] => {
  const out = PATRONES.map((p) => p.repeat(Math.ceil(largo / p.length)).slice(0, largo));
  out.push(...PATRONES.map((p) => (p.repeat(Math.ceil(largo / p.length)).slice(0, largo - 1) + "!")));
  for (let i = 0; i < 40; i++) {
    const p = a.uno(PATRONES) + a.uno(PATRONES);
    out.push((p.repeat(Math.ceil(largo / p.length)).slice(0, largo - 2) + cadenaRara(a, 2)));
  }
  return out;
};
const medir = (f: (t: string) => unknown, t: string) => {
  const t0 = performance.now();
  f(t);
  return performance.now() - t0;
};

for (const [largo, limite] of [[500, 50], [10_000, 1000]] as const) {
  const lista = entradas(largo);
  for (const [nombre, f] of FUNCIONES) {
    for (const t of lista.slice(0, 3)) medir(f, t); // calentamiento
    let peor = 0, peorEntrada = "";
    for (const t of lista) {
      const ms = medir(f, t);
      if (ms > peor) { peor = ms; peorEntrada = t; }
    }
    if (peor > limite) inf.hallazgo(nombre, `${peor.toFixed(1)} ms con ${largo} caracteres`, `${peorEntrada.slice(0, 40)}… ×${largo}`);
    inf.objetivo(`${nombre} con ${largo} caracteres: peor ${peor.toFixed(2)} ms (límite ${limite} ms, ${lista.length} entradas)`, peor <= limite);
  }
}
inf.terminar();
