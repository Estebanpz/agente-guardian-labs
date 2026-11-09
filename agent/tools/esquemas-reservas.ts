import { z } from "zod";

// Esquemas del flujo de reservas (Fase 1). Todos los datos son sintéticos.

export const SalaId = z.string().regex(/^sala-(1[0-6]|[1-9])$/);          // sala-1 … sala-16
export const Carne = z.string().regex(/^[CD]-\d{8}$/);                     // C-10000001
export const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);              // 2026-11-10
export const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);         // 13:00

export const SalaDoc = z.object({
  _id: SalaId, nombre: z.string(), capacidad: z.number().int().positive(),
  computo: z.enum(["estandar", "alto"]), activa: z.boolean(),
  fuente: z.literal("sintetico"),
});
export type SalaDoc = z.infer<typeof SalaDoc>;

export const EquipoDoc = z.object({
  _id: z.string(), sala: SalaId,
  inventario: z.enum(["disponible", "mantenimiento", "diagnostico", "desconocido"]),
  mantenimiento: z.enum(["disponible", "mantenimiento", "diagnostico", "desconocido"]),
  accesible: z.boolean(),
});
export type EquipoDoc = z.infer<typeof EquipoDoc>;

// Carnetización simulada (fuente institucional, solo lectura). Unión por rol (plan de identidad, sección 2).
// programa y facultad: la facultad va con su nombre completo (existe en data/programas.ts).
const Vigencia = z.enum(["vigente", "vencido", "desconocida"]);
const CarneEstudiante = z.object({
  _id: Carne, rol: z.literal("estudiante"), vigencia: Vigencia,
  nombres: z.string(), apellidos: z.string(),
  programa: z.string(), facultad: z.string(),
  jornada: z.enum(["Mañana", "Noche"]),
});
const CarneDocente = z.object({
  _id: Carne, rol: z.literal("docente"), vigencia: Vigencia,
  nombres: z.string(), apellidos: z.string(), facultad: z.string(),
  espacios: z.array(z.string()).min(1).max(6),
});
export const CarneDoc = z.discriminatedUnion("rol", [CarneEstudiante, CarneDocente]);
export type CarneDoc = z.infer<typeof CarneDoc>;

export const UsuarioDoc = z.object({ _id: Carne, rol: z.enum(["estudiante", "docente"]), registrado: z.date() });
export type UsuarioDoc = z.infer<typeof UsuarioDoc>;

export const SolicitudReserva = z.object({     // lo que el chat junta paso a paso
  carne: Carne.nullable(), fecha: Fecha.nullable(),
  inicio: Hora.nullable(), fin: Hora.nullable(),
  sala: SalaId.nullable(),                     // null = el motor elige
  personas: z.number().int().min(1).max(200).nullable(),
  equipos: z.number().int().min(0).max(200).nullable(),
  computo_alto: z.boolean().nullable(),
  materia: z.string().min(2).max(60).nullable(),
});
export type SolicitudReserva = z.infer<typeof SolicitudReserva>;

export const ReservaDoc = z.object({
  codigo: z.string().regex(/^RS-\d{4}$/),       // RS-0001
  sala: SalaId, fecha: Fecha, inicio: Hora, fin: Hora,
  inicio_min: z.number().int(), fin_min: z.number().int(),
  tipo: z.enum(["estudiantes", "clase"]),
  carne: Carne, rol: z.enum(["estudiante", "docente"]),
  personas: z.number().int(), equipos: z.number().int(), computo_alto: z.boolean(),
  materia: z.string().nullable(),
  estado: z.enum(["programada", "escalada"]),
  reglas_aplicadas: z.array(z.string()), traza: z.array(z.string()),
  version_reglas: z.string(), creada: z.date(), origen: z.enum(["chat", "semilla"]),
  jornada: z.enum(["Mañana", "Noche"]).nullable().optional(), // solo estudiantes (plan de identidad, sección 2)
});
export type ReservaDoc = z.infer<typeof ReservaDoc>;

export const Conflicto = z.object({
  codigo: z.string(), tipo: z.enum(["estudiantes", "clase"]), personas: z.number().int(),
  inicio: Hora, fin: Hora, carne_enmascarado: z.string(), materia: z.string().nullable(),
});
export type Conflicto = z.infer<typeof Conflicto>;

// Contrato de salida (sigue el contrato orientador de la guía, sección 7).
export const DecisionReserva = z.object({
  decision: z.enum(["programar", "negar", "escalar", "pedir_datos", "registrar"]),
  estado: z.enum(["confirmado", "falso", "desconocido", "contradictorio"]),
  accion: z.enum(["programar_reserva", "pedir_datos", "revision_humana", "orientar_proceso", "registrar_usuario"]),
  reglas_aplicadas: z.array(z.string()),
  sala_asignada: SalaId.nullable(),
  alternativas: z.array(SalaId).max(3),
  conflictos: z.array(Conflicto),
  faltantes: z.array(z.string()),
  notificar: z.array(z.enum(["monitor", "coordinacion", "mantenimiento"])),
  fuentes: z.array(z.string()),
  version_reglas: z.string(),
  traza: z.array(z.string()),
});
export type DecisionReserva = z.infer<typeof DecisionReserva>;

export const NotificacionDoc = z.object({
  _id: z.string().optional(),                 // id del aviso (texto), lo asigna el repositorio
  para: z.enum(["monitor", "coordinacion", "mantenimiento"]),
  motivo: z.string(), regla: z.string(), reserva_codigo: z.string().nullable(),
  carne: z.string().nullish(),                // solo para mostrar a quién se refiere: la API lo enmascara
  sala: z.string().nullish(),                 // "sala-N" del aviso, si lo hay
  fecha: z.string().nullish(),                // aaaa-mm-dd del aviso, si lo hay
  horario: z.string().nullish(),              // "HH:MM–HH:MM" del aviso, si lo hay
  estado: z.enum(["pendiente", "atendida"]), creada: z.date(),
  atendida_en: z.date().nullish(),
});
export type NotificacionDoc = z.infer<typeof NotificacionDoc>;

// Sesión identificada por carné (plan de identidad, sección 4.1). carne es null mientras solo hay un texto pendiente.
export const SesionDoc = z.object({
  _id: z.uuid(),
  carne: Carne.nullable(),
  actualizado: z.date(),
  pendiente_texto: z.string().nullable(),
});
export type SesionDoc = z.infer<typeof SesionDoc>;

export const Conversacion = z.object({
  _id: z.uuid(),                                // id de sesión del navegador
  flujo: z.enum(["reserva", "registro", "disponibilidad"]),
  pendiente: z.string().nullable(),             // campo que se está preguntando
  datos: SolicitudReserva,
  intentos: z.number().int().min(0),            // respuestas no entendidas seguidas
  propuesta: z.object({ sala: SalaId }).nullable(), // sala lista para confirmar
  validado: z.string().nullish(),               // última combinación fecha|horario|sala revisada (7.0.6)
  respaldo: z.array(z.string()).nullish(),      // campos que vinieron del modelo y esperan confirmación (7.0.8)
  ofrecer: z.boolean().nullish(),               // "Ver otras salas" sin personas: ofrecer salas al saberlas (7.0.9)
  actualizado: z.date(),
});
export type Conversacion = z.infer<typeof Conversacion>;
