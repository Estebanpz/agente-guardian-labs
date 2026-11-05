// Siembra la base de demostración en MongoDB Atlas.
// Uso: npm run seed                 (idempotente)
//      npm run seed -- --reset --si (borra reservas, notificaciones, conversaciones, bloqueos y contadores)
import { MongoClient } from "mongodb";
import { hoyBogota } from "../agent/tools/reloj.js";
import { resetear, sembrar } from "../agent/store/sembrar.js";

try { process.loadEnvFile(); } catch { /* sin .env: se exige en las variables del entorno */ }

const uri = process.env.MONGODB_URI;
const nombre = process.env.MONGODB_DB;
if (!uri || !nombre) {
  console.error("Faltan MONGODB_URI o MONGODB_DB en .env (ver .env.example).");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const confirmado = process.argv.includes("--si");
if (reset && !confirmado) {
  console.error("--reset borra reservas, notificaciones, conversaciones, bloqueos y contadores.");
  console.error("Para confirmar: npm run seed -- --reset --si");
  process.exit(1);
}

const cliente = new MongoClient(uri, { appName: "guardian-labs" });
try {
  await cliente.connect();
  const db = cliente.db(nombre);
  if (reset) await resetear(db);
  const resumen = await sembrar(db, hoyBogota());
  console.log(`Base "${nombre}" lista:`);
  for (const [coleccion, n] of Object.entries(resumen)) {
    console.log(`  ${coleccion.padEnd(16)} ${n}`);
  }
} catch (e) {
  // No se imprime la URI: se sustituye si aparece en el mensaje.
  const msg = (e as Error).message.split(uri).join("[uri]").replace(/mongodb(\+srv)?:\/\/\S+/g, "[uri]");
  console.error(`Error en la semilla: ${msg}`);
  process.exitCode = 1;
} finally {
  await cliente.close();
}
