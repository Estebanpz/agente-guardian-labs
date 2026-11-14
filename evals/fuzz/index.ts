// Ejecuta los fuzzers, cada uno en su propio proceso con un límite de tiempo: si uno se cuelga (bucle síncrono)
// o se cae, se informa y se sigue con el siguiente. Uso: npm run fuzz  (SEMILLA=n e ITERACIONES=n opcionales).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SEMILLA = process.env.SEMILLA ?? String(Math.floor(Math.random() * 2 ** 31));
const ARCHIVOS: [string, string[]][] = [["api.ts", []], ["chat.ts", []], ["redos.ts", []], ["memoria.ts", ["--expose-gc"]]];
let fallos = 0;
console.log(`Fuzzing con semilla ${SEMILLA} (repetir: SEMILLA=${SEMILLA} npm run fuzz)\n`);
for (const [archivo, nodo] of ARCHIVOS) {
  const ruta = fileURLToPath(new URL(`./${archivo}`, import.meta.url));
  console.log(`── ${archivo}`);
  const r = spawnSync("npx", ["tsx", ...nodo, ruta], {
    stdio: "inherit", timeout: 300_000,
    env: { ...process.env, SEMILLA, REPOSITORIO: "memoria", PROVEEDOR: "ollama", MODELO_TIEMPO_MS: "2000" },
  });
  if (r.error || r.status !== 0) {
    fallos++;
    if (r.error || r.signal) console.log(`❌ ${archivo} no terminó: ${r.error?.message ?? r.signal} (posible bloqueo o caída)`);
  }
  console.log();
}
console.log(fallos === 0 ? "Fuzzing: todos los fuzzers pasaron" : `Fuzzing: ${fallos} fuzzer(s) con fallos`);
process.exit(fallos === 0 ? 0 : 1);
