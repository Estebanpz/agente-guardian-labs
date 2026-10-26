import { evaluar } from "../agent/tools/motor.js";
import type { Hechos } from "../agent/tools/esquemas.js";

const normal: Hechos = {
  rol: "estudiante", carne_vigente: "verdadero", induccion_seguridad: "vigente",
  reserva_valida: "verdadero", reserva_creada_por_rol_autorizado: "verdadero",
  aprobacion_coordinacion: "escrita", aforo_actual: 10, capacidad: 30,
  equipo_estado_inventario: "disponible", equipo_estado_mantenimiento: "disponible",
  necesidad_accesibilidad: false, hora_llegada: "08:05",
};

const entrada = { id_sintetico: "E-001", laboratorio: "sala-1" as const,
  franja: "08:00–10:00", tipo_evento: "ingreso" as const };

console.log("--- CASO NORMAL");
console.log(evaluar(normal, entrada));

console.log("--- CASO R2 + R3 (P-09)");
console.log(evaluar({
  ...normal,
  induccion_seguridad: "desconocida",
  equipo_estado_inventario: "disponible",
  equipo_estado_mantenimiento: "diagnostico",
}, entrada));
