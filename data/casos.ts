import type { Hechos } from "../agent/tools/esquemas.js";

// Caso base: todo correcto (P-01). Los demás cambian solo lo necesario.
const base: Hechos = {
  rol: "estudiante", carne_vigente: "verdadero", induccion_seguridad: "vigente",
  reserva_valida: "verdadero", reserva_creada_por_rol_autorizado: "verdadero",
  aprobacion_coordinacion: "escrita", aforo_actual: 10, capacidad: 25,
  equipo_estado_inventario: "disponible", equipo_estado_mantenimiento: "disponible",
  necesidad_accesibilidad: false, hora_llegada: "08:05", equipo_id: "PC-01", entrada_registrada: true,
};

export const casos: Record<string, Hechos> = {
  "E-001": base,                                                    // P-01 normal
  "E-002": { ...base, induccion_seguridad: "vencida" },             // P-02 R1
  "E-003": { ...base, aforo_actual: 24 },                           // P-03 último cupo
  "E-004": { ...base, aforo_actual: 25 },                           // P-03 aforo lleno, R7
  "E-005": { ...base, induccion_seguridad: "desconocida" },         // P-04 R2
  "E-006": { ...base, induccion_seguridad: "desconocida",           // P-09 R13
            equipo_estado_mantenimiento: "diagnostico", equipo_id: "PC-07" },
  "E-007": { ...base, carne_vigente: "falso" },                     // P-10 R4
  "E-008": { ...base, equipo_estado_mantenimiento: "diagnostico", equipo_id: "PC-07" }, // P-05 R3
  "E-009": { ...base, aprobacion_coordinacion: "verbal" },          // P-07 R6
  "E-010": { ...base, hora_llegada: "08:12" },                      // P-08 llegada a 12 min
  "E-011": { ...base, entrada_registrada: false }, // R12: cierre sin registro
};
