import { MongoClient, ObjectId, type Db, type ClientSession } from "mongodb";
import { z } from "zod";
import {
  CarneDoc, Carne, Conversacion, SesionDoc, DecisionReserva, EquipoDoc, Fecha, NotificacionDoc, ReservaDoc,
  SalaDoc, SalaId, UsuarioDoc,
} from "../tools/esquemas-reservas.js";
import { contarDias, type Repositorio } from "./repositorio.js";

// Un solo MongoClient por proceso.
let cliente: MongoClient | null = null;

function clienteUnico(uri: string): MongoClient {
  if (!cliente) {
    cliente = new MongoClient(uri, { appName: "guardian-labs" });
    const cerrar = () => { void cliente?.close().finally(() => process.exit(0)); };
    process.once("SIGINT", cerrar);
    process.once("SIGTERM", cerrar);
  }
  return cliente;
}

// El driver tipa _id como ObjectId en colecciones sin tipo; aquí los _id son strings del dominio.
const porId = (id: unknown) => ({ _id: id }) as never;

// Proyecciones explícitas: solo los campos que usa la interfaz.
const PROY_SALA = { _id: 1, nombre: 1, capacidad: 1, computo: 1, activa: 1, fuente: 1 };
const PROY_EQUIPO = { _id: 1, sala: 1, inventario: 1, mantenimiento: 1, accesible: 1 };
const PROY_CARNE = { _id: 1, rol: 1, vigencia: 1, nombres: 1, apellidos: 1, programa: 1, facultad: 1, jornada: 1, espacios: 1 };
const PROY_USUARIO = { _id: 1, rol: 1, registrado: 1 };
const PROY_RESERVA = {
  _id: 0, codigo: 1, sala: 1, fecha: 1, inicio: 1, fin: 1, inicio_min: 1, fin_min: 1, tipo: 1,
  carne: 1, rol: 1, jornada: 1, personas: 1, equipos: 1, computo_alto: 1, materia: 1, estado: 1,
  reglas_aplicadas: 1, traza: 1, version_reglas: 1, creada: 1, origen: 1, cancelada_en: 1,
};
const PROY_NOTIFICACION = { _id: 1, para: 1, motivo: 1, regla: 1, reserva_codigo: 1, carne: 1, sala: 1, fecha: 1, horario: 1, estado: 1, creada: 1, atendida_en: 1 };
// Un aviso se guarda sin _id: lo asigna Mongo. Al leerlo, el id sale como texto.
const sinId = (a: { _id?: string }) => { const { _id, ...resto } = a; void _id; return resto; };
const PROY_SESION = { _id: 1, carne: 1, actualizado: 1, pendiente_texto: 1 };
const PROY_CONVERSACION = { _id: 1, flujo: 1, pendiente: 1, datos: 1, intentos: 1, propuesta: 1, validado: 1, respaldo: 1, duracion_min: 1, ofrecer: 1, actualizado: 1 };

// Código siguiente RS-NNNN con el contador de la transacción (se revierte si la transacción falla).
async function siguienteCodigo(db: Db, session: ClientSession): Promise<string> {
  const doc = await db.collection("contadores").findOneAndUpdate(
    porId("reservas"),
    { $inc: { n: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  const n = (doc as { n?: unknown } | null)?.n;
  if (typeof n !== "number") throw new Error("Contador de reservas inválido");
  return `RS-${String(n).padStart(4, "0")}`;
}

// Crea el repositorio Mongo. Lanza error si no hay conexión (lo maneja crearRepositorio).
export async function crearRepositorioMongo(uri: string, nombreBase: string): Promise<Repositorio> {
  const c = clienteUnico(uri);
  await c.connect();
  await c.db("admin").command({ ping: 1 });
  const db = c.db(nombreBase);

  return {
    tipo: "mongo",

    async salas() {
      const docs = await db.collection("salas").find({}, { projection: PROY_SALA }).toArray();
      return docs.map((d) => SalaDoc.parse(d));
    },

    async equipos(sala) {
      const filtro = sala ? { sala: SalaId.parse(sala) } : {};
      const docs = await db.collection("equipos").find(filtro, { projection: PROY_EQUIPO }).toArray();
      return docs.map((d) => EquipoDoc.parse(d));
    },

    async carne(id) {
      const v = Carne.safeParse(id);
      if (!v.success) return null;
      const d = await db.collection("carnetizacion").findOne(porId(v.data), { projection: PROY_CARNE });
      return d ? CarneDoc.parse(d) : null;
    },

    async usuario(id) {
      const v = Carne.safeParse(id);
      if (!v.success) return null;
      const d = await db.collection("usuarios").findOne(porId(v.data), { projection: PROY_USUARIO });
      return d ? UsuarioDoc.parse(d) : null;
    },

    async registrarUsuario(u) {
      const v = UsuarioDoc.parse(u);
      try {
        await db.collection("usuarios").insertOne({ ...v } as never);
        return "creado";
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return "existente";
        throw e;
      }
    },

    async reservasDelDia(fecha, sala) {
      const filtro: Record<string, unknown> = { fecha: Fecha.parse(fecha), estado: "programada" };
      if (sala) filtro.sala = SalaId.parse(sala);
      const docs = await db.collection("reservas").find(filtro, { projection: PROY_RESERVA }).toArray();
      return docs.map((d) => ReservaDoc.parse(d));
    },

    async escaladasDelDia(fecha) {
      const docs = await db.collection("reservas")
        .find({ fecha: Fecha.parse(fecha), estado: "escalada" }, { projection: PROY_RESERVA })
        .toArray();
      return docs.map((d) => ReservaDoc.parse(d));
    },

    async crearReservaAtomica(fecha, sala, revalidar, construir) {
      Fecha.parse(fecha);
      SalaId.parse(sala);
      const salida: { r?: { decision: DecisionReserva; reserva: ReservaDoc | null } } = {};
      await c.withSession((session) => session.withTransaction(async (s) => {
        // 1) candado por sala y día: fuerza el orden entre dos reservas simultáneas
        await db.collection("bloqueos").updateOne(
          porId(`${sala}|${fecha}`), { $inc: { v: 1 } }, { upsert: true, session: s });
        // 2) reservas programadas de esa sala y ese día
        const docs = await db.collection("reservas").find(
          { fecha, sala, estado: "programada" }, { session: s, projection: PROY_RESERVA }).toArray();
        // 3) revalidar; si ya no se puede programar, no se inserta nada
        const decision = revalidar(docs.map((d) => ReservaDoc.parse(d)));
        if (decision.decision !== "programar") {
          salida.r = { decision, reserva: null };
          return;
        }
        // 4) código con el contador e inserción
        const codigo = await siguienteCodigo(db, s);
        const reserva = ReservaDoc.parse(construir(codigo));
        await db.collection("reservas").insertOne({ ...reserva }, { session: s });
        salida.r = { decision, reserva };
      }));
      if (!salida.r) throw new Error("La transacción no devolvió resultado");
      return salida.r;
    },

    async registrarEscalada(construirReserva, construirAvisos) {
      // Contador + reserva + avisos en UNA transacción: o se guardan todos o ninguno.
      const salida: { codigo?: string } = {};
      await c.withSession((session) => session.withTransaction(async (s) => {
        const codigo = await siguienteCodigo(db, s);
        const reserva = ReservaDoc.parse(construirReserva(codigo));
        const avisos = construirAvisos(codigo).map((a) => NotificacionDoc.parse(a));
        if (reserva.estado !== "escalada") throw new Error("registrarEscalada exige estado escalada");
        await db.collection("reservas").insertOne({ ...reserva }, { session: s });
        await db.collection("notificaciones").insertMany(avisos.map(sinId), { session: s });
        salida.codigo = codigo;
      }));
      if (!salida.codigo) throw new Error("La transacción de escalada no devolvió código");
      return salida.codigo;
    },

    async notificar(n) {
      const v = NotificacionDoc.parse(n);
      if (v.reserva_codigo !== null) throw new Error("notificar sin reserva exige reserva_codigo null");
      await db.collection("notificaciones").insertOne(sinId(v));
    },

    async notificaciones(estado) {
      const filtro = estado ? { estado: z.enum(["pendiente", "atendida"]).parse(estado) } : {};
      const docs = await db.collection("notificaciones")
        .find(filtro, { projection: PROY_NOTIFICACION })
        .sort({ creada: -1 })
        .limit(100)
        .toArray();
      return docs.map((d) => NotificacionDoc.parse({ ...d, _id: String(d._id) }));
    },

    async marcarAtendida(id, cuando) {
      if (!/^[a-f0-9]{24}$/i.test(id)) return false;
      const r = await db.collection("notificaciones").updateOne(
        { _id: new ObjectId(id), estado: "pendiente" },
        { $set: { estado: "atendida", atendida_en: cuando } },
      );
      return r.matchedCount === 1;
    },

    async diasConReservas(mes) {
      const docs = await db.collection("reservas")
        .find({ fecha: { $gte: `${mes}-01`, $lte: `${mes}-31` }, estado: { $in: ["programada", "escalada"] } },
          { projection: { _id: 0, fecha: 1, estado: 1 } })
        .toArray();
      return contarDias(docs.map((d) => ({ fecha: String(d.fecha), estado: String(d.estado) })));
    },

    async reservasDeCarne(carneId, desde) {
      const docs = await db.collection("reservas")
        .find({ carne: Carne.parse(carneId), estado: "programada", fecha: { $gte: Fecha.parse(desde) } }, { projection: PROY_RESERVA })
        .sort({ fecha: 1, inicio_min: 1 }).toArray();
      return docs.map((d) => ReservaDoc.parse(d));
    },

    async cancelarReserva(codigo, carneId, cuando) {
      const r = await db.collection("reservas").updateOne(
        { codigo: z.string().regex(/^RS-\d{4}$/).parse(codigo), carne: Carne.parse(carneId), estado: "programada" },
        { $set: { estado: "cancelada", cancelada_en: cuando } },
      );
      return r.modifiedCount === 1;
    },

    async reservaPorCodigo(codigo) {
      const d = await db.collection("reservas").findOne({ codigo: z.string().parse(codigo) }, { projection: PROY_RESERVA });
      return d ? ReservaDoc.parse(d) : null;
    },

    async leerConversacion(id) {
      if (!z.uuid().safeParse(id).success) return null;
      const d = await db.collection("conversaciones").findOne(porId(id), { projection: PROY_CONVERSACION });
      return d ? Conversacion.parse(d) : null;
    },

    async guardarConversacion(conv) {
      const v = Conversacion.parse(conv);
      await db.collection("conversaciones").replaceOne(porId(v._id), { ...v }, { upsert: true });
    },

    async borrarConversacion(id) {
      if (!z.uuid().safeParse(id).success) return;
      await db.collection("conversaciones").deleteOne(porId(id));
    },

    async leerSesion(id) {
      if (!z.uuid().safeParse(id).success) return null;
      const d = await db.collection("sesiones").findOne(porId(id), { projection: PROY_SESION });
      return d ? SesionDoc.parse(d) : null;
    },

    async guardarSesion(s) {
      const v = SesionDoc.parse(s);
      await db.collection("sesiones").replaceOne(porId(v._id), { ...v }, { upsert: true });
    },

    async borrarSesion(id) {
      if (!z.uuid().safeParse(id).success) return;
      await db.collection("sesiones").deleteOne(porId(id));
    },

    async cerrar() {
      await c.close();
      cliente = null;
    },
  };
}
