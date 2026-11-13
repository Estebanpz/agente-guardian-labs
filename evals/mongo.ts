// Prueba de humo con MongoDB Atlas sobre la base de pruebas (MONGODB_DB_PRUEBAS).
// Uso: npm run prueba:mongo   (no forma parte de npm run pruebas)
import { MongoClient, type Db } from "mongodb";
import type { DecisionReserva, ReservaDoc } from "../agent/tools/esquemas-reservas.js";
import { crearRepositorioMongo } from "../agent/store/mongo.js";
import { sembrar } from "../agent/store/sembrar.js";
import { readFileSync } from "node:fs";
const VERSION_REGLAS = JSON.parse(readFileSync(new URL("../agent/rules/reglas.json", import.meta.url), "utf-8")).version as string;

try { process.loadEnvFile(); } catch { /* sin .env */ }

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log("Omitida: sin MONGODB_URI");
  process.exit(0);
}

const nombre = process.env.MONGODB_DB_PRUEBAS ?? "guardian_labs_test";
if (nombre === process.env.MONGODB_DB) {
  console.error("Abortada: MONGODB_DB_PRUEBAS no puede ser la base real.");
  process.exit(1);
}

// Borra las colecciones una por una (dropCollection). Así funciona con los roles readWrite + dbAdmin de la guía:
// no se usa dropDatabase, que requiere permisos de cluster.
async function vaciarBase(db: Db): Promise<void> {
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    await db.dropCollection(name);
  }
}

const FECHA = "2026-11-10";
const SALA = "sala-4";
const decision = (d: "programar" | "negar"): DecisionReserva => ({
  decision: d,
  estado: d === "programar" ? "confirmado" : "falso",
  accion: d === "programar" ? "programar_reserva" : "orientar_proceso",
  reglas_aplicadas: [d === "programar" ? "R25" : "R22"],
  sala_asignada: d === "programar" ? SALA : null,
  alternativas: [], conflictos: [], faltantes: [], notificar: [], fuentes: [],
  version_reglas: VERSION_REGLAS, traza: [],
});
// Reserva de prueba 16:00–18:00 en sala-4.
const construir = (codigo: string): ReservaDoc => ({
  codigo, sala: SALA, fecha: FECHA, inicio: "16:00", fin: "18:00", inicio_min: 960, fin_min: 1080,
  tipo: "estudiantes", carne: "C-10000001", rol: "estudiante", personas: 5, equipos: 5,
  computo_alto: false, materia: null, estado: "programada", reglas_aplicadas: ["R25"], traza: [],
  version_reglas: VERSION_REGLAS, creada: new Date(), origen: "chat",
});
const revalidar = (actuales: ReservaDoc[]) =>
  actuales.some((r) => r.inicio_min < 1080 && r.fin_min > 960) ? decision("negar") : decision("programar");

const cliente = new MongoClient(uri, { appName: "guardian-labs" });
let fallos = 0;
const comprobar = (ok: boolean, texto: string) => {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${texto}`);
};

try {
  await cliente.connect();
  const db = cliente.db(nombre);
  await vaciarBase(db);
  await sembrar(db, "2026-11-09");
  const repo = await crearRepositorioMongo(uri, nombre);

  // 1) Primera reserva: se crea con el siguiente código (la semilla llega a RS-0003).
  const primera = await repo.crearReservaAtomica(FECHA, SALA, revalidar, construir);
  comprobar(primera.reserva?.codigo === "RS-0004", `primera reserva creada (${primera.reserva?.codigo ?? "null"})`);

  // 2) Misma franja otra vez: debe salir en conflicto y no insertar.
  const segunda = await repo.crearReservaAtomica(FECHA, SALA, revalidar, construir);
  comprobar(segunda.reserva === null && segunda.decision.decision === "negar", "segunda reserva en conflicto, no insertada");

  // 3) Solo cuentan las reservas programadas del día en esa sala.
  const dia = await repo.reservasDelDia(FECHA, SALA);
  comprobar(dia.length === 1, `reservasDelDia = ${dia.length} (esperado 1)`);

  // 4) Escalada: recibe código del mismo contador (RS-0005) y su aviso lo referencia.
  const codigoEscalada = await repo.registrarEscalada(
    (codigo) => ({ ...construir(codigo), estado: "escalada", reglas_aplicadas: ["R20"] }),
    (codigo) => [{
      para: "monitor" as const, motivo: "Conflicto con reserva de estudiantes", regla: "R20",
      reserva_codigo: codigo, estado: "pendiente" as const, creada: new Date(),
    }],
  );
  comprobar(codigoEscalada === "RS-0005", `escalada con código ${codigoEscalada} (esperado RS-0005)`);
  const pendientes = await repo.notificaciones("pendiente");
  comprobar(pendientes.length === 1 && pendientes[0].reserva_codigo === codigoEscalada,
    `notificaciones pendientes = ${pendientes.length}, referencia ${pendientes[0]?.reserva_codigo ?? "—"}`);
  comprobar((await repo.reservasDelDia(FECHA, SALA)).length === 1, "la escalada no cuenta como programada");

  // 5) Sesión identificada: se guarda, se lee y se borra; el índice TTL de sesiones existe (1800 s).
  const sesion = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await repo.guardarSesion({ _id: sesion, carne: "C-10000001", actualizado: new Date(), pendiente_texto: null });
  comprobar((await repo.leerSesion(sesion))?.carne === "C-10000001", "sesión guardada y leída");
  await repo.borrarSesion(sesion);
  comprobar((await repo.leerSesion(sesion)) === null, "sesión borrada");
  const indices = await db.collection("sesiones").indexes();
  comprobar(indices.some((i) => i.key?.actualizado === 1 && i.expireAfterSeconds === 1800), "índice TTL de sesiones (1800 s)");

  // 6) Aviso: se guarda con id, se marca atendido una sola vez y guarda la hora; el calendario del mes cuenta reservas.
  await repo.notificar({
    para: "monitor", motivo: "prueba de atención", regla: "R17", reserva_codigo: null,
    carne: "C-10000002", estado: "pendiente", creada: new Date(),
  });
  const aviso = (await repo.notificaciones("pendiente")).find((n) => n.motivo === "prueba de atención");
  comprobar(typeof aviso?._id === "string", "aviso guardado con id de texto");
  const id = aviso?._id ?? "";
  comprobar(await repo.marcarAtendida(id, new Date()) === true, "marcar atendido: cambia el aviso");
  comprobar(await repo.marcarAtendida(id, new Date()) === false, "marcar atendido otra vez: no cambia nada");
  const atendido = (await repo.notificaciones("atendida")).find((n) => n._id === id);
  comprobar(atendido?.atendida_en instanceof Date, "el aviso atendido guarda la hora");
  comprobar((await repo.diasConReservas("2026-11")).some((d) => d.programadas > 0), "calendario: días del mes con reservas");

  await repo.cerrar();
  await vaciarBase(db);
  console.log(`\nBase de pruebas "${nombre}" vaciada (colecciones borradas).`);
} catch (e) {
  fallos++;
  const msg = (e as Error).message.split(uri).join("[uri]").replace(/mongodb(\+srv)?:\/\/\S+/g, "[uri]");
  console.error(`❌ Error: ${msg}`);
} finally {
  await cliente.close();
}

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
