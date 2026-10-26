import { Ollama } from "ollama";

// Lee .env si existe (PROVEEDOR, MODELO_*, AI_GATEWAY_API_KEY).
try { process.loadEnvFile(); } catch { /* sin .env: valores por defecto */ }

export type Mensaje = { role: "system" | "user" | "assistant"; content: string };

const PROVEEDOR = process.env.PROVEEDOR ?? "ollama";
const MODELO_OLLAMA = process.env.MODELO_OLLAMA ?? "llama3.2:3b";
const MODELO_VERCEL = process.env.MODELO_VERCEL ?? "";
const RESPALDO = (process.env.MODELOS_RESPALDO ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

export const proveedorActivo = () =>
  PROVEEDOR === "vercel" ? `vercel:${MODELO_VERCEL}` : `ollama:${MODELO_OLLAMA}`;

// Única puerta al modelo. `schema` obliga a responder en JSON válido.
export async function chat(mensajes: Mensaje[], schema?: object): Promise<string> {
  if (PROVEEDOR === "vercel") {
    const key = process.env.AI_GATEWAY_API_KEY;
    if (!key || !MODELO_VERCEL) throw new Error("Falta AI_GATEWAY_API_KEY o MODELO_VERCEL en .env");
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO_VERCEL,
        temperature: 0,
        messages: mensajes,
        ...(RESPALDO.length ? { providerOptions: { gateway: { models: RESPALDO } } } : {}),
        ...(schema
          ? { response_format: { type: "json_schema", json_schema: { name: "salida", schema, strict: true } } }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    return j.choices[0].message.content.trim();
  }
  const r = await ollama.chat({
    model: MODELO_OLLAMA,
    options: { temperature: 0 },
    ...(schema ? { format: schema } : {}),
    messages: mensajes,
  });
  return r.message.content.trim();
}
