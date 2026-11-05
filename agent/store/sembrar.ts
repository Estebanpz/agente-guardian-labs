import type { Db, Document } from "mongodb";
import {
  carnetizacionSemilla, equiposSemilla, reservasSemilla, salasSemilla, usuariosSemilla,
} from "../../data/semilla.js";

const PATRON_SALA = "^sala-(1[0-6]|[1-9])$";
const PATRON_CARNE = "^[CD]-\\d{8}$";
const PATRON_HORA = "^([01]\\d|2[0-3]):[0-5]\\d$";
const PATRON_FECHA = "^\\d{4}-\\d{2}-\\d{2}$";

// Validadores $jsonSchema (espejo de ReservaDoc, UsuarioDoc y NotificacionDoc).
const VALIDADORES: Record<string, Document> = {
  reservas: {
    bsonType: "object",
    required: ["codigo", "sala", "fecha", "inicio", "fin", "inicio_min", "fin_min", "tipo", "carne", "rol",
      "personas", "equipos", "computo_alto", "estado", "reglas_aplicadas", "traza", "version_reglas", "creada", "origen"],
    properties: {
      codigo: { bsonType: "string", pattern: "^RS-\\d{4}$" },
      sala: { bsonType: "string", pattern: PATRON_SALA },
      fecha: { bsonType: "string", pattern: PATRON_FECHA },
      inicio: { bsonType: "string", pattern: PATRON_HORA },
      fin: { bsonType: "string", pattern: PATRON_HORA },
      inicio_min: { bsonType: "int" },
      fin_min: { bsonType: "int" },
      tipo: { enum: ["estudiantes", "clase"] },
      carne: { bsonType: "string", pattern: PATRON_CARNE },
      rol: { enum: ["estudiante", "docente"] },
      personas: { bsonType: "int" },
      equipos: { bsonType: "int" },
      computo_alto: { bsonType: "bool" },
      materia: { bsonType: ["string", "null"] },
      estado: { enum: ["programada", "escalada"] },
      reglas_aplicadas: { bsonType: "array", items: { bsonType: "string" } },
      traza: { bsonType: "array", items: { bsonType: "string" } },
      version_reglas: { bsonType: "string" },
      creada: { bsonType: "date" },
      origen: { enum: ["chat", "semilla"] },
    },
  },
  usuarios: {
    bsonType: "object",
    required: ["_id", "rol", "registrado"],
    properties: {
      _id: { bsonType: "string", pattern: PATRON_CARNE },
      rol: { enum: ["estudiante", "docente"] },
      registrado: { bsonType: "date" },
    },
  },
  notificaciones: {
    bsonType: "object",
    required: ["para", "motivo", "regla", "reserva_codigo", "estado", "creada"],
    properties: {
      para: { enum: ["monitor", "coordinacion", "mantenimiento"] },
      motivo: { bsonType: "string" },
      regla: { bsonType: "string" },
      reserva_codigo: { bsonType: ["string", "null"] },
      estado: { enum: ["pendiente", "atendida"] },
      creada: { bsonType: "date" },
    },
  },
};

const COLECCIONES = [
  "salas", "equipos", "carnetizacion", "usuarios", "reservas", "notificaciones",
  "conversaciones", "bloqueos", "contadores",
];

// El driver tipa _id como ObjectId en colecciones sin tipo; aquí los _id son strings del dominio.
const porId = (id: unknown) => ({ _id: id }) as never;

// Índices de la sección 5.6. Los nombres salen del orden de las claves (sala_1_fecha_1_…).
async function crearIndices(db: Db): Promise<void> {
  await db.collection("reservas").createIndex({ sala: 1, fecha: 1, estado: 1, inicio_min: 1 });
  await db.collection("reservas").createIndex({ carne: 1, fecha: 1 });
  await db.collection("reservas").createIndex({ codigo: 1 }, { unique: true });
  await db.collection("equipos").createIndex({ sala: 1 });
  await db.collection("notificaciones").createIndex({ estado: 1, creada: -1 });
  await db.collection("conversaciones").createIndex({ actualizado: 1 }, { expireAfterSeconds: 1800 });
}

// Crea las colecciones que falten (con validador) y aplica el validador a las que ya existen.
async function aplicarEsquemas(db: Db): Promise<void> {
  const existentes = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const nombre of COLECCIONES) {
    const validator = VALIDADORES[nombre];
    if (!existentes.has(nombre)) {
      await db.createCollection(nombre, validator
        ? { validator: { $jsonSchema: validator }, validationLevel: "strict", validationAction: "error" }
        : {});
    } else if (validator) {
      await db.command({
        collMod: nombre,
        validator: { $jsonSchema: validator },
        validationLevel: "strict",
        validationAction: "error",
      });
    }
  }
}

// Vacía las colecciones de estado que se borran con --reset.
export async function resetear(db: Db): Promise<void> {
  for (const nombre of ["reservas", "notificaciones", "conversaciones", "bloqueos", "contadores"]) {
    await db.collection(nombre).deleteMany({});
  }
}

// Siembra la base (idempotente). `hoy` = fecha aaaa-mm-dd en Bogotá.
export async function sembrar(db: Db, hoy: string): Promise<Record<string, number>> {
  await aplicarEsquemas(db);
  await crearIndices(db);

  const reemplazar = (docs: { _id: unknown }[]) => docs.map((d) => ({
    replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
  })) as never[];
  await db.collection("salas").bulkWrite(reemplazar(salasSemilla));
  await db.collection("equipos").bulkWrite(reemplazar(equiposSemilla()));
  await db.collection("carnetizacion").bulkWrite(reemplazar(carnetizacionSemilla));
  await db.collection("usuarios").bulkWrite(reemplazar(usuariosSemilla));

  // Reservas de semilla: solo se insertan si su código no existe.
  const semilla = reservasSemilla(hoy);
  const existentes = new Set(
    (await db.collection("reservas").find({ codigo: { $in: semilla.map((r) => r.codigo) } }).toArray())
      .map((d) => d.codigo));
  const nuevas = semilla.filter((r) => !existentes.has(r.codigo));
  if (nuevas.length) await db.collection("reservas").insertMany(nuevas.map((r) => ({ ...r })));

  // El contador nunca retrocede por debajo de las reservas de semilla.
  await db.collection("contadores").updateOne(
    porId("reservas"), { $max: { n: 3 } }, { upsert: true });

  const resumen: Record<string, number> = {};
  for (const nombre of COLECCIONES) {
    resumen[nombre] = await db.collection(nombre).countDocuments();
  }
  return resumen;
}
