import { appendFileSync } from "node:fs";
import { EntradaEvaluar } from "./tools/esquemas.js";
import { evaluar } from "./tools/motor.js";
import { redactar } from "./llm/redactor.js";
import { interpretar } from "./llm/interprete.js";
import { casos } from "../data/casos.js";

const LOG = new URL("../logs/evaluaciones.jsonl", import.meta.url);
const registrar = (r: object) =>
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...r }) + "\n");

export async function solicitar(datos: unknown, alerta?: string) {
  // 1. Validar contra el esquema.
  const entrada = EntradaEvaluar.parse(datos);

  // 2. Si el id no existe, no se inventa nada.
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
    explicacion = "Modelo no disponible; consulte la traza.";
  }

  registrar({ entrada, decision, explicacion, alerta });
  return { decision, explicacion, alerta };
}

// Texto libre del monitor.
export async function mensaje(texto: string) {
  const intencion = await interpretar(texto);
  const id = texto.match(/E-\d{3}/)?.[0]; // el id se extrae con regex, no con el modelo
  const resumen = texto.slice(0, 200);

  if (intencion === "fuera_de_alcance") {
    const respuesta =
      "Esa consulta está fuera de mi alcance. Solo oriento sobre ingreso, uso de equipos y asistencia en los laboratorios de sistemas.";
    registrar({ texto: resumen, intencion, respuesta });
    return { intencion, respuesta };
  }

  const alerta =
    intencion === "intento_eludir_reglas"
      ? "Intento de eludir las reglas registrado. Las reglas no cambian; notificar a coordinación."
      : undefined;

  if (!id) {
    const respuesta = alerta
      ? "No puedo cambiar ni ignorar las reglas. " + alerta
      : "Necesito el identificador de la persona (por ejemplo E-001) para evaluar la solicitud.";
    registrar({ texto: resumen, intencion, respuesta });
    return { intencion, respuesta };
  }

  const r = await solicitar(
    { id_sintetico: id, laboratorio: "sala-1", franja: "08:00–10:00", tipo_evento: "ingreso" },
    alerta,
  );
  return { intencion, ...r };
}
