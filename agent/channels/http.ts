import express from "express";
import { z } from "zod";
import { EntradaEvaluar } from "../tools/esquemas.js";
import { Fecha, SalaId } from "../tools/esquemas-reservas.js";
import { mensaje, solicitar } from "../orquestador.js";
import { proveedorActivo } from "../llm/proveedor.js";
import { resumenSalas } from "../tools/salas.js";
import { disponibilidad, enmascarar, type Contexto } from "../tools/reservas.js";
import { ahora, hoyBogota } from "../tools/reloj.js";
import { crearRepositorio, tipoDeBase } from "../store/repositorio.js";
import { casos, descripciones } from "../../data/casos.js";

const app = express();
app.use(express.json({ limit: "10kb" }));

// CORS mínimo para una interfaz local (React en Vite).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});

app.get("/salud", async (_req, res) => {
  try {
    const repo = await crearRepositorio();
    // La base se informa por tipo (local, atlas, remota o memoria); la URI nunca sale de la API.
    res.json({ ok: true, proveedor: proveedorActivo(), repositorio: repo.tipo, base: tipoDeBase(repo.tipo, process.env.MONGODB_URI) });
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
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

// Texto libre del monitor o del usuario. `sesion` identifica la conversación del navegador.
app.post("/mensaje", async (req, res) => {
  const v = z.object({
    texto: z.string().min(1).max(500),
    laboratorio: z.enum(["sala-1", "sala-2", "sala-3"]).optional(),
    sesion: z.uuid().optional(),
  }).safeParse(req.body);
  if (!v.success) return void res.status(400).json({ error: "Falta el campo 'texto' (1 a 500 caracteres)" });
  try {
    res.json(await mensaje(v.data.texto, { laboratorio: v.data.laboratorio, sesion: v.data.sesion }));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Casos sintéticos con su descripción, para la demostración (solo lectura).
app.get("/casos", (_req, res) => {
  res.json(Object.keys(casos).map((id) => ({ id, ...descripciones[id], hechos: casos[id] })));
});

// Contexto del motor para una fecha (sin carné: la disponibilidad no depende de quién pregunta).
async function contextoDeFecha(fecha: string): Promise<Contexto> {
  const repo = await crearRepositorio();
  const h = ahora();
  return {
    hoy: { fecha: h.fecha, minutos: h.minutos },
    carne: null,
    usuario: null,
    salas: await repo.salas(),
    equipos: await repo.equipos(),
    reservasDelDia: await repo.reservasDelDia(fecha),
  };
}

// Disponibilidad de una sala en una fecha (solo lectura).
app.get("/disponibilidad", async (req, res) => {
  const v = z.object({ sala: SalaId, fecha: Fecha.optional() }).safeParse(req.query);
  if (!v.success) {
    return void res.status(400).json({ error: "Parámetros inválidos: sala (sala-1 a sala-16) y fecha (aaaa-mm-dd)." });
  }
  try {
    const fecha = v.data.fecha ?? hoyBogota();
    const ctx = await contextoDeFecha(fecha);
    const sala = ctx.salas.find((s) => s._id === v.data.sala);
    if (!sala) return void res.status(404).json({ error: "Sala no encontrada" });
    const d = disponibilidad(sala, fecha, ctx.reservasDelDia, ctx);
    res.json({ sala: sala._id, fecha, ocupadas: d.ocupadas, libres: d.libres, operativos: d.operativos, inciertos: d.inciertos });
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Reservas programadas y escaladas de una fecha, con carnés enmascarados.
app.get("/reservas", async (req, res) => {
  const v = z.object({ fecha: Fecha.optional() }).safeParse(req.query);
  if (!v.success) return void res.status(400).json({ error: "Parámetros inválidos: fecha (aaaa-mm-dd)." });
  try {
    const fecha = v.data.fecha ?? hoyBogota();
    const repo = await crearRepositorio();
    const lista = [...await repo.reservasDelDia(fecha), ...await repo.escaladasDelDia(fecha)];
    res.json(lista.map((r) => ({ ...r, carne: enmascarar(r.carne) })));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Notificaciones para el monitor o coordinación.
app.get("/notificaciones", async (req, res) => {
  const v = z.object({ estado: z.enum(["pendiente", "atendida"]).default("pendiente") }).safeParse(req.query);
  if (!v.success) return void res.status(400).json({ error: "Parámetros inválidos: estado (pendiente o atendida)." });
  try {
    const repo = await crearRepositorio();
    res.json(await repo.notificaciones(v.data.estado));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Estado de las salas de reservas (solo lectura).
app.get("/salas", async (_req, res) => {
  try {
    const fecha = hoyBogota();
    const ctx = await contextoDeFecha(fecha);
    res.json(ctx.salas.map((sala) => {
      const d = disponibilidad(sala, fecha, ctx.reservasDelDia, ctx);
      return {
        id: sala._id, nombre: sala.nombre, capacidad: sala.capacidad, computo: sala.computo,
        operativos: d.operativos, inciertos: d.inciertos,
        equipos: ctx.equipos.filter((q) => q.sala === sala._id),
        reservas: ctx.reservasDelDia.filter((r) => r.sala === sala._id)
          .map((r) => ({ codigo: r.codigo, inicio: r.inicio, fin: r.fin, tipo: r.tipo, carne: enmascarar(r.carne) })),
      };
    }));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Estado de salas y equipos de la vista Laboratorios (solo lectura).
app.get("/salas/laboratorios", (_req, res) => {
  res.json(resumenSalas());
});

const PUERTO = Number(process.env.PORT ?? 3000);
// Solo en localhost: este prototipo no tiene autenticación.
app.listen(PUERTO, "127.0.0.1", () =>
  console.log(`Guardian Labs en http://127.0.0.1:${PUERTO} (${proveedorActivo()})`),
);
