import { datosProhibidos } from "../agent/tools/privacidad.js";

const casos: [string, boolean][] = [
  ["Mi cédula es 1070612345, ¿puedo entrar?", true],
  ["Escríbeme a juan.perez@gmail.com", true],
  ["Llámame al 312 456 7890", true],
  ["Soy E-009, ¿puedo entrar a la sala 1 en la franja 08:00–10:00?", false],
  ["¿Hay cupo en la sala 2?", false],
  ["Soy C-10000001", false],
  ["Mi cédula es 1070612345", true],
  // ADV-04 (14-11-2026): separadores y ofuscación.
  ["mi cedula es 1.070.612.345", true],
  ["documento 1070 612 345", true],
  ["C.C. 1070612345", true],
  ["c.c 52.345.678", true],
  ["escribeme a juan.perez arroba gmail punto com", true],
  ["juan[at]gmail[dot]com", true],
  ["llamame al (312) 456-7890", true],
  ["mi numero +573124567890", true],
  ["+57 312 456 7890", true],
  // Sin falsos positivos: fechas, horas, códigos, salas y carnés.
  ["Reserva la sala 3 el 2026-11-20 de 14:00 a 16:00", false],
  ["Cancela la RS-0042", false],
  ["el 20/11 de 8 a 10 somos 25", false],
  ["Soy D-20000001, quiero la sala 12", false],
  ["la quiero el 20-11-2026 y el 21.11.2026", false],
  ["mi cc es uno dos tres cuatro cinco seis siete ocho", true],
  ["de dos a cuatro en la sala tres, somos cinco", false],
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
