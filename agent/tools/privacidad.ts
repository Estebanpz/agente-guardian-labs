// Datos que no deben entrar al agente: el prototipo trabaja solo con ids sintéticos (E-001...).
// Se buscan sobre el texto original y sobre una versión "compacta" sin separadores entre dígitos
// (ADV-04: "1.032.456.789", "300 123 4567", "(300) 123-4567", "+573001234567").
const PATRONES: [string, RegExp][] = [
  ["correo", /[\w.+-]+\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\barroba\b)\s*[\w-]+\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\bpunto\b)\s*[a-z]{2,}/i],
  ["telefono", /(?:\+?57)?3\d{9}(?!\d)/],
  ["documento", /(?<![\d-])\d{6,12}(?![\d-])/],
  ["documento", /\b(?:c[eé]dula|documento|tarjeta de identidad|c\.?\s?c\.?|t\.?\s?i\.?)\s*(?:n[uú]mero|no\.?|#|:)?\s*\d/i],
];

// Quita separadores entre dígitos y paréntesis; las fechas AAAA-MM-DD y los códigos RS-0000 se borran antes
// para no confundirlos con un documento.
const DIGITOS: Record<string, string> = { cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9" };
// También se leen los dígitos escritos en letras ("uno dos tres cuatro cinco seis…").
const compacto = (t: string): string => t
  .replace(/\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi, (p) => DIGITOS[p.toLowerCase()])
  .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
  .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, " ")
  .replace(/\bRS-?\d{1,5}\b/gi, " ")
  .replace(/[()]/g, "")
  .replace(/(?<=\d)[\s.\-]+(?=\d)/g, "");

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
export const enmascararCarnes = (texto: string): string =>
  texto.replace(/\b([CD])-?\d{4}(\d{4})\b/gi, "$1-****$2");
