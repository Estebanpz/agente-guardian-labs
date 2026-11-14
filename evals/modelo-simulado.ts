import { rutaDeBoton, type Interpretacion, type TipoIntencion } from "../agent/llm/interprete.js";
import { horario, sala } from "../agent/tools/extraer.js";
import { rutaPorFecha } from "../agent/conversacion.js";

// Modelo SIMULADO para las pruebas deterministas del chat. Reemplaza a Ollama en evals/ para que las pruebas del
// flujo no dependan del modelo ni de su latencia. No es el agente: en la app TODO texto libre lo interpreta el
// modelo real (agent/llm/interprete.ts). La calidad del modelo real se mide aparte, con frases reales, en
// evals/prueba-intencion.ts (incluye «reservar un almuerzo» y otras reservas que no son de salas).
const norm = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const OTROS = /\b(?:reserv\w*|separ\w*|apart\w*|agend\w*|program\w*)\b(?:\s+\w+){0,2}?\s+((?:un|una|el|la|los|las|mi)\s+)?(almuerzo|comida|cena|desayuno|cancha(?: de \w+)?|auditorio|biblioteca|cita(?: medica)?|mesa|hotel|vuelo|bus|transporte|restaurante)\b/;

const base = (intencion: TipoIntencion, extra: Partial<Interpretacion> = {}): Interpretacion => ({
  intencion, id_sintetico: null, laboratorio: null, tipo_evento: null, recurso: null, recurso_texto: null, ...extra,
});

export async function modeloSimulado(texto: string): Promise<Interpretacion & { fallo?: string }> {
  const boton = rutaDeBoton(texto);
  if (boton) return base(boton, boton === "solicitud_reserva" ? { recurso: "sala" } : {});
  const t = norm(texto);
  const otro = t.match(OTROS);
  if (otro) return base("fuera_de_alcance", { recurso: "otro", recurso_texto: `${otro[1] ?? ""}${otro[2]}`.trim() });
  if (/\b(soy nuevo|primera vez|registrarme|registro)\b/.test(t)) return base("registro_usuario");
  if (/^(quiero|necesito)\s+(reservar|separar|apartar)$/.test(t.trim().replace(/[.!?]+$/, ""))) return base("solicitud_reserva");
  const reserva = /\b(reservar|separar|apartar|agendar|programar)\b/.test(t)
    || /\bnecesit\w*\b.{0,25}\bsalas?\b/.test(t)
    || /\b(quiero|necesito)\s+(la\s+|una\s+|un\s+)?(sala|laboratorio)s?\b/.test(t)
    || (sala(texto) !== null && horario(texto) !== null && !/[?¿]|\b(disponib\w*|libres?|ocupad\w*|hay|esta|estan)\b/.test(t));
  if (reserva) return base("solicitud_reserva", { recurso: "sala" });
  const fecha = rutaPorFecha(texto);
  if (fecha === "ocupacion") return base("consulta_salas", { recurso: "sala" });
  if (fecha === "disponibilidad") return base("consulta_disponibilidad", { recurso: "sala" });
  if (/\b(disponibilidad|disponibles?|libres?|agenda)\b/.test(t) && /\b(sala|salas|laboratorio)\b/.test(t)) {
    return base("consulta_disponibilidad", { recurso: "sala" });
  }
  if (/\bestado de (las )?salas\b/.test(t) || /\bsalas?\b.{0,30}\bcupo\b/.test(t)) return base("consulta_salas");
  return base("fuera_de_alcance");
}
