import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";

const cierre = (id: string) => ({
  id_sintetico: id, laboratorio: "sala-1" as const,
  franja: "08:00–10:00", tipo_evento: "cierre" as const,
});

const sin = evaluar(casos["E-011"], cierre("E-011"));
const con = evaluar(casos["E-001"], cierre("E-001"));

const ok1 = sin.estado_asistencia === "sin_registro" && sin.decision === "escalar" && sin.reglas_aplicadas[0] === "R12";
const ok2 = con.estado_asistencia === "no_aplica" && con.reglas_aplicadas.length === 0;

console.log(`${ok1 ? "✅" : "❌"} R12 cierre sin entrada -> ${sin.estado_asistencia} (${sin.decision})`);
console.log(`${ok2 ? "✅" : "❌"} Cierre con entrada -> ${con.estado_asistencia}`);
process.exit(ok1 && ok2 ? 0 : 1);
