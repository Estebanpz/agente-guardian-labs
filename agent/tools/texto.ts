// Única normalización de texto para reconocer frases (hallazgo 7 de la auditoría del 16-11-2026). Antes había 8
// copias con dos variantes: unas quitaban solo las marcas combinadas U+0300–U+036F (escritas como caracteres
// literales, frágiles) y otras \p{Diacritic}. Esta quita ambas, así ningún módulo pierde lo que ya quitaba:
// tildes y diéresis («qué» → «que», «pingüino» → «pinguino») y acentos sueltos tecleados aparte («qu´e» → «que»).
// La ñ se vuelve n (NFD la separa en n + tilde). No la copies en otro módulo: impórtala.
export const norm = (t: string): string =>
  t.normalize("NFD").replace(/[\u0300-\u036f]|\p{Diacritic}/gu, "").toLowerCase();
