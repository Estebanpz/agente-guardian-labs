import express from "express";
import { z } from "zod";
import { EntradaEvaluar } from "../tools/esquemas.js";
import { Fecha, SalaId } from "../tools/esquemas-reservas.js";
import { mensaje, solicitar } from "../orquestador.js";
import { proveedorActivo } from "../llm/proveedor.js";
import { resumenSalas } from "../tools/salas.js";
import { ocupadaPublica, disponibilidad, enmascarar, type Contexto } from "../tools/reservas.js";
import { ahora, hoyBogota } from "../tools/reloj.js";
import { crearRepositorio, tipoDeBase } from "../store/repositorio.js";
import { nombreDe, solicitanteDe } from "../tools/monitor.js";
import type { CarneDoc } from "../tools/esquemas-reservas.js";
import { casos, descripciones } from "../../data/casos.js";

export const app = express();
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
    res.json({ sala: sala._id, fecha, ocupadas: d.ocupadas.map(ocupadaPublica), libres: d.libres, operativos: d.operativos, inciertos: d.inciertos });
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
    const avisos = await repo.notificaciones(v.data.estado);
    const carnes = await carnesDe(avisos.map((a) => a.carne));
    res.json(avisos.map(({ carne, ...a }) => ({
      ...a,
      carne: carne ? enmascarar(carne) : null,
      solicitante: carne ? nombreDe(carnes.get(carne)) : null,
    })));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Carnetización de varios carnés (sin repetir), para el nombre del solicitante.
async function carnesDe(carnes: (string | null | undefined)[]): Promise<Map<string, CarneDoc | null>> {
  const repo = await crearRepositorio();
  const unicos = [...new Set(carnes.filter((c): c is string => typeof c === "string"))];
  return new Map(await Promise.all(unicos.map(async (c) => [c, await repo.carne(c)] as const)));
}

// Estado de las salas en una fecha (vista Salas del monitor, solo lectura). `fecha` por defecto: hoy en Bogotá.
// Las reservas del día incluyen las programadas y las escaladas; la disponibilidad solo cuenta las programadas.
app.get("/salas", async (req, res) => {
  const v = z.object({ fecha: Fecha.optional() }).safeParse(req.query);
  if (!v.success) return void res.status(400).json({ error: "Parámetros inválidos: fecha (aaaa-mm-dd)." });
  try {
    const fecha = v.data.fecha ?? hoyBogota();
    const repo = await crearRepositorio();
    const ctx = await contextoDeFecha(fecha);
    const reservas = [...await repo.reservasDelDia(fecha), ...await repo.escaladasDelDia(fecha)];
    const carnes = await carnesDe(reservas.map((r) => r.carne));
    res.json(ctx.salas.map((sala) => {
      const d = disponibilidad(sala, fecha, ctx.reservasDelDia, ctx);
      const equipos = ctx.equipos.filter((q) => q.sala === sala._id);
      // En revisión = no operativo (igual que la referencia): inventario o mantenimiento distintos de "disponible".
      const enRevision = (q: (typeof equipos)[number]) =>
        !(q.inventario === "disponible" && q.mantenimiento === "disponible");
      return {
        id: sala._id, nombre: sala.nombre, capacidad: sala.capacidad, computo: sala.computo,
        operativos: d.operativos, inciertos: d.inciertos, en_revision: equipos.filter(enRevision).length,
        equipos: equipos.map((q) => ({ _id: q._id, inventario: q.inventario, mantenimiento: q.mantenimiento, accesible: q.accesible })),
        reservas: reservas.filter((r) => r.sala === sala._id)
          .sort((a, b) => a.inicio_min - b.inicio_min)
          .map(({ carne, ...r }) => ({
            codigo: r.codigo, inicio: r.inicio, fin: r.fin, inicio_min: r.inicio_min, fin_min: r.fin_min,
            tipo: r.tipo, rol: r.rol, estado: r.estado, personas: r.personas, materia: r.materia,
            reglas_aplicadas: r.reglas_aplicadas, jornada: r.jornada ?? null,
            carne: enmascarar(carne), solicitante: nombreDe(carnes.get(carne)),
            perfil: carnes.get(carne) ? solicitanteDe(carnes.get(carne)!) : null,
          })),
      };
    }));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Días del mes (aaaa-mm) con reservas: calendario del monitor.
app.get("/reservas/dias", async (req, res) => {
  const v = z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse(req.query);
  if (!v.success) return void res.status(400).json({ error: "Parámetro inválido: mes (aaaa-mm)." });
  try {
    const repo = await crearRepositorio();
    res.json(await repo.diasConReservas(v.data.mes));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Detalle de una reserva (cualquier estado) con los datos de quien reserva y el carné enmascarado.
app.get("/reservas/:codigo", async (req, res) => {
  const v = z.string().regex(/^RS-\d{4}$/).safeParse(req.params.codigo);
  if (!v.success) return void res.status(400).json({ error: "Código inválido." });
  try {
    const repo = await crearRepositorio();
    const r = await repo.reservaPorCodigo(v.data);
    if (!r) return void res.status(404).json({ error: "Reserva no encontrada" });
    const c = await repo.carne(r.carne);
    const { carne, ...resto } = r;
    res.json({ ...resto, carne: enmascarar(carne), solicitante: c ? solicitanteDe(c) : null });
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Marca un aviso como atendido. Solo ese cambio: el cuerpo debe ser exactamente { estado: "atendida" }.
app.patch("/notificaciones/:id", async (req, res) => {
  const v = z.object({ estado: z.literal("atendida") }).strict().safeParse(req.body);
  if (!v.success) return void res.status(400).json({ error: "Solo se permite { estado: \"atendida\" }." });
  const id = z.string().regex(/^[\w-]{1,64}$/).safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({ error: "Identificador inválido." });
  try {
    const repo = await crearRepositorio();
    if (!(await repo.marcarAtendida(id.data, new Date()))) {
      return void res.status(404).json({ error: "Aviso no encontrado o ya atendido" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Estado de salas y equipos de la vista Laboratorios (solo lectura).
app.get("/salas/laboratorios", (_req, res) => {
  res.json(resumenSalas());
});
