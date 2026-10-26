import express from "express";
import { z } from "zod";
import { EntradaEvaluar } from "../tools/esquemas.js";
import { mensaje, solicitar } from "../orquestador.js";
import { proveedorActivo } from "../llm/proveedor.js";
import { resumenSalas } from "../tools/salas.js";

const app = express();
app.use(express.json({ limit: "10kb" }));

// CORS mínimo para una interfaz local (React en Vite).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});

app.get("/salud", (_req, res) => {
  res.json({ ok: true, proveedor: proveedorActivo() });
});

// Solicitud estructurada: se valida contra el esquema antes de tocar el motor.
app.post("/evaluar", async (req, res) => {
  const v = EntradaEvaluar.safeParse(req.body);
  if (!v.success) return void res.status(400).json({ error: "Entrada inválida", detalle: v.error.issues });
  try {
    res.json(await solicitar(v.data));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Texto libre del monitor.
app.post("/mensaje", async (req, res) => {
  const v = z.object({ texto: z.string().min(1).max(500) }).safeParse(req.body);
  if (!v.success) return void res.status(400).json({ error: "Falta el campo 'texto' (1 a 500 caracteres)" });
  try {
    res.json(await mensaje(v.data.texto));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Estado de salas y equipos (solo lectura).
app.get("/salas", (_req, res) => {
  res.json(resumenSalas());
});

const PUERTO = Number(process.env.PORT ?? 3000);
// Solo en localhost: este prototipo no tiene autenticación.
app.listen(PUERTO, "127.0.0.1", () =>
  console.log(`Guardian Labs en http://127.0.0.1:${PUERTO} (${proveedorActivo()})`),
);
