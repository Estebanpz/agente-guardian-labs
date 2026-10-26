// Filtro determinista previo al modelo: primera capa contra intentos de manipulación.
const norm = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const PATRONES: RegExp[] = [
  /\b(ignora|ignore|ignorar|olvida|olvidar|omite|omitir|salta|saltate)\b.{0,40}\b(reglas?|instrucciones|restricciones|politicas?|rules|instructions)\b/,
  /\b(system prompt|tu prompt|su prompt|prompt del sistema|instrucciones internas)\b/,
  /\b(modo|mode)\s+(desarrollador|developer|admin|administrador|dios|god)\b/,
  /\b(desactiva|desactivar|deshabilita|quita|quitar|apaga)\w*\b.{0,40}\b(reglas?|restricciones|filtros|validaciones)\b/,
  /\b(autorizo|autorizado|autorizada|autorizacion|autoriza|aprobo|aprobado)\b.{0,30}\b(de palabra|verbalmente|verbal)\b/,
  /\b(de palabra|verbalmente)\b.{0,30}\b(autoriz|aprob|permit)/,
  /\b(disregard|forget)\b.{0,30}\b(previous|prior|above|all|your)\b.{0,30}\b(instructions|rules)\b/,
];

export const esIntentoDeElusion = (texto: string): boolean => {
  const t = norm(texto);
  return PATRONES.some((p) => p.test(t));
};
