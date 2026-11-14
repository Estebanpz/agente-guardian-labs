// Datos que no deben entrar al agente: el prototipo trabaja solo con ids sintéticos (E-001...).
// Se buscan sobre el texto original y sobre una versión "compacta" sin separadores entre dígitos
// (ADV-04: "1.032.456.789", "300 123 4567", "(300) 123-4567", "+573001234567").
const PATRONES: [string, RegExp][] = [
  // Parte local con cualquier carácter visible ("!@a.aa"), hasta 64 como en el estándar (acota el retroceso de la
  // expresión regular), y dominio con varias etiquetas ("a@a.a.aa") (propiedades, 14-11-2026).
  ["correo", /[^\s@]{1,64}\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\barroba\b)\s*[\w-]+(?:\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\bpunto\b)\s*[\w-]+)*?\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\bpunto\b)\s*[a-z]{2,}/i],
  ["telefono", /(?<!\d)(?:\+?57)?3\d{9}(?!\d)/],
  // Celular con grupos de cualquier tamaño ("328 480 62 14", "(312) 456-78-90"): empieza por 3 y dos dígitos
  // pegados, y suma 10 dígitos. Una lista de números pequeños ("30 10 10 10 10") no tiene esa forma.
  ["telefono", /(?<!\d)(?:\+?\s*57[\s.-]*)?\(?3\d{2}\)?(?:[\s.-]*\d){7}(?![\s.-]*\d)/],
  ["documento", /(?<![\d-])\d{6,12}(?![\d-])/],
  // "mi cédula es 20-01-32-62": se admite "es", "número" o "no." entre la palabra y el número.
  ["documento", /\b(?:c[eé]dula|documento|tarjeta de identidad|c\.?\s?c\.?|t\.?\s?i\.?)\s*(?:(?:es|n[uú]mero|no\.?|#|:)\s*)*\d/i],
  // "la cédula de mi mamá es 0 0 0 0 0 0": la palabra clave, hasta 30 caracteres sin dígitos y 6 a 12 dígitos.
  ["documento", /\b(?:c[eé]dula|documento|tarjeta de identidad)\b[^\d]{0,30}\d(?:[\s.-]*\d){5,11}(?!\d)/i],
];

// Quita separadores entre dígitos y paréntesis; las fechas AAAA-MM-DD y los códigos RS-0000 se borran antes
// para no confundirlos con un documento.
const DIGITOS: Record<string, string> = { cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9" };
// También se leen los dígitos escritos en letras ("uno dos tres cuatro cinco seis…").
// Una secuencia de dígitos en letras se une ("uno dos tres" → "123"); una fecha solo se borra si es la fecha
// completa, no un trozo de un número más largo ("20-01-32-62" no es una fecha). Los grupos de dígitos se unen solo
// si los siguientes tienen 3 o más dígitos, como en cédulas y teléfonos ("10 10 10" no es un documento).
const PALABRA_DIGITO = "cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve";
const sinFechas = (t: string): string => t
  .replace(new RegExp(`\\b(?:${PALABRA_DIGITO})(?:[\\s,.-]+(?:${PALABRA_DIGITO}))+\\b`, "gi"),
    (p) => p.toLowerCase().split(/[\s,.-]+/).map((w) => DIGITOS[w]).join(""))
  .replace(/(?<!\d[-/.]?)\d{4}-\d{2}-\d{2}(?![-/.]?\d)/g, " ")
  .replace(/(?<!\d[-/.]?)\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?![-/.]?\d)/g, " ")
  .replace(/\bRS-?\d{1,5}\b/gi, " ")
  .replace(/[()]/g, "");
const compacto = (t: string): string => sinFechas(t).replace(/(?<=\d)[\s.\-]+(?=\d{3,})/g, "");

// Los carnés (C-10000001 / D-20000001) son sintéticos y permitidos: se quitan antes de buscar datos
// prohibidos, para que el patrón de documentos no los confunda con una cédula.
const CARNE = /\b[CD]-?\d{8}\b/gi;

export function datosProhibidos(texto: string): string[] {
  const sinCarnes = texto.replace(CARNE, " ");
  const junto = compacto(sinCarnes);
  const tipos = PATRONES.filter(([, p]) => p.test(sinCarnes) || p.test(junto)).map(([t]) => t);
  return [...new Set(tipos)];
}

// Enmascara los carnés de un texto antes de escribirlo en logs: C-10000002 → C-****0002.
// Sin \b al inicio: "soyC-10000002" también se enmascara (propiedades, 14-11-2026).
export const enmascararCarnes = (texto: string): string =>
  texto.replace(/(?<!\d)([CD])-?\d{4}(\d{4})(?!\d)/gi, "$1-****$2");
