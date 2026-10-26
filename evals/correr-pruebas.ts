import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";

const entrada = (id: string) => ({
  id_sintetico: id, laboratorio: "sala-1" as const,
  franja: "08:00–10:00", tipo_evento: "ingreso" as const,
});

// [prueba, caso, decisión esperada, reglas esperadas, asistencia esperada]
const esperados: [string, string, string, string[], string][] = [
  ["P-01", "E-001", "permitir", ["R10", "R11"], "presente"],
  ["P-02", "E-002", "negar",    ["R1"],         "no_aplica"],
  ["P-03a","E-003", "permitir", ["R10", "R11"], "presente"],
  ["P-03b","E-004", "negar",    ["R7"],         "no_aplica"],
  ["P-04", "E-005", "escalar",  ["R2"],         "no_aplica"],
  ["P-05", "E-008", "escalar",  ["R3", "R9"],   "no_aplica"],
  ["P-07", "E-009", "escalar",  ["R6"],         "no_aplica"],
  ["P-09", "E-006", "escalar",  ["R13", "R9"],  "no_aplica"],
  ["P-10", "E-007", "negar",    ["R4"],         "no_aplica"],
  ["P-08*","E-010", "permitir", ["R10", "R11"], "presente"],
];

let fallos = 0;
for (const [prueba, id, dec, reglas, asis] of esperados) {
  const r = evaluar(casos[id], entrada(id));
  const ok =
    r.decision === dec &&
    r.estado_asistencia === asis &&
    JSON.stringify(r.reglas_aplicadas) === JSON.stringify(reglas);
  if (!ok) fallos++;
  console.log(
    `${ok ? "✅" : "❌"} ${prueba} (${id}) -> ${r.decision} [${r.reglas_aplicadas.join(",")}] ${r.estado_asistencia}`,
  );
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
