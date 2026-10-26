import { appendFileSync } from "node:fs";
import { EntradaEvaluar } from "./tools/esquemas.js";
import { evaluar } from "./tools/motor.js";
import { redactar } from "./llm/redactor.js";
import { casos } from "../data/casos.js";

const LOG = new URL("../logs/evaluaciones.jsonl", import.meta.url);

export async function solicitar(datos: unknown) {
  // 1. Validar contra el esquema: nada pasa sin validar.
  const entrada = EntradaEvaluar.parse(datos);

  // 2. Buscar hechos. Si el id no existe, no se inventa nada: se escala.
  const hechos = casos[entrada.id_sintetico];
  if (!hechos) {
    return {
      decision: null,
      explicacion: `Identificador ${entrada.id_sintetico} no encontrado en la base. Escalar al monitor.`,
    };
  }

  // 3. El motor decide (determinista).
  const decision = evaluar(hechos, entrada);

  // 4. El modelo solo redacta; si falla, la decisión no se pierde.
  let explicacion: string;
  try {
    explicacion = await redactar(decision);
  } catch (e) {
    console.error("[llm]", (e as Error).message);
    explicacion = "Modelo local no disponible; consulte la traza.";
  }

  // 5. Registro local sin datos personales (ids sintéticos).
  appendFileSync(
    LOG,
    JSON.stringify({ ts: new Date().toISOString(), entrada, decision, explicacion }) + "\n",
  );

  return { decision, explicacion };
}
