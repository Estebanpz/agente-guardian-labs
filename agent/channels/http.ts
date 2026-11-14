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
import { iniciarSesion, leerToken, revocar, type Quien } from "../tools/acceso.js";
import type { Rol } from "../tools/esquemas-reservas.js";

export const app = express();
app.use(express.json({ limit: "10kb" }));

// CORS mínimo para una interfaz local (React en Vite).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});

// ── Sesión (login por rol) ────────────────────────────────────────────────
// Authorization: Bearer <token>. Sin cabecera = visitante; cabecera inválida o vencida = "invalido".
function quienDe(req: express.Request): Quien | null | "invalido" {
  const h = req.get("authorization");
  if (!h) return null;
  const m = h.match(/^Bearer ([\w-]+\.[\w-]+)$/);
  return (m && leerToken(m[1])) || "invalido";
}
const SIN_SESION = "Inicia sesión para usar esta función.";
const SESION_VENCIDA = "Tu sesión no es válida o venció; inicia sesión de nuevo.";

// Solo los roles indicados. 401 sin sesión válida, 403 con otro rol.
const exigir = (...roles: Rol[]): express.RequestHandler => (req, res, next) => {
  const q = quienDe(req);
  if (q === "invalido") return void res.status(401).json({ error: SESION_VENCIDA });
  if (!q) return void res.status(401).json({ error: SIN_SESION });
  if (!roles.includes(q.rol)) return void res.status(403).json({ error: "Tu rol no tiene acceso a esta función." });
  res.locals.quien = q;
  next();
};
const soloMonitor = exigir("monitor");

// Límite por dirección (además del bloqueo por correo): 20 intentos de login por minuto. Evita gastar CPU en
// scrypt con muchos correos distintos (hallazgo de fuzzing, 14-11-2026).
const intentosPorIp = new Map<string, { n: number; desde: number }>();
function demasiadosIntentos(ip: string, ahora = Date.now()): boolean {
  if (intentosPorIp.size > 10_000) intentosPorIp.clear();
  const v = intentosPorIp.get(ip);
  if (!v || ahora - v.desde > 60_000) {
    intentosPorIp.set(ip, { n: 1, desde: ahora });
    return false;
  }
  v.n++;
  return v.n > 20;
}
export const reiniciarLimiteLogin = () => intentosPorIp.clear();

app.post("/login", async (req, res) => {
  if (demasiadosIntentos(req.ip ?? "?")) {
    return void res.status(429).json({ error: "Demasiados intentos desde este equipo. Espera un minuto." });
  }
  const v = z.object({ correo: z.string().trim().min(3).max(120), clave: z.string().min(1).max(128) }).strict().safeParse(req.body);
  if (!v.success) return void res.status(400).json({ error: "Escribe tu correo y tu contraseña." });
  try {
    const r = await iniciarSesion(v.data.correo, v.data.clave, await crearRepositorio());
    if (!r.ok) return void res.status(r.status).json({ error: r.error });
    res.json({ token: r.token, usuario: r.usuario, registrado: r.registrado });
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Cerrar sesión: el token queda revocado aunque no haya vencido.
app.post("/logout", (req, res) => {
  const q = quienDe(req);
  if (q && q !== "invalido") revocar(q);
  res.json({ ok: true });
});

// Quién tiene la sesión (la interfaz lo usa al recargar). Sin datos del token más allá de rol y correo.
app.get("/yo", (req, res) => {
  const q = quienDe(req);
  if (!q || q === "invalido") return void res.status(401).json({ error: SESION_VENCIDA });
  res.json({ correo: q.correo, rol: q.rol, exp: q.exp });
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
app.post("/evaluar", soloMonitor, async (req, res) => {
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
  // La identidad sale del token: estudiante o docente con carné. Sin sesión (o el monitor) el chat solo informa.
  const q = quienDe(req);
  if (q === "invalido") return void res.status(401).json({ error: SESION_VENCIDA });
  const autenticado = q && q.carne ? q.carne : null;
  if (autenticado && !v.data.sesion) return void res.status(400).json({ error: "Falta el campo 'sesion' del chat." });
  try {
    res.json(await mensaje(v.data.texto, { laboratorio: v.data.laboratorio, sesion: v.data.sesion, autenticado }));
  } catch (e) {
    console.error("[http]", (e as Error).message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Casos sintéticos con su descripción, para la demostración (solo lectura).
app.get("/casos", soloMonitor, (_req, res) => {
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
app.get("/reservas", soloMonitor, async (req, res) => {
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
app.get("/notificaciones", soloMonitor, async (req, res) => {
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
app.get("/salas", soloMonitor, async (req, res) => {
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
app.get("/reservas/dias", soloMonitor, async (req, res) => {
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
app.get("/reservas/:codigo", soloMonitor, async (req, res) => {
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
app.patch("/notificaciones/:id", soloMonitor, async (req, res) => {
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
app.get("/salas/laboratorios", soloMonitor, (_req, res) => {
  res.json(resumenSalas());
});

// Rutas que no existen y errores no atrapados (JSON malformado, cuerpo > 10 kb, charset o compresión inválidos,
// URL mal codificada): respuesta JSON corta, sin la traza ni rutas del servidor (hallazgo de fuzzing, 14-11-2026).
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});
app.use((err: { status?: number; statusCode?: number; type?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = Number(err?.status ?? err?.statusCode ?? 500);
  const codigo = status >= 400 && status < 600 ? status : 500;
  if (codigo >= 500) console.error("[http]", err?.message);
  const error = codigo === 413 ? "El cuerpo de la petición es demasiado grande."
    : codigo < 500 ? "Petición inválida." : "Error interno";
  res.status(codigo).json({ error });
});
