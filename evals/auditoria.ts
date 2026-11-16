// Pruebas de las correcciones de la auditoría del 16-11-2026 (AUDITORIA.md):
// - H1: aMin (reloj.ts, también la usa motor.ts) rechaza horas mal formadas en vez de devolver NaN.
// - H2: reglas.json se valida con Zod al cargar (tools/reglas.ts).
// - H6: agent/tools/estados.ts es la única definición del estado de un equipo; estadoSala y la copia de respaldo
//   del frontend deben coincidir con ella.
import { readFileSync } from "node:fs";
import { claseEquipo, esIncierto, type ClaseEquipo } from "../agent/tools/estados.js";
import { estadoSala } from "../agent/tools/reservas.js";
import { aMin } from "../agent/tools/reloj.js";
import { cargarReglas, validarReglas } from "../agent/tools/reglas.js";
import type { EquipoDoc } from "../agent/tools/esquemas-reservas.js";
import { claseEquipo as claseEquipoWeb, enRevisionDe as enRevisionDeWeb } from "../web/src/pages/salas/filtros.js";

type E = EquipoDoc["inventario"];
const ESTADOS: E[] = ["disponible", "mantenimiento", "diagnostico", "desconocido"];

// Tabla esperada, escrita a mano: si alguien cambia la regla, esta prueba lo dice.
const esperado = (i: E, m: E): ClaseEquipo => {
  if (i === "disponible" && m === "disponible") return "operativo";
  if (i === "desconocido" || m === "desconocido") return "desconocido";
  return i === m ? "no_operativo" : "contradictorio";
};

// Copia de respaldo del frontend (web/src/pages/salas/filtros.ts), ya en TypeScript (hallazgo 10).
const web = { claseEquipo: claseEquipoWeb, enRevisionDe: enRevisionDeWeb };

let fallos = 0;
const ok = (cond: boolean, nombre: string) => {
  if (!cond) fallos++;
  console.log(`${cond ? "✅" : "❌"} ${nombre}`);
};

for (const i of ESTADOS) {
  for (const m of ESTADOS) {
    const q = { inventario: i, mantenimiento: m };
    const c = claseEquipo(q);
    ok(c === esperado(i, m) && web.claseEquipo(q) === c, `EST ${i}/${m} -> ${c} (servidor y web)`);
  }
}

// estadoSala cuenta con la misma clase: una sala con un equipo de cada combinación.
const equipos: EquipoDoc[] = ESTADOS.flatMap((i, a) => ESTADOS.map((m, b) => ({
  _id: `S1-${a}${b}`, sala: "sala-1" as EquipoDoc["sala"], inventario: i, mantenimiento: m, accesible: false,
})));
const clases = equipos.map(claseEquipo);
const est = estadoSala({ _id: "sala-1" }, equipos);
ok(est.operativos === 1, `EST sala: operativos = 1 (${est.operativos})`);
ok(est.inciertos === clases.filter(esIncierto).length && est.inciertos === 13, `EST sala: inciertos = 13 (${est.inciertos})`);
ok(est.en_revision === 15 && web.enRevisionDe({ equipos }) === 15, `EST sala: en revisión = 15 en servidor y web (${est.en_revision})`);
ok(est.contradictorio && est.desconocido, "EST sala: marca contradicción y dato desconocido");
ok(estadoSala({ _id: "sala-2" }, equipos).operativos === 0, "EST otra sala: no cuenta equipos ajenos");

// H1: aMin.
const lanza = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return (e as Error).message; } };
ok(aMin("00:00") === 0 && aMin("07:05") === 425 && aMin("23:59") === 1439 && aMin("7:30") === 450, "H1 aMin: horas válidas");
for (const malo of ["7", "7-30", "830", "25:00", "12:60", "", "07:00–09:00", "aa:bb", "24:00"]) {
  const m = lanza(() => aMin(malo));
  ok(m !== null && m.includes("Hora inválida"), `H1 aMin("${malo}") lanza error claro, no NaN`);
}

// H2: reglas.json.
const real = JSON.parse(readFileSync(new URL("../agent/rules/reglas.json", import.meta.url), "utf-8"));
const cargadas = cargarReglas();
ok(cargadas.version === real.version && cargadas.reglas.length === real.reglas.length, `H2 reglas.json real es válido (v${cargadas.version}, ${cargadas.reglas.length} reglas)`);
const variante = (cambio: (b: any) => void) => { const b = structuredClone(real); cambio(b); return b; };
const casosMalos: [string, unknown, string][] = [
  ["sin horario_abre", variante((b) => { delete b.parametros.horario_abre; }), "parametros.horario_abre"],
  ["hora mal escrita", variante((b) => { b.parametros.horario_cierra = "10pm"; }), "parametros.horario_cierra"],
  ["abre después de cerrar", variante((b) => { b.parametros.horario_abre = "23:00"; }), "anterior a horario_cierra"],
  ["duración máxima como texto", variante((b) => { b.parametros.duracion_max_min = "240"; }), "parametros.duracion_max_min"],
  ["regla sin descripción", variante((b) => { delete b.reglas[3].descripcion; }), "reglas.3.descripcion"],
  ["id repetido", variante((b) => { b.reglas[1].id = b.reglas[0].id; }), "ids de regla repetidos"],
  ["versión sin formato", variante((b) => { b.version = "2.3"; }), "version"],
  ["no es objeto", [], "reglas.json inválido"],
];
for (const [nombre, datos, espera] of casosMalos) {
  const m = lanza(() => validarReglas(datos, "prueba"));
  ok(m !== null && m.startsWith("reglas.json inválido (prueba)") && m.includes(espera), `H2 ${nombre} → error que nombra «${espera}»`);
}
ok(validarReglas(variante((b) => { b.parametros.duracion_max_min = 240; }), "prueba").parametros.duracion_max_min === 240,
  "H2 duracion_max_min numérica también es válida (null = sin tope)");

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
