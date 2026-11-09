// Identidad y saludo (plan de identidad, sección 4). Los textos son plantillas fijas: el saludo lo arma el código,
// no el modelo, para que las pruebas sean deterministas.
import type { CarneDoc } from "./tools/esquemas-reservas.js";

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const PEDIR_CARNE = "¡Hola! Para atenderte, escríbeme tu carné (C- o D- seguido de 8 dígitos).";
// Cierre tras una reserva (programada o escalada): despedida, sesión finalizada y carné olvidado.
export const OLVIDO = "Ya tu reserva quedó. Hasta pronto, sesión finalizada. Por tu seguridad olvidé tu carné; si necesitas otra solicitud, escríbeme de nuevo tu carné.";
export const CHIPS_SALUDO = ["Reservar una sala", "Ver disponibilidad", "Salas ocupadas por fecha", "Ayuda"];

// Hora de Bogotá en minutos del día: 05–11 mañana, 12–17 tarde, 18–04 noche.
export function momentoDelDia(minutos: number): "Buenos días" | "Buenas tardes" | "Buenas noches" {
  if (minutos >= 5 * 60 && minutos < 12 * 60) return "Buenos días";
  if (minutos >= 12 * 60 && minutos < 18 * 60) return "Buenas tardes";
  return "Buenas noches";
}

// Saludo con los datos de carnetización. Estudiante: programa y jornada. Docente: sin tratamiento de género.
export function saludoPara(doc: CarneDoc, minutos: number): string {
  const saludo = momentoDelDia(minutos);
  if (doc.rol === "estudiante") {
    const jornada = doc.jornada === "Mañana" ? "mañana" : "noche";
    return `¡${saludo}, ${doc.nombres} ${doc.apellidos}! Qué gusto saludarte. Te veo en ${doc.programa}, jornada de la ${jornada}. ¿En qué puedo ayudarte?`;
  }
  return `¡${saludo}, ${doc.nombres} ${doc.apellidos}! Bienvenido(a) a Guardian Labs. ¿En qué puedo ayudarte hoy?`;
}

// "salir" o "cerrar sesión" borran la sesión identificada. Solo si el mensaje completo es una de esas frases
// (sin mayúsculas, tildes ni puntuación final): "hasta salir de clase" no cierra nada.
export const esSalida = (texto: string): boolean =>
  ["salir", "cerrar sesion"].includes(norm(texto).replace(/^[¡¿\s]+|[.!?¡¿,;:\s]+$/g, "").replace(/\s+/g, " "));

// Un saludo suelto no es una petición: no se guarda como texto pendiente.
export const esSaludo = (texto: string): boolean =>
  /^(hola|buenas|buenos dias|buenas tardes|buenas noches|buen dia)\s*[!.¡]*$/.test(norm(texto).trim());

// Espacio académico de un docente elegido por número o por nombre (plan, sección 4.5). null si no coincide.
export function elegirEspacio(texto: string, espacios: string[]): string | null {
  const t = norm(texto).trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= espacios.length ? espacios[n - 1] : null;
  }
  const exacto = espacios.find((e) => norm(e) === t);
  if (exacto) return exacto;
  return t.length >= 4 ? espacios.find((e) => norm(e).includes(t)) ?? null : null;
}
