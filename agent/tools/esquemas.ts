import { z } from 'zod';
// Valor 'desconocido' explicito: no asumimos mundo cerrado.
const TriBool = z.enum(["verdadero", "falso", "desconocido"]);
//Hechos que el MOTOR necesita.
export const Hechos = z.object({
    rol: z.enum(["estudiante", "docente", "monitor", "externo", "desconocido"]),
    carne_vigente: TriBool,
    induccion_seguridad: z.enum(["vigente", "vencida", "desconocida"]),
    reserva_valida: TriBool,
    reserva_creada_por_rol_autorizado: TriBool,
    aprobacion_coordinacion: z.enum(["escrita", "verbal", "ninguna"]),
    aforo_actual: z.number().int().min(0).nullable(),
    capacidad: z.number().int().min(0).nullable(),
    // Dos fuentes para detectar CONTRADICCIONES (R3 Y R13)
    equipo_estado_inventario: z.enum(["disponible", "mantenimiento", "diagnostico", "desconocido"]),
    equipo_estado_mantenimiento: z.enum(["disponible", "mantenimiento", "diagnostico", "desconocido"]),
    necesidad_accesibilidad: z.boolean(),
    hora_llegada: z.string().regex(/^\d{2}:\d{2}$/), // Formato HH:mm
});

// Entrada de la Herramienta evaluar_ingreso (sección 11.2).
export const EntradaEvaluar = z.object({
    id_sintetico: z.string().min(1),
    laboratorio: z.enum(["sala-1", "sala-2", "sala-3"]),//Nombres reales de las salas - validar
    franja: z.string().regex(/^\d{2}:\d{2}–\d{2}:\d{2}$/), // Ej. "09:00-11:00"
    tipo_evento: z.enum(["ingreso", "salida"])
});
//Salida estructurada de la Herramienta
export const Decision = z.object({
    decision: z.enum(["permitir", "negar", "escalar"]),
    reglas_aplicadas: z.array(z.string()),
    equipo_sugerido: z.string().nullable(),
    estado_asistencia: z.enum(["presente", "tardia", "sin_registro", "no_aplica"]),
    hechos_desconocidos: z.array(z.string()),
    contradicciones: z.array(z.string()),
    version_reglas: z.string(),
    traza: z.array(z.string())
});

export type Hechos = z.infer<typeof Hechos>;
export type EntradaEvaluar = z.infer<typeof EntradaEvaluar>;
export type Decision = z.infer<typeof Decision>;