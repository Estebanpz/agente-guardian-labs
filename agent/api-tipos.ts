// Contrato de la API HTTP (hallazgo 10 de la auditoría del 16-11-2026). Lo comparten el servidor
// (agent/channels/http.ts y quienes arman las respuestas) y la interfaz (web/src, con `import type`).
// Solo tipos: este archivo no tiene código que se ejecute y solo importa tipos de módulos sin dependencias de Node,
// así la interfaz no arrastra código del servidor. Si cambias una respuesta, cambia este archivo: el typecheck de
// los dos lados (`npm run typecheck`) lo detecta.
import type { Decision, EntradaEvaluar, Hechos } from "./tools/esquemas.js";
import type { DecisionReserva, EquipoDoc, NotificacionDoc, ReservaDoc, Rol, SalaDoc } from "./tools/esquemas-reservas.js";
import type { ClaseEquipo } from "./tools/estados.js";
import type { Solicitante } from "./tools/monitor.js";

export type { ClaseEquipo, Decision, EntradaEvaluar, Rol, Solicitante };

// Lo que llega al navegador: JSON.stringify convierte las fechas (Date) en texto ISO.
export type Json<T> = T extends Date ? string
  : T extends (infer U)[] ? Json<U>[]
    : T extends object ? { [K in keyof T]: Json<T[K]> }
      : T;

// ── Sesión ────────────────────────────────────────────────────────────────
// Datos públicos de quien inició sesión. El carné va enmascarado (C-****0001).
export type UsuarioSesion = {
  nombres: string; apellidos: string; rol: Rol; correo: string;
  carne: string | null; programa: string | null;
};
export type RespuestaLogin = { token: string; usuario: UsuarioSesion; registrado: boolean };
export type RespuestaYo = { correo: string; rol: Rol; exp: number };
export type TipoBase = "local" | "atlas" | "remota" | "memoria";
export type RespuestaSalud = { ok: true; proveedor: string; repositorio: "mongo" | "memoria"; base: TipoBase };

// ── Chat (/mensaje) ───────────────────────────────────────────────────────
export type FlujoChat = { tipo: string; pendiente: string | null; opciones: string[] };
// Un choque con otra reserva, sin código, carné ni materia (los datos de otras personas no salen del servidor).
export type ConflictoPublico = { inicio: string; fin: string; tipo: ReservaDoc["tipo"]; personas: number };
export type ReservaPublica = Omit<DecisionReserva, "conflictos"> & { conflictos: ConflictoPublico[] };
// Resumen de la solicitud para la tarjeta de la reserva (carné enmascarado).
export type ResumenSolicitud = {
  sala: string | null; sala_nombre: string | null;
  fecha: string | null; inicio: string | null; fin: string | null;
  personas: number | null; equipos: number | null; computo_alto: boolean; materia: string | null;
  docente: boolean; carne_enmascarado: string | null;
};
export type OcupadaPublica = { inicio: string; fin: string; tipo: string; personas: number };
export type DisponibilidadSala = {
  sala: string; fecha: string; ocupadas: OcupadaPublica[]; libres: { inicio: string; fin: string }[];
  operativos: number; inciertos: number;
};
export type IdentidadChat = { nombres: string; apellidos: string; rol: string; programa: string | null; carne: string };

// Respuesta del flujo de conversación (agent/conversacion.ts).
export type RespuestaChat = {
  intencion: string; respuesta: string;
  flujo: FlujoChat | null;
  reserva?: ReservaPublica; solicitud?: ResumenSolicitud; disponibilidad?: DisponibilidadSala; alerta?: string;
  // La sesión se cerró tras una reserva: la pantalla quita el saludo con el nombre.
  sesion_olvidada?: boolean;
  // Aviso de cierre (despedida y carné olvidado), que se muestra fuera de la tarjeta de la reserva.
  cierre?: string;
  // Identidad tras validar el carné (saludo de la pantalla). Sin el carné completo.
  identidad?: IdentidadChat;
};

// Resultado de la evaluación de ingreso (POST /evaluar y el ingreso por texto libre).
export type ResultadoEvaluar = { decision: Decision | null; explicacion: string; alerta?: string };

// Todo lo que puede responder POST /mensaje: una respuesta del flujo, una informativa o una evaluación de ingreso.
export type RespuestaMensaje = {
  intencion?: string; respuesta?: string; flujo?: FlujoChat | null;
  reserva?: ReservaPublica; solicitud?: ResumenSolicitud; disponibilidad?: DisponibilidadSala;
  alerta?: string; sesion_olvidada?: boolean; cierre?: string; identidad?: IdentidadChat;
  temas?: string[]; aclaracion?: boolean; decision?: Decision | null; explicacion?: string;
};

// ── Vista Laboratorios (ingreso, sala-1 a sala-3) ─────────────────────────
export type DescripcionCaso = {
  titulo: string; detalle: string; prueba: string; esperado: string; evento?: "ingreso" | "cierre";
};
export type CasoDemo = DescripcionCaso & { id: string; hechos: Hechos };
export type EquipoLaboratorio = {
  id: string; accesible: boolean; estado: string; inventario: EquipoDoc["inventario"]; mantenimiento: EquipoDoc["mantenimiento"];
};
export type SalaLaboratorio = {
  id: "sala-1" | "sala-2" | "sala-3"; nombre: string; capacidad: number; aforo_actual: number; franja: string | null;
  ocupacion: number; lleno: boolean; disponibles: number; equipos: EquipoLaboratorio[];
};

// ── Vista Salas del monitor ───────────────────────────────────────────────
export type EquipoDelDia = Pick<EquipoDoc, "_id" | "inventario" | "mantenimiento" | "accesible"> & { clase: ClaseEquipo };
export type ReservaDelDia = Pick<ReservaDoc,
  "codigo" | "inicio" | "fin" | "inicio_min" | "fin_min" | "tipo" | "rol" | "estado" | "personas" | "materia" | "reglas_aplicadas"
> & {
  jornada: "Mañana" | "Noche" | null;
  carne: string;                    // enmascarado
  solicitante: string | null;       // nombre completo, o null si no hay carnetización
  perfil: Solicitante | null;
};
export type SalaDelDia = {
  id: string; nombre: string; capacidad: number; computo: SalaDoc["computo"];
  operativos: number; inciertos: number; en_revision: number;
  equipos: EquipoDelDia[]; reservas: ReservaDelDia[];
};
// Días del mes con reservas (calendario del monitor).
export type DiaConReservas = { fecha: string; programadas: number; escaladas: number };
// Aviso para el monitor o coordinación, con el carné enmascarado y el nombre del solicitante.
export type Aviso = Omit<NotificacionDoc, "carne"> & { carne: string | null; solicitante: string | null };
// Reserva de GET /reservas y GET /reservas/:codigo (carné enmascarado).
export type ReservaMonitor = ReservaDoc & { solicitante?: Solicitante | null };
