import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";

const entrada = (id: string) => ({
  id_sintetico: id, laboratorio: "sala-1" as const,
  franja: "08:00–10:00", tipo_evento: "ingreso" as const,
});

type Esperado = {
  prueba: string; caso: string; decision: string; reglas: string[];
  asistencia: string; equipo: string | null; notificar: string[];
};

const esperados: Esperado[] = [
  { prueba: "P-01",  caso: "E-001", decision: "permitir", reglas: ["R10", "R11"], asistencia: "presente",  equipo: "PC-01", notificar: [] },
  { prueba: "P-02",  caso: "E-002", decision: "negar",    reglas: ["R1"],         asistencia: "no_aplica", equipo: null,    notificar: [] },
  { prueba: "P-03a", caso: "E-003", decision: "permitir", reglas: ["R10", "R11"], asistencia: "presente",  equipo: "PC-01", notificar: [] },
  { prueba: "P-03b", caso: "E-004", decision: "negar",    reglas: ["R7"],         asistencia: "no_aplica", equipo: null,    notificar: [] },
  { prueba: "P-04",  caso: "E-005", decision: "escalar",  reglas: ["R2"],         asistencia: "no_aplica", equipo: null,    notificar: [] },
  { prueba: "P-05",  caso: "E-008", decision: "escalar",  reglas: ["R3", "R9"],   asistencia: "no_aplica", equipo: "PC-01", notificar: ["mantenimiento"] },
  { prueba: "P-07",  caso: "E-009", decision: "escalar",  reglas: ["R6"],         asistencia: "no_aplica", equipo: null,    notificar: ["coordinación"] },
  { prueba: "P-09",  caso: "E-006", decision: "escalar",  reglas: ["R13", "R9"],  asistencia: "no_aplica", equipo: null,    notificar: ["mantenimiento"] },
  { prueba: "P-10",  caso: "E-007", decision: "negar",    reglas: ["R4"],         asistencia: "no_aplica", equipo: null,    notificar: [] },
  { prueba: "P-08*", caso: "E-010", decision: "permitir", reglas: ["R10", "R11"], asistencia: "presente",  equipo: "PC-01", notificar: [] },
];

let fallos = 0;
for (const x of esperados) {
  const r = evaluar(casos[x.caso], entrada(x.caso), equipos);
  const ok =
    r.decision === x.decision &&
    r.estado_asistencia === x.asistencia &&
    r.equipo_sugerido === x.equipo &&
    JSON.stringify(r.reglas_aplicadas) === JSON.stringify(x.reglas) &&
    JSON.stringify(r.notificar) === JSON.stringify(x.notificar);
  if (!ok) fallos++;
  console.log(
    `${ok ? "✅" : "❌"} ${x.prueba} (${x.caso}) -> ${r.decision} [${r.reglas_aplicadas.join(",")}] ${r.estado_asistencia} equipo=${r.equipo_sugerido} notificar=[${r.notificar.join(",")}]`,
  );
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
