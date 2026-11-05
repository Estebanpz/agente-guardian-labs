// Genera docs/contenidos/resultados.md con los nueve contenidos de la sección 5 de la guía
// y el ejemplo de la sección 6. Uso: npm run contenidos   (o npm run contenidos -- --llm con Ollama)
// Sale con código 1 si alguna verificación falla.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fijarReloj, liberarReloj } from "../agent/tools/reloj.js";
import { tabla, type Seccion } from "./comun.js";
import { c21 } from "./c21-agentes-logicos.js";
import { c22 } from "./c22-logica-primer-orden.js";
import { c23 } from "./c23-representacion.js";
import { c24 } from "./c24-incertidumbre.js";
import { c25 } from "./c25-probabilista.js";
import { c26 } from "./c26-temporal.js";
import { c31c32 } from "./c31-c32-aprendizaje.js";
import { c33 } from "./c33-refuerzo.js";

const conModelo = process.argv.includes("--llm");
fijarReloj("2026-11-09", "08:00"); // mismo reloj que las pruebas: resultados repetibles

const secciones: Seccion[] = [];
for (const f of [c21, c22, c23, c24, c25, c26]) secciones.push(await f());
secciones.push(await c31c32(conModelo));
secciones.push(await c33());
liberarReloj();

// Sección 6: ejemplo en Python de la guía, con sus tres cambios.
const py = spawnSync("python3", [new URL("./ejemplo_guia.py", import.meta.url).pathname], { encoding: "utf-8" });
const pyOk = py.status === 0;
const ejemplo = py.error
  ? "No se pudo ejecutar `python3` en este equipo. Ejecútelo con `python3 analisis/ejemplo_guia.py`."
  : py.stdout.trim();

let fallos = 0;
const lineasVerif: string[] = [];
for (const s of secciones) {
  for (const [texto, ok] of s.verificaciones) {
    if (!ok) fallos++;
    lineasVerif.push(`${ok ? "✅" : "❌"} ${s.id} ${texto}`);
  }
}
lineasVerif.push(`${pyOk ? "✅" : "❌"} 6 ejemplo de la guía: los cuatro casos coinciden con lo esperado`);
if (!pyOk) fallos++;

const md = [
  "# Integración de los contenidos de la Fase 2 (sección 5 de la guía)",
  "",
  "Generado por `npm run contenidos` (`analisis/contenidos.ts`). Reloj fijo en 2026-11-09 08:00 y semillas fijas: cada ejecución da los mismos números. Los datos marcados como **simulados** solo sirven para aprender y probar; no son normas, hechos ni estadísticas de UniEspinal.",
  "",
  "## Resumen: qué se usa y qué no",
  "",
  tabla(["Contenido", "Decisión", "Evidencia"], secciones.map((s) => [`${s.id} ${s.titulo}`, s.uso, s.evidencia])),
  "",
  "**Comparación entre la solución con reglas y los componentes probabilísticos o de aprendizaje.** La decisión del agente (programar, negar, escalar, permitir el ingreso) se queda en reglas explícitas, versionadas y con traza, porque deben ser verificables y repetibles, y porque los datos reales necesarios para estimar o entrenar no están disponibles ni autorizados. Las técnicas probabilísticas y de aprendizaje se implementaron como ejemplos reproducibles con datos simulados, se midieron y se documentó por qué no pasan a producción.",
  "",
  ...secciones.flatMap((s) => [`## ${s.id} ${s.titulo}`, "", `*Decisión: ${s.uso}.*`, "", s.md, ""]),
  "## 6. Ejemplo ejecutable de la guía (Python)",
  "",
  "`python3 analisis/ejemplo_guia.py` ejecuta la función de la guía con los tres cambios pedidos:",
  "",
  ejemplo,
  "",
  "Para detectar contradicciones entre dos fuentes, este ejemplo no alcanza: guarda una sola afirmación por dato. El agente guarda las dos (inventario y mantenimiento) y aplica una política documentada (R3, R13, R19).",
  "",
  "## Verificaciones",
  "",
  ...lineasVerif.map((l) => `- ${l}`),
  "",
].join("\n");

mkdirSync(new URL("../docs/contenidos/", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/contenidos/resultados.md", import.meta.url), md);
console.log(lineasVerif.join("\n"));
console.log(fallos ? `\n${fallos} verificaciones fallaron` : "\nTodas las verificaciones pasaron · docs/contenidos/resultados.md");
process.exit(fallos ? 1 : 0);
