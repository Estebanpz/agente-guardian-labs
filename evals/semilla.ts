// Prueba de la semilla de carnetización (plan de identidad, sección 6): cada programa y facultad existe en
// el catálogo, hay 12 estudiantes y 5 docentes, y cada registro cumple el esquema.
import { CarneDoc } from "../agent/tools/esquemas-reservas.js";
import { carnetizacionSemilla } from "../data/semilla.js";
import { FACULTADES } from "../data/programas.js";

let fallos = 0;
const comprobar = (ok: boolean, texto: string) => {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${texto}`);
};

const facultades = new Set(FACULTADES.map((f) => f.nombre));
const programas = new Set(FACULTADES.flatMap((f) => f.programas.map((p) => p.nombre)));

const estudiantes = carnetizacionSemilla.filter((c) => c.rol === "estudiante");
const docentes = carnetizacionSemilla.filter((c) => c.rol === "docente");
comprobar(estudiantes.length === 12, `estudiantes = ${estudiantes.length} (esperado 12)`);
comprobar(docentes.length === 5, `docentes = ${docentes.length} (esperado 5)`);
comprobar(carnetizacionSemilla.length === 17, `carnés = ${carnetizacionSemilla.length} (esperado 17)`);

for (const c of carnetizacionSemilla) {
  const v = CarneDoc.safeParse(c);
  comprobar(v.success, `${c._id} cumple el esquema`);
  if (c.rol === "estudiante") {
    comprobar(programas.has(c.programa), `${c._id}: programa "${c.programa}" existe en el catálogo`);
    comprobar(facultades.has(c.facultad), `${c._id}: facultad existe en el catálogo`);
  } else {
    comprobar(facultades.has(c.facultad), `${c._id}: facultad existe en el catálogo`);
    comprobar(c.espacios.length >= 1 && c.espacios.length <= 6, `${c._id}: espacios entre 1 y 6`);
  }
}

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
