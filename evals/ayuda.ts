import { temasDe } from "../agent/tools/ayuda.js";

const casos: [string, string[]][] = [
  ["que haces? quién eres? como te llamas? que es el ID? que es el tema de franjas horarias? ¿puedes agendar una sala para las 12:00 - 13:00? qué restricciones hay?",
    ["presentacion", "id", "franjas", "reglas", "reserva"]],
  ["La letra E, a que hace referencia? \"Estudiante\"?", ["id"]],
  ["dime qué salas hay disponibles y en qué franjas horarias?", ["franjas", "salas"]],
  ["que es la inducción de seguridad?", ["induccion"]],
  ["¿Qué pasa si el carné está vencido?", ["carne"]],
  ["que salas me recomiendas para una programaciónn de 12:00 - 14:00?", ["reserva"]],
  ["¿Cuál es mi nota de programación?", []],
  ["¿Qué horario tiene la biblioteca?", []],
];

let fallos = 0;
for (const [texto, esperado] of casos) {
  const obtenido = temasDe(texto);
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} [${obtenido.join(", ")}] <- ${texto.slice(0, 70)}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
