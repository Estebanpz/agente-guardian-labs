import { redactar } from "../agent/llm/ollama.js";

const p09 = {
  decision: "escalar" as const,
  reglas_aplicadas: ["R13", "R9"],
  equipo_sugerido: null,
  estado_asistencia: "no_aplica" as const,
  hechos_desconocidos: ["induccion_seguridad"],
  contradicciones: ["equipo: inventario=disponible vs mantenimiento=diagnostico"],
  version_reglas: "1.0.0",
  traza: ["R13: dato desconocido y fuentes en conflicto a la vez; escalar."],
};

console.log(await redactar(p09));
