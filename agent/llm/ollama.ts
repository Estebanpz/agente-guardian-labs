import { Ollama } from "ollama";
import type { Decision } from "../tools/esquemas";
import { string } from "zod";
const cliente = new Ollama({ host: "http://127.0.0.1:11434" });
export const MODELO = "llama3.2:3b";
// Contexto
const SISTEMA = `Eres el asistente del monitor de laboratorios de UniEspinal.
Redacta en español, en máximo 3 frases, una explicación de la recomendación recibida.
Reglas:
- No cambies la decisión ni inventes reglas, nombres, horarios ni datos.
- Usa solo la información del JSON.
- Es una recomendación: la decisión final la toma el monitor.`;

export async function redactar(d: Decision): Promise<string> {
    const r = await cliente.chat({
        model: MODELO,
        options: {
            temperature: 0.2
        },
        messages: [{ role: "system", "content": SISTEMA }, { role: "user", "content": JSON.stringify(d) }]
    });

    return r.message.content.trim();
}