// Pruebas de conversación (C-01 a C-09). Los guiones viven en evals/escenarios-conversacion.ts.
import { correrEscenariosConversacion } from "./escenarios-conversacion.js";

const filas = await correrEscenariosConversacion();
let fallos = 0;
for (const f of filas) {
  if (!f.ok) fallos++;
  console.log(`${f.ok ? "✅" : "❌"} ${f.id} ${f.tipo} -> ${f.observado}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
