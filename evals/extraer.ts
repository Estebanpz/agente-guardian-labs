// Pruebas de los extractores deterministas del chat de reservas (sin modelo).
import { cancelar, confirmacion, extraer, fechas, horaSuelta, personasAmbiguas, salaInexistente, salasNegadas, type Extraido } from "../agent/tools/extraer.js";

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
  // Días pasados (14-11-2026): se reconocen para rechazarlos, no para leerlos como otra cosa.
  { entrada: "La necesito para ayer", esperado: { fecha: "2026-11-08" } },
  { entrada: "antier", esperado: { fecha: "2026-11-07" } },
  // «el sábado 7 de noviembre»: manda el 7, no el próximo sábado (14).
  { entrada: "para el sábado 7 de noviembre", esperado: { fecha: "2026-11-07", personas: null } },
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
  // Duración sin rango (plan de rango horario, 3.1).
  { entrada: "por 5 horas", esperado: { duracion_min: 300 } },
  { entrada: "hora y media", esperado: { duracion_min: 90 } },
  { entrada: "3 horas y media", esperado: { duracion_min: 210 } },
  { entrada: "media hora", esperado: { duracion_min: 30 } },
  { entrada: "90 minutos", esperado: { duracion_min: 90 } },
  { entrada: "5 h", esperado: { duracion_min: 300 } },
  { entrada: "una hora", esperado: { duracion_min: 60 } },
  // Horas del día, no duración.
  { entrada: "a las 3", esperado: { duracion_min: null } },
  { entrada: "3 de la tarde", esperado: { duracion_min: null } },
  { entrada: "de 3 a 5", esperado: { duracion_min: null, inicio: "15:00", fin: "17:00" } },
  // 7.0.27: con un marcador de corrección manda el último valor del campo.
  { entrada: "para 10 personas, bueno no, somos 8", esperado: { personas: 8 } },
  { entrada: "de 10 a 12, perdón, de 2 a 4", esperado: { inicio: "14:00", fin: "16:00" } },
  { entrada: "mañana, mejor el jueves", esperado: { fecha: "2026-11-12" } },
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
// 7.0.24: cancelar la solicitud solo cuando el mensaje ES el pedido (anclado), no cuando la palabra aparece suelta.
const CANCELA: [string, boolean][] = [
  ["cancelar", true],
  ["Cancela", true],
  ["cancélalo", true],
  ["cancélala", true],
  ["cancelar la solicitud", true],
  ["olvídalo", true],
  ["olvídate", true],
  ["empezar de nuevo", true],
  ["ya no quiero", true],
  ["ya no la quiero", true],
  ["ya no quiero reservar", true],
  ["salir", true],
  ["¡No, cancélalo, por favor!", true],
  ["mejor cancelar", true],
  // No: la palabra aparece, pero el mensaje no es el pedido de cancelar la solicitud.
  ["se me olvidaba decir que somos 4", false],
  ["ya no quiero esa sala, mejor la 5", false],
  ["cancelación de la clase pero igual necesito la sala", false],
  ["no quiero cancelar", false],
  ["cancela esa reserva y me la das a mi", false],
  ["quiero cancelar la reserva RS-0002", false],
  ["hasta salir de clase necesito la sala", false],
];
for (const [texto, esperado] of CANCELA) {
  const r = cancelar(texto);
  const ok = r === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} cancelar("${texto}") = ${esperado}${ok ? "" : ` · ${r}`}`);
}
// Varias fechas en un mensaje (sección 7.0.4).
const FECHAS: [string, string[]][] = [
  ["el jueves y viernes", ["2026-11-12", "2026-11-13"]],
  ["mañana y pasado mañana", ["2026-11-10", "2026-11-11"]],
  ["lunes, martes y miércoles", ["2026-11-09", "2026-11-10", "2026-11-11"]],
  // 7.0.27: el día de la semana que precede a «13 de noviembre» es la misma fecha, no otra.
  ["el sábado 14 de noviembre", ["2026-11-14"]],
  ["mañana y el jueves", ["2026-11-10", "2026-11-12"]],
  ["en la mañana", []],
  ["por la mañana", []],
  ["en la tarde", []],
  ["la mañana", []],
];
for (const [texto, esperado] of FECHAS) {
  const r = fechas(texto, HOY);
  const ok = JSON.stringify(r) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} fechas("${texto}")${ok ? "" : ` · ${JSON.stringify(r)}`}`);
}
// ADV-07 y ADV-09 (14-11-2026): fechas imposibles y salas que no existen.
const IMPOSIBLES = ["el 31 de febrero", "2026-02-30", "31/04", "2026-13-01"];
for (const texto of IMPOSIBLES) {
  const r = extraer(texto, { hoy: HOY, pendiente: null }).fecha;
  const ok = r === null;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} fecha imposible "${texto}" → null${ok ? "" : ` · ${r}`}`);
}
const SALAS: [string, number | null][] = [["la sala 99", 99], ["sala 0", 0], ["laboratorio 17", 17], ["sala 16", null], ["sala 3", null], ["a las 99", null]];
for (const [texto, esperado] of SALAS) {
  const r = salaInexistente(texto);
  const ok = r === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} salaInexistente("${texto}") = ${esperado}${ok ? "" : ` · ${r}`}`);
}
// 7.0.27: confirmación estricta. Solo un afirmativo puro de inicio a fin confirma; una negación o una contradicción
// no se interpretan (el flujo pregunta «No entendí si confirmas»). «no, cancela» sigue siendo un no.
const CONFIRMA: [string, "si" | "no" | null][] = [
  ["sí", "si"], ["si", "si"], ["sí, confirmar", "si"], ["confirmo", "si"], ["confirmar", "si"],
  ["dale", "si"], ["de una", "si"], ["ok", "si"], ["listo", "si"], ["👍", "si"],
  ["no", "no"], ["no, cancela", "no"], ["no gracias", "no"],
  ["si, claro que no", null], ["nunca", null], ["claro que no", null], ["si pero mejor a las 4", null],
  ["sí, pero a las 4", null], ["no, mejor mañana", null],
];
for (const [texto, esperado] of CONFIRMA) {
  const r = confirmacion(texto);
  const ok = r === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} confirmacion("${texto}") = ${JSON.stringify(esperado)}${ok ? "" : ` · ${JSON.stringify(r)}`}`);
}
// 7.0.27: salas rechazadas en el mensaje. Se guardan como excluidas y no se vuelven a ofrecer.
const NEGADAS: [string, string[]][] = [
  ["No quiero la sala 13 dame otra", ["sala-13"]],
  ["la 13 no", ["sala-13"]],
  ["otra que no sea la 13", ["sala-13"]],
  ["menos la sala 5", ["sala-5"]],
  ["no la 2", ["sala-2"]],
  ["quiero la sala 4", []],
  ["la sala 13 está lejos", []],
];
for (const [texto, esperado] of NEGADAS) {
  const r = salasNegadas(texto);
  const ok = JSON.stringify(r) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} salasNegadas("${texto}") = ${JSON.stringify(esperado)}${ok ? "" : ` · ${JSON.stringify(r)}`}`);
}
// 7.0.27: dos cantidades sin marcador no se resuelven tomando la primera; se pregunta cuál.
const AMBIGUAS: [string, number[] | null][] = [
  ["somos 10 o 12", [10, 12]],
  ["para 5 o 6 personas", [5, 6]],
  ["somos 5", null],
  ["somos 10 personas, bueno no, 12", null],
];
for (const [texto, esperado] of AMBIGUAS) {
  const r = personasAmbiguas(texto);
  const ok = JSON.stringify(r) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} personasAmbiguas("${texto}") = ${JSON.stringify(esperado)}${ok ? "" : ` · ${JSON.stringify(r)}`}`);
}
// 7.0.27: una hora suelta («a las 4») no es un rango; el flujo pide las dos horas conservando la fecha.
const HORA_SUELTA: [string, boolean][] = [
  ["a las 4", true], ["mejor a las 4", true], ["4 pm", true], ["hasta las 3", true],
  ["de 4 a 6", false], ["de 10 a 12", false], ["somos 4", false],
];
for (const [texto, esperado] of HORA_SUELTA) {
  const r = horaSuelta(texto);
  const ok = r === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} horaSuelta("${texto}") = ${esperado}${ok ? "" : ` · ${r}`}`);
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
