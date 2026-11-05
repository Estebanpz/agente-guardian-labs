// Prueba de humo con MongoDB Atlas sobre la base de pruebas (MONGODB_DB_PRUEBAS).
// Uso: npm run prueba:mongo   (no forma parte de npm run pruebas)
import { MongoClient } from "mongodb";
import type { DecisionReserva, ReservaDoc } from "../agent/tools/esquemas-reservas.js";
import { crearRepositorioMongo } from "../agent/store/mongo.js";
import { sembrar } from "../agent/store/sembrar.js";

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

const FECHA = "2026-11-10";
const SALA = "sala-4";
const decision = (d: "programar" | "negar"): DecisionReserva => ({
  decision: d,
  estado: d === "programar" ? "confirmado" : "falso",
  accion: d === "programar" ? "programar_reserva" : "orientar_proceso",
  reglas_aplicadas: [d === "programar" ? "R25" : "R22"],
  sala_asignada: d === "programar" ? SALA : null,
  alternativas: [], conflictos: [], faltantes: [], notificar: [], fuentes: [],
  version_reglas: "2.0.0", traza: [],
});
// Reserva de prueba 16:00–18:00 en sala-4.
const construir = (codigo: string): ReservaDoc => ({
  codigo, sala: SALA, fecha: FECHA, inicio: "16:00", fin: "18:00", inicio_min: 960, fin_min: 1080,
  tipo: "estudiantes", carne: "C-10000001", rol: "estudiante", personas: 5, equipos: 5,
  computo_alto: false, materia: null, estado: "programada", reglas_aplicadas: ["R25"], traza: [],
  version_reglas: "2.0.0", creada: new Date(), origen: "chat",
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
  await db.dropDatabase();
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

  // 4) Escalada: reserva "escalada" + aviso pendiente (no aparece en reservasDelDia).
  const escalada: ReservaDoc = { ...construir("RS-0099"), estado: "escalada", reglas_aplicadas: ["R20"] };
  await repo.registrarEscalada(escalada, {
    para: "monitor", motivo: "Conflicto con reserva de estudiantes", regla: "R20",
    reserva_codigo: "RS-0099", estado: "pendiente", creada: new Date(),
  });
  const pendientes = await repo.notificaciones("pendiente");
  comprobar(pendientes.length === 1, `notificaciones pendientes = ${pendientes.length} (esperado 1)`);
  comprobar((await repo.reservasDelDia(FECHA, SALA)).length === 1, "la escalada no cuenta como programada");

  await repo.cerrar();
  await db.dropDatabase();
  console.log(`\nBase de pruebas "${nombre}" borrada.`);
} catch (e) {
  fallos++;
  const msg = (e as Error).message.split(uri).join("[uri]").replace(/mongodb(\+srv)?:\/\/\S+/g, "[uri]");
  console.error(`❌ Error: ${msg}`);
} finally {
  await cliente.close();
}

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
