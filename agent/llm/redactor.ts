import type { Decision } from "../tools/esquemas.js";
import { chat } from "./proveedor.js";

const SISTEMA = `Eres el asistente del monitor de laboratorios de UniEspinal.
Explica en español, en 2 frases cortas, la recomendación recibida.
Reglas:
- Explica SOLO los motivos que aparecen en la lista "Motivos". No agregues otros.
- No cambies la recomendación ni inventes datos, nombres u horarios.
- No menciones códigos de regla (R1, R2...) ni nombres técnicos de campos.
- Termina siempre diciendo que la decisión final la toma el monitor.`;

function resumir(d: Decision): string {
  const l = [`Recomendación: ${d.decision}.`, "Motivos:"];
  for (const t of d.traza) l.push(`- ${t.replace(/^R\d+:\s*/, "")}`);
  if (d.hechos_desconocidos.length)
    l.push(`Datos que faltan: ${d.hechos_desconocidos.join(", ").replaceAll("_", " ")}.`);
  if (d.contradicciones.length)
    l.push(`Fuentes en conflicto: ${d.contradicciones.join("; ")}.`);
  return l.join("\n");
}

export const redactar = (d: Decision) =>
  chat([{ role: "system", content: SISTEMA }, { role: "user", content: resumir(d) }]);
