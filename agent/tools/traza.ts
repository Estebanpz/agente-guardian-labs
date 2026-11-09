// Traza de decisiones del agente: logs/evaluaciones.jsonl. Los carnés se enmascaran antes de escribir.
import { appendFileSync } from "node:fs";
import { enmascararCarnes } from "./privacidad.js";

const LOG = new URL("../../logs/evaluaciones.jsonl", import.meta.url);

export const registrar = (r: object): void =>
  appendFileSync(LOG, enmascararCarnes(JSON.stringify({ ts: new Date().toISOString(), ...r })) + "\n");
