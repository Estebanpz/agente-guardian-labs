// Pruebas que matan mutantes de agent/tools/privacidad.ts (Stryker, 14-11-2026). Los patrones se cubren entre sí
// (un teléfono lo detectan dos expresiones), así que aquí cada patrón se prueba por separado, en sus límites:
// cuantificadores, cada rama de las alternativas, mayúsculas, lookbehind/lookahead y cada dígito en letras.
import { datosProhibidos, enmascararCarnes, internos } from "../../agent/tools/privacidad.js";

const { PATRONES, sinFechas, compacto, CARNE } = internos;
let fallos = 0;
const ver = (nombre: string, obtenido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${ok ? "" : ` · obtenido ${JSON.stringify(obtenido)}, esperado ${JSON.stringify(esperado)}`}`);
};
// Un patrón por índice de PATRONES, sobre el texto tal cual (sin compactar).
const p = (i: number, t: string) => { PATRONES[i][1].lastIndex = 0; return PATRONES[i][1].test(t); };
const casos = (i: number, nombre: string, lista: [string, boolean][]) => {
  for (const [t, esperado] of lista) ver(`${nombre}: ${JSON.stringify(t)} → ${esperado}`, p(i, t), esperado);
};

ver("orden y tipos de los patrones", PATRONES.map(([t]) => t), ["correo", "telefono", "telefono", "documento", "documento", "documento"]);

casos(0, "correo", [
  ["juan.perez@gmail.com", true], ["a@b.co", true], ["!@a.aa", true], ["a@a.a.aa", true], ["a @ b . co", true],
  ["JUAN ARROBA GMAIL PUNTO COM", true], ["juan arroba gmail punto com", true], ["juan[at]gmail[dot]com", true],
  ["juan [ at ] gmail [ dot ] com", true], ["juan(at)gmail(dot)com", true], ["juan ( at ) gmail ( dot ) com", true],
  ["juan@mail.sub.dominio.co", true], ["juan@mail[dot]sub(dot)co", true], ["juan@mi-dominio.co", true],
  ["a@b.c", false], ["juan@gmail", false], ["@gmail.com", false], ["juan gmail.com", false], ["juanarrobagmail.com", false],
  ["juan@gmail.c0m", false], ["juan@ .com", false],
  [`${"x".repeat(64)}@b.co`, true],
]);
casos(1, "teléfono 10 dígitos", [
  ["3001234567", true], ["573001234567", true], ["+573001234567", true], ["llama al 3001234567.", true],
  ["30012345678", false], ["13001234567", false], ["300123456", false], ["2001234567", false], ["+57300123456", false],
]);
casos(2, "teléfono por grupos", [
  ["328 480 62 14", true], ["(312) 456-78-90", true], ["312.456.7890", true], ["312 456 7890", true],
  ["+57 312 456 7890", true], ["+57-312-456-7890", true], ["57 3124567890", true], ["+57 (312) 4567890", true],
  ["30 10 10 10 10", false], ["312 456 789", false], ["312 456 78901", false], ["312 456 7890 1", false],
  ["1312 456 7890", false], ["412 456 7890", false],
]);
casos(3, "documento 6–12 dígitos", [
  ["123456", true], ["123456789012", true], ["mi número 1070612345 es", true],
  ["12345", false], ["1234567890123", false], ["-1234567", false], ["1234567-", false], ["RS-0001", false],
]);
casos(4, "documento con palabra clave", [
  ["cédula 1", true], ["cedula 1", true], ["CÉDULA: 9", true], ["documento 1", true], ["tarjeta de identidad 1", true],
  ["c.c. 1", true], ["cc 1", true], ["c c 1", true], ["c.c 1", true], ["t.i. 1", true], ["ti 1", true], ["t i 1", true],
  ["cédula es 1", true], ["cédula número 1", true], ["cédula numero 1", true], ["cédula no. 1", true], ["cédula no 1", true],
  ["cédula # 1", true], ["cédula: 1", true], ["cédula es: 1", true], ["cédula#1", true],
  ["cédula de 1", false], ["cédulas", false], ["acc 1", false], ["documentos", false], ["cédula vencida", false],
]);
casos(5, "documento con texto intermedio", [
  ["la cédula de mi mamá es 0 0 0 0 0 0", true], ["documento: 1.2.3.4.5.6", true], ["tarjeta de identidad x 1-2-3-4-5-6", true],
  [`cédula ${"x".repeat(29)}123456`, true], [`cédula ${"x".repeat(30)}123456`, false],
  ["cédula de mi mamá 1 2 3 4 5", false], ["cédula 1234567890123", false], ["cedulas 123456", false], ["DOCUMENTO 123456", true],
  ["cédula 12  34  56", true], ["cédula 123456789012", true],
]);

// Dígitos en letras: cada palabra y su dígito, con cualquier separador; una palabra sola no se convierte.
ver("compacto: las diez palabras en orden", compacto("cero uno dos tres cuatro cinco seis siete ocho nueve"), "0123456789");
ver("compacto: separadores coma, punto y guion", compacto("uno,dos.tres-cuatro"), "1234");
ver("compacto: mayúsculas", compacto("UNO DOS"), "12");
ver("compacto: una palabra sola no cambia", compacto("dos salas"), "dos salas");
ver("compacto: palabras dentro de otras no cuentan", compacto("unos doses"), "unos doses");
// Fechas y códigos fuera; grupos de 3 o más dígitos se unen.
ver("sinFechas: ISO completa", sinFechas("el 2026-11-20 a"), "el   a");
ver("sinFechas: ISO pegada a más dígitos no se borra", sinFechas("1-2026-11-20"), "1-2026-11-20");
ver("sinFechas: ISO seguida de dígitos no se borra", sinFechas("2026-11-20-5"), "2026-11-20-5");
ver("sinFechas: dd/mm/aaaa, dd.mm.aa y dd-mm-aaaa", sinFechas("20/11/2026 y 1.2.26 y 20-11-2026"), "  y   y  ");
ver("sinFechas: un trozo de número no es fecha", sinFechas("20-01-32-62"), "20-01-32-62");
ver("sinFechas: precedida por dígito y punto no se borra", sinFechas("5.20-01-32"), "5.20-01-32");
ver("sinFechas: códigos RS en mayúsculas y minúsculas", sinFechas("RS-0001 rs12345 RS1"), "     ");
ver("sinFechas: RS pegado a letras no se borra", sinFechas("XRS-0001"), "XRS-0001");
ver("sinFechas: quita paréntesis", sinFechas("(312) 4"), "312 4");
ver("compacto: une grupos de 3 o más", compacto("1 234.567-890"), "1234567890");
ver("compacto: varios separadores seguidos", compacto("1 . 234"), "1234");
ver("compacto: no une grupos de 2", compacto("12 34"), "12 34");
ver("compacto: el primer grupo puede ser corto", compacto("1 234"), "1234");
// Carnés: se quitan con o sin guion y en minúsculas; no si están pegados a más dígitos o letras.
const quitar = (t: string) => t.replace(CARNE, "_");
ver("CARNE: C- y D- con y sin guion, minúsculas", quitar("C-10000001 d20000002 c-10000003"), "_ _ _");
ver("CARNE: con 9 dígitos no es carné", quitar("C-100000011"), "C-100000011");
ver("CARNE: pegado a letras no se quita", quitar("xC-10000001"), "xC-10000001");
ver("CARNE: otra letra no es carné", quitar("E-10000001"), "E-10000001");
// datosProhibidos: sin repetir tipos y en el orden de los patrones.
ver("tipos sin repetir (dos patrones de teléfono)", datosProhibidos("llámame al 3001234567"), ["telefono", "documento"]);
ver("correo, teléfono y documento juntos", datosProhibidos("a@b.co o 312 456 78 90"), ["correo", "telefono", "documento"]);
ver("el carné no es documento", datosProhibidos("soy C-10000001"), []);
ver("texto limpio", datosProhibidos("quiero la sala 3 mañana de 2 a 4"), []);
ver("documento solo en la versión compacta", datosProhibidos("mi número 1 070 612"), ["documento"]);
ver("documento en letras", datosProhibidos("uno dos tres cuatro cinco seis"), ["documento"]);
// Enmascarar: conserva la letra, quita el guion opcional y deja los 4 últimos.
ver("enmascarar C- y D-", enmascararCarnes("C-10000002 y D-20000001"), "C-****0002 y D-****0001");
ver("enmascarar sin guion y en minúscula", enmascararCarnes("c10000002"), "c-****0002");
ver("enmascarar pegado a letras", enmascararCarnes("soyC-10000002"), "soyC-****0002");
ver("no enmascara con un dígito antes", enmascararCarnes("1C-10000002"), "1C-10000002");
ver("no enmascara 9 dígitos", enmascararCarnes("C-100000021"), "C-100000021");
ver("no enmascara otras letras", enmascararCarnes("E-10000002"), "E-10000002");

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
