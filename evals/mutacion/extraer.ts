// Pruebas que matan mutantes sobrevivientes de agent/tools/extraer.ts (Stryker, 14-11-2026).
// Cada caso fija un límite o una rama que la batería original no tocaba. Ver docs/pruebas/MUTACION.md.
import {
  cancelar, carne, carnesEn, computoAlto, equipos, extraer, fecha, fechas, horario, materia, personas,
  salaInexistente, sinCarnes,
} from "../../agent/tools/extraer.js";

const HOY = "2026-11-09"; // lunes
let fallos = 0;
const igual = (nombre: string, obtenido: () => unknown, esperado: unknown) => {
  let valor: unknown;
  try { valor = obtenido(); } catch (e) { valor = `excepción: ${(e as Error).message}`; }
  const ok = JSON.stringify(valor) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${ok ? "" : ` · obtenido ${JSON.stringify(valor)}, esperado ${JSON.stringify(esperado)}`}`);
};
const ex = (t: string, pendiente: string | null = null) => extraer(t, { hoy: HOY, pendiente });
const rango = (t: string) => { const r = ex(t); return [r.inicio, r.fin]; };

// ── Fechas: relleno con cero, año explícito, límites de mes y años de dos cifras de Date.UTC ──
igual("5/3 → 2026-03-05 (día y mes con cero a la izquierda)", () => ex("5/3").fecha, "2026-03-05");
igual("10/11/2027 respeta el año escrito", () => ex("10/11/2027").fecha, "2027-11-10");
igual("2026-01-15 (enero es un mes válido)", () => ex("2026-01-15").fecha, "2026-01-15");
igual("2026-12-05 (diciembre es un mes válido)", () => ex("2026-12-05").fecha, "2026-12-05");
igual("0050-01-01 no existe para el extractor (Date.UTC lo lleva a 1950)", () => ex("0050-01-01").fecha, null);
igual("fecha() sin fecha → null (no lanza)", () => fecha("sin fecha", HOY), null);
igual("fechas: «hoy y mañana» → dos fechas", () => fechas("hoy y mañana", HOY), ["2026-11-09", "2026-11-10"]);
igual("fechas: la misma fecha dicha dos veces no se repite", () => fechas("hoy y 2026-11-09", HOY), ["2026-11-09"]);
igual("fechas: máximo 7 aunque el texto traiga 8",
  () => fechas("2026-11-20 lunes martes miercoles jueves viernes sabado domingo", HOY).length, 7);

// ── Carnés: sin guion, varios, y quitarlos del texto ──
igual("carne('c10000001') → C-10000001 (guion opcional)", () => carne("c10000001"), "C-10000001");
igual("carnesEn: sin guion y en minúscula", () => carnesEn("C10000002 y d20000003"), ["C-10000002", "D-20000003"]);
igual("sinCarnes conserva las tildes en NFC", () => sinCarnes("canción C-10000001"), "canción");
igual("sinCarnes quita el carné sin guion", () => sinCarnes("C10000001 hola"), "hola");
igual("sinCarnes reemplaza el carné por un espacio", () => sinCarnes("(C-10000001)"), "( )");
igual("sinCarnes colapsa los espacios", () => sinCarnes("hola   C-10000001   adios"), "hola adios");
igual("sinCarnes no toca una palabra con C seguida de un número", () => sinCarnes("ref Cx12345678"), "ref Cx12345678");
igual("sinCarnes no toca «Cosas 12345678»", () => sinCarnes("Cosas 12345678"), "Cosas 12345678");
igual("el carné no se lee como hora: «C-10000001 a 5»", () => ex("C-10000001 a 5").inicio, null);
igual("el carné sin guion no se lee como hora: «C10000001 a 5»", () => ex("C10000001 a 5").inicio, null);

// ── Horario: sufijos am/pm escritos de varias formas ──
igual("«de 8 a.m a 10 a.m» (sin punto final)", () => rango("de 8 a.m a 10 a.m"), ["08:00", "10:00"]);
igual("«8:30 a.m. a 11:30 a.m.» (sin espacio)", () => rango("8:30 a.m. a 11:30 a.m."), ["08:30", "11:30"]);
igual("«de 2 p m a 4 p m» (sin puntos)", () => rango("de 2 p m a 4 p m"), ["14:00", "16:00"]);
igual("«de 6 a 8 de la mañana» es am", () => rango("de 6 a 8 de la mañana"), ["06:00", "08:00"]);
// ── Horario: límites de a24 ──
igual("minuto 59 es válido: «de 8:59 a 9:30»", () => rango("de 8:59 a 9:30"), ["08:59", "09:30"]);
igual("minuto 75 no es válido: «de 8:75 a 10:00»", () => rango("de 8:75 a 10:00"), [null, null]);
igual("«de 12 pm a 2 pm» → 12:00–14:00", () => rango("de 12 pm a 2 pm"), ["12:00", "14:00"]);
igual("«de 12 am a 2 am» → 00:00–02:00", () => rango("de 12 am a 2 am"), ["00:00", "02:00"]);
igual("«de 1 a 3» → 13:00–15:00 (1 sin sufijo es tarde)", () => rango("de 1 a 3"), ["13:00", "15:00"]);
igual("«de 6 a 8» → 18:00–20:00 (6 sin sufijo es tarde)", () => rango("de 6 a 8"), ["18:00", "20:00"]);
igual("«de 5 a 6 am» → 05:00–06:00 (am explícito)", () => rango("de 5 a 6 am"), ["05:00", "06:00"]);
igual("«de 0 a 2» → empieza a las 00:00", () => ex("de 0 a 2").inicio, "00:00");
igual("las 24 no son una hora válida: «de 22 a 24»", () => rango("de 22 a 24"), [null, null]);
// ── Horario: fin sin sufijo antes o igual al inicio ──
igual("«de 9 a 9» → 09:00–21:00", () => rango("de 9 a 9"), ["09:00", "21:00"]);
igual("«de 10 a 10» → 10:00–22:00 (22:00 es el tope)", () => rango("de 10 a 10"), ["10:00", "22:00"]);
igual("«de 11 a 11» no pasa de las 22:00", () => rango("de 11 a 11"), ["11:00", "11:00"]);
igual("«de 20 a 8» no se ajusta (20:00 no es posterior)", () => rango("de 20 a 8"), ["20:00", "08:00"]);
igual("«de 11 a 11 pm» → 11:00–23:00 (segundo candidato)", () => rango("de 11 a 11 pm"), ["11:00", "23:00"]);
igual("rango inválido «de 5 a 3» se devuelve para que el motor diga qué falla", () => rango("de 5 a 3"), ["17:00", "15:00"]);
igual("horario() exportado", () => horario("de 8 a 10"), { inicio: "08:00", fin: "10:00" });
igual("los números del horario no cuentan como personas: «para 8 a 10»", () => ex("para 8 a 10").personas, null);

// ── Salas ──
igual("«sala3» → sala-3", () => ex("sala3").sala, "sala-3");
igual("«sala-3» → sala-3", () => ex("sala-3").sala, "sala-3");
igual("«salas 3» no es una sala", () => ex("salas 3").sala, null);
igual("salaInexistente('sala99') = 99", () => salaInexistente("sala99"), 99);
igual("salaInexistente('sala-99') = 99", () => salaInexistente("sala-99"), 99);
igual("salaInexistente('salas 99') = null", () => salaInexistente("salas 99"), null);

// ── Números según lo pendiente ──
igual("«5» sin pendiente no son personas", () => personas("5"), null);
igual("pendiente personas y «no sé» → null", () => personas("no sé", "personas"), null);
igual("«20» sin pendiente no son equipos", () => equipos("20"), null);
igual("pendiente equipos y «no sé» → null", () => equipos("no sé", "equipos"), null);
igual("pendiente cómputo y «tal vez» → null", () => computoAlto("tal vez", "computo_alto"), null);
igual("«alto computo» → true", () => computoAlto("necesito alto computo"), true);
igual("«alto poder computo» → true", () => computoAlto("alto poder computo"), true);
igual("«un equipo potente» → true", () => computoAlto("un equipo potente"), true);

// ── Materia ──
igual("materia pendiente: «para Redes» → Redes", () => materia("para Redes", "materia"), "Redes");
igual("materia pendiente con doble espacio", () => materia("para  la clase de Redes", "materia"), "Redes");
igual("materia pendiente de 1 letra → null", () => materia(" x ", "materia"), null);
igual("materia pendiente «IA» (2 letras) vale", () => materia("IA", "materia"), "IA");
igual("materia pendiente se recorta a 60", () => materia("a".repeat(70), "materia")?.length, 60);
igual("materia pendiente recortada sin espacio final", () => materia("a".repeat(59) + " b", "materia"), "a".repeat(59));
igual("«clase de Redes .» → Redes (sin espacio final)", () => materia("clase de Redes ."), "Redes");

// ── Cancelar ──
igual("«salir» cancela", () => cancelar("salir"), true);
igual("«salir.» cancela", () => cancelar("salir."), true);
igual("«salir!!» cancela", () => cancelar("salir!!"), true);
igual("«¡¡salir» cancela", () => cancelar("¡¡salir"), true);
igual("«quiero empezar de nuevo» cancela", () => cancelar("quiero empezar de nuevo"), true);

// ── Duración con espacios dobles ──
igual("«hora  y  media» → 90", () => ex("hora  y  media").duracion_min, 90);
igual("«media  hora» → 30", () => ex("media  hora").duracion_min, 30);
igual("«una  hora» → 60", () => ex("una  hora").duracion_min, 60);

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
