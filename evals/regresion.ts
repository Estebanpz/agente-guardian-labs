import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";

const entrada = (id: string) => ({
  id_sintetico: id, laboratorio: "sala-1" as const,
  franja: "08:00–10:00", tipo_evento: "ingreso" as const,
});

// Lo que NO debe cambiar al mover la tolerancia: todo menos asistencia y traza.
const nucleo = ({ estado_asistencia, traza, ...resto }: ReturnType<typeof evaluar>) =>
  JSON.stringify(resto);

let fallos = 0;
for (const id of Object.keys(casos)) {
  const a = evaluar(casos[id], entrada(id), equipos);                       // 15 min
  const b = evaluar(casos[id], entrada(id), equipos, { tolerancia: 10 });   // 10 min
  let ok: boolean;
  if (id === "E-010") {
    // Llegada a los 12 min: de presente a tardía.
    ok = a.estado_asistencia === "presente" && b.estado_asistencia === "tardia" && nucleo(a) === nucleo(b);
  } else {
    ok = JSON.stringify(a) === JSON.stringify(b);
  }
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${id}: 15min=${a.estado_asistencia} | 10min=${b.estado_asistencia}`);
}
console.log(fallos === 0 ? "\nRegresión OK" : `\n${fallos} cambiaron sin querer`);
process.exit(fallos === 0 ? 0 : 1);
