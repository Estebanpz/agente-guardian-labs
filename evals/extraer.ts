// Pruebas de los extractores deterministas del chat de reservas (sin modelo).
import { extraer, fechas, type Extraido } from "../agent/tools/extraer.js";

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
  // Horarios abiertos (plan de identidad, sección 3).
  { entrada: "8:30AM - 11:30AM", esperado: { inicio: "08:30", fin: "11:30" } },
  { entrada: "8:30 am - 11:30 am", esperado: { inicio: "08:30", fin: "11:30" } },
  { entrada: "2 a 4 pm", esperado: { inicio: "14:00", fin: "16:00" } },
  { entrada: "11:30am a 1pm", esperado: { inicio: "11:30", fin: "13:00" } },
  { entrada: "18:30 a 20:00", esperado: { inicio: "18:30", fin: "20:00" } },
  { entrada: "5:30 -7:30", esperado: { inicio: "17:30", fin: "19:30" } },
  { entrada: "de 5:30 a 7:30", esperado: { inicio: "17:30", fin: "19:30" } },
  { entrada: "8:30 a. m. a 11:30 a. m.", esperado: { inicio: "08:30", fin: "11:30" } },
  { entrada: "8.30 a 11.30", esperado: { inicio: "08:30", fin: "11:30" } },
  { entrada: "8h30 a 11h30", esperado: { inicio: "08:30", fin: "11:30" } },
  { entrada: "de 8 y media a 11 y media", esperado: { inicio: "08:30", fin: "11:30" } },
  { entrada: "de 8 y cuarto a 9 y cuarto", esperado: { inicio: "08:15", fin: "09:15" } },
  { entrada: "de 11AM hasta la 1PM", esperado: { inicio: "11:00", fin: "13:00" } },
  { entrada: "de 11 a la 1", esperado: { inicio: "11:00", fin: "13:00" } },
  { entrada: "de 9 a las 11", esperado: { inicio: "09:00", fin: "11:00" } },
  { entrada: "Mejor quiero la sala 1 mañana a la 1PM hasta las 3PM", esperado: { sala: "sala-1", fecha: "2026-11-10", inicio: "13:00", fin: "15:00" } },
  { entrada: "la sala 2 a las 3 pm hasta las 5 pm", esperado: { sala: "sala-2", inicio: "15:00", fin: "17:00" } },
  { entrada: "sala 10 a las 8 hasta las 10", esperado: { sala: "sala-10", inicio: "08:00", fin: "10:00" } },
  { entrada: "sala 6 de 2 a 4 pm", esperado: { sala: "sala-6", inicio: "14:00", fin: "16:00" } },
  { entrada: "la sala 12 desde las 7 hasta las 9 de la noche", esperado: { sala: "sala-12", inicio: "19:00", fin: "21:00" } },
  { entrada: "quiero la sala 1 mañana de 1PM hasta las 3PM", esperado: { sala: "sala-1", inicio: "13:00", fin: "15:00" } },
  { entrada: "de 11 a 1 pm", esperado: { inicio: "11:00", fin: "13:00" } },
  { entrada: "de 8 hasta las 10 am", esperado: { inicio: "08:00", fin: "10:00" } },
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
// Varias fechas en un mensaje (sección 7.0.4).
const FECHAS: [string, string[]][] = [
  ["el jueves y viernes", ["2026-11-12", "2026-11-13"]],
  ["mañana y pasado mañana", ["2026-11-10", "2026-11-11"]],
  ["lunes, martes y miércoles", ["2026-11-09", "2026-11-10", "2026-11-11"]],
  ["en la mañana", []],
];
for (const [texto, esperado] of FECHAS) {
  const r = fechas(texto, HOY);
  const ok = JSON.stringify(r) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} fechas("${texto}")${ok ? "" : ` · ${JSON.stringify(r)}`}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
