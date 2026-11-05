// Pruebas del motor de reservas (RS-01 a RS-20). Los escenarios viven en evals/escenarios-reservas.ts.
import { correrEscenariosReservas } from "./escenarios-reservas.js";

const filas = await correrEscenariosReservas();
let fallos = 0;
for (const f of filas) {
  if (!f.ok) fallos++;
  console.log(`${f.ok ? "✅" : "❌"} ${f.id} ${f.tipo} -> ${f.observado}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
