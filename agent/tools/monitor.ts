// Datos de quien reserva, para la vista Salas del monitor (plan de la vista, sección 3).
// Nombre y datos de carnetización, sin el _id del carné: el carné completo nunca sale de la API.
import type { CarneDoc } from "./esquemas-reservas.js";

export type Solicitante = {
  nombres: string; apellidos: string; rol: "estudiante" | "docente"; facultad: string;
  programa?: string; jornada?: "Mañana" | "Noche"; espacios?: string[];
};

export function solicitanteDe(c: CarneDoc): Solicitante {
  const base = { nombres: c.nombres, apellidos: c.apellidos, rol: c.rol, facultad: c.facultad };
  return c.rol === "estudiante"
    ? { ...base, programa: c.programa, jornada: c.jornada }
    : { ...base, espacios: c.espacios };
}

export const nombreDe = (c: CarneDoc | null | undefined): string | null =>
  c ? `${c.nombres} ${c.apellidos}` : null;
