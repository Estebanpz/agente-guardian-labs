// Datos que no deben entrar al agente: el prototipo trabaja solo con ids sintéticos (E-001...).
const PATRONES: [string, RegExp][] = [
  ["correo", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["telefono", /(\+?57[\s-]?)?\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/],
  ["documento", /\b\d{6,10}\b/],
  ["documento", /\b(c[eé]dula|tarjeta de identidad|\bc\.?c\.?\b)\s*[:#]?\s*\d+/i],
];

// Los carnés (C-10000001 / D-20000001) son sintéticos y permitidos: se quitan antes de buscar datos
// prohibidos, para que el patrón de documentos no los confunda con una cédula.
const CARNE = /\b[CD]-?\d{8}\b/gi;

export function datosProhibidos(texto: string): string[] {
  const sinCarnes = texto.replace(CARNE, " ");
  const tipos = PATRONES.filter(([, p]) => p.test(sinCarnes)).map(([t]) => t);
  return [...new Set(tipos)];
}

// Enmascara los carnés de un texto antes de escribirlo en logs: C-10000002 → C-****0002.
export const enmascararCarnes = (texto: string): string =>
  texto.replace(/\b([CD])-?\d{4}(\d{4})\b/gi, "$1-****$2");
