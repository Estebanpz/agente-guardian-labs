// Pruebas de los extractores deterministas del chat de reservas (sin modelo).
import { extraer, type Extraido } from "../agent/tools/extraer.js";

const HOY = "2026-11-09"; // lunes

type Caso = { entrada: string; pendiente?: string; esperado: Partial<Extraido> };

const CASOS: Caso[] = [
  { entrada: "de 1 a 3 pm", esperado: { inicio: "13:00", fin: "15:00" } },
  { entrada: "de 8 a 10", esperado: { inicio: "08:00", fin: "10:00" } },
  { entrada: "mañana en la mañana", esperado: { fecha: "2026-11-10" } },
  { entrada: "Soy C-10000001, somos 5", esperado: { carne: "C-10000001", personas: 5 } },
  { entrada: "el jueves", esperado: { fecha: "2026-11-12" } },
  { entrada: "10 de noviembre", esperado: { fecha: "2026-11-10" } },
  { entrada: "sala 12", esperado: { sala: "sala-12" } },
  { entrada: "sala 17", esperado: { sala: null } },
  // Variantes de fecha y horario.
  { entrada: "hoy", esperado: { fecha: "2026-11-09" } },
  { entrada: "pasado mañana", esperado: { fecha: "2026-11-11" } },
  { entrada: "10/11", esperado: { fecha: "2026-11-10" } },
  { entrada: "2026-11-20", esperado: { fecha: "2026-11-20" } },
  { entrada: "13:00-15:00", esperado: { inicio: "13:00", fin: "15:00" } },
  { entrada: "2pm a 4pm", esperado: { inicio: "14:00", fin: "16:00" } },
  { entrada: "de 7PM - 9PM", esperado: { inicio: "19:00", fin: "21:00" } },
  { entrada: "7pm a 9pm", esperado: { inicio: "19:00", fin: "21:00" } },
  { entrada: "desde las 9 hasta las 11", esperado: { inicio: "09:00", fin: "11:00" } },
  { entrada: "de 12 a 2", esperado: { inicio: "12:00", fin: "14:00" } },
  // Números: el carné y la hora no cuentan como personas.
  { entrada: "para 20 computadores", esperado: { equipos: 20 } },
  { entrada: "grupo de 12", esperado: { personas: 12 } },
  { entrada: "veinte personas", esperado: { personas: 20 } },
  { entrada: "5", pendiente: "personas", esperado: { personas: 5 } },
  { entrada: "cinco", pendiente: "personas", esperado: { personas: 5 } },
  { entrada: "20", pendiente: "equipos", esperado: { equipos: 20 } },
  // Alto cómputo.
  { entrada: "sí, necesito alto poder de cómputo", esperado: { computo_alto: true } },
  { entrada: "no", pendiente: "computo_alto", esperado: { computo_alto: false } },
  { entrada: "si", pendiente: "computo_alto", esperado: { computo_alto: true } },
  // Materia: se conservan las tildes y se recorta a 60.
  { entrada: "clase de Bases de datos", esperado: { materia: "Bases de datos" } },
  { entrada: "para la clase de Inteligencia Artificial", pendiente: "materia", esperado: { materia: "Inteligencia Artificial" } },
  { entrada: "Redes", pendiente: "materia", esperado: { materia: "Redes" } },
  // Confirmación y cancelación.
  { entrada: "sí", esperado: { confirmacion: "si" } },
  { entrada: "no, cancela", esperado: { confirmacion: "no", cancelar: true } },
  { entrada: "dale", esperado: { confirmacion: "si" } },
  { entrada: "cancelar", esperado: { cancelar: true } },
];

let fallos = 0;
for (const caso of CASOS) {
  const r = extraer(caso.entrada, { hoy: HOY, pendiente: caso.pendiente ?? null });
  const fallas = (Object.keys(caso.esperado) as (keyof Extraido)[]).filter(
    (k) => JSON.stringify(r[k]) !== JSON.stringify(caso.esperado[k]));
  if (fallas.length) fallos++;
  const detalle = fallas.map((k) => `${k}=${JSON.stringify(r[k])}`).join(" ");
  console.log(`${fallas.length ? "❌" : "✅"} "${caso.entrada}"${caso.pendiente ? ` [${caso.pendiente}]` : ""}${fallas.length ? ` · ${detalle}` : ""}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
