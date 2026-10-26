// Datos que no deben entrar al agente: el prototipo trabaja solo con ids sintéticos (E-001...).
const PATRONES: [string, RegExp][] = [
  ["correo", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["telefono", /(\+?57[\s-]?)?\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/],
  ["documento", /\b\d{6,10}\b/],
  ["documento", /\b(c[eé]dula|tarjeta de identidad|\bc\.?c\.?\b)\s*[:#]?\s*\d+/i],
];

export function datosProhibidos(texto: string): string[] {
  const tipos = PATRONES.filter(([, p]) => p.test(texto)).map(([t]) => t);
  return [...new Set(tipos)];
}
