import { datosProhibidos } from "../agent/tools/privacidad.js";

const casos: [string, boolean][] = [
  ["Mi cédula es 1070612345, ¿puedo entrar?", true],
  ["Escríbeme a juan.perez@gmail.com", true],
  ["Llámame al 312 456 7890", true],
  ["Soy E-009, ¿puedo entrar a la sala 1 en la franja 08:00–10:00?", false],
  ["¿Hay cupo en la sala 2?", false],
];

let fallos = 0;
for (const [texto, debeBloquear] of casos) {
  const tipos = datosProhibidos(texto);
  const ok = (tipos.length > 0) === debeBloquear;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${debeBloquear ? "bloquea" : "permite"} [${tipos.join(",")}] <- ${texto}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
