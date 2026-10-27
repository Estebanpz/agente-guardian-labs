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
  "E-012": { ...base, necesidad_accesibilidad: true }, // R8: necesita puesto accesible
};

// Descripción de cada caso para la demostración (vista Puerta) y para el informe (Tabla 24).
export type DescripcionCaso = {
  titulo: string;
  detalle: string;
  prueba: string;
  esperado: string;
  evento?: "ingreso" | "cierre";
};

export const descripciones: Record<string, DescripcionCaso> = {
  "E-001": {
    titulo: "Estudiante con todo en regla",
    detalle: "Carné vigente, inducción de seguridad vigente, reserva válida hecha por un rol autorizado, aprobación escrita, aforo 10/25, pide PC-01 y llega a las 08:05.",
    prueba: "P-01 · caso normal",
    esperado: "Permitir (R10), sugiere PC-01, asistencia presente (R11)",
  },
  "E-002": {
    titulo: "Estudiante con la inducción de seguridad vencida",
    detalle: "Todo lo demás está en regla; solo la inducción está vencida.",
    prueba: "P-02 · normal negativo",
    esperado: "Negar el uso de equipos y remitir a inducción (R1)",
  },
  "E-003": {
    titulo: "Estudiante que toma el último cupo",
    detalle: "La sala tiene 24 de 25 puestos ocupados; todo lo demás está en regla.",
    prueba: "P-03a · límite",
    esperado: "Permitir (R10): todavía hay un cupo",
  },
  "E-004": {
    titulo: "Estudiante con la sala llena",
    detalle: "La sala tiene 25 de 25 puestos ocupados.",
    prueba: "P-03b · límite",
    esperado: "Negar el ingreso y ofrecer lista de espera (R7)",
  },
  "E-005": {
    titulo: "Estudiante sin registro de inducción",
    detalle: "No se sabe si tiene la inducción de seguridad: el dato no está cargado. Un dato que falta no es un dato falso.",
    prueba: "P-04 · dato desconocido",
    esperado: "Escalar al monitor indicando qué dato falta (R2)",
  },
  "E-006": {
    titulo: "Sin registro de inducción y con un equipo en conflicto",
    detalle: "Falta el dato de la inducción y, además, pide PC-07, que está disponible según inventario y en diagnóstico según mantenimiento.",
    prueba: "P-09 · combinado",
    esperado: "Escalar sin concluir (R13); no sugiere PC-07 y notifica a mantenimiento",
  },
  "E-007": {
    titulo: "Estudiante con el carné vencido",
    detalle: "Todo lo demás está en regla; solo el carné no está vigente.",
    prueba: "P-10 · normal negativo",
    esperado: "Negar el ingreso y remitir a registro (R4)",
  },
  "E-008": {
    titulo: "Estudiante que pide un equipo en conflicto",
    detalle: "Pide PC-07: el inventario dice disponible y mantenimiento dice diagnóstico. La persona está en regla; el problema es el equipo.",
    prueba: "P-05 · contradicción",
    esperado: "Escalar (R3), excluir PC-07 (R9), sugerir otro equipo y notificar a mantenimiento",
  },
  "E-009": {
    titulo: "Estudiante con aprobación solo verbal",
    detalle: "Dice que coordinación lo autorizó de palabra; no hay aprobación escrita.",
    prueba: "P-07 · adversarial",
    esperado: "Escalar a coordinación (R6): la aprobación verbal no se acepta",
  },
  "E-010": {
    titulo: "Estudiante que llega 12 minutos tarde",
    detalle: "Llega a las 08:12 a una franja que empieza a las 08:00; todo lo demás está en regla.",
    prueba: "P-08 · regresión",
    esperado: "Permitir, asistencia presente con tolerancia de 15 min (sería tardía con 10 min)",
  },
  "E-011": {
    titulo: "Estudiante sin entrada al cierre de la franja",
    detalle: "Al cerrar la franja no hay registro de su entrada. Se evalúa con el evento Cierre de franja.",
    prueba: "R12 · asistencia",
    esperado: "Sin registro (no ausente definitivo) y se escala para corregir (R12)",
    evento: "cierre",
  },
  "E-012": {
    titulo: "Estudiante que necesita un puesto accesible",
    detalle: "Necesita un puesto accesible; en la sala 1 están libres PC-03 y PC-05.",
    prueba: "P-11a · accesibilidad",
    esperado: "Permitir y sugerir un puesto accesible, PC-03 (R8)",
  },
};
