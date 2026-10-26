import { readFileSync } from "node:fs";
import { Decision, type EntradaEvaluar, type Hechos } from "./esquemas";

type Regla = {
  id: string; prioridad: number; especificidad: number;
  tipo: string; efecto: string; descripcion: string;
};

const base = JSON.parse(
  readFileSync(new URL("../rules/reglas.json", import.meta.url), "utf-8"),
) as { version: string; reglas: Regla[] };

const aMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Hechos críticos desconocidos (R2). No se interpretan como falsos.
function desconocidos(h: Hechos): string[] {
  const d: string[] = [];
  if (h.rol === "desconocido") d.push("rol");
  if (h.carne_vigente === "desconocido") d.push("carne_vigente");
  if (h.induccion_seguridad === "desconocida") d.push("induccion_seguridad");
  if (h.reserva_valida === "desconocido") d.push("reserva_valida");
  if (h.reserva_creada_por_rol_autorizado === "desconocido") d.push("reserva_creada_por_rol_autorizado");
  if (h.aforo_actual === null || h.capacidad === null) d.push("aforo");
  return d;
}

// Fuentes con estados incompatibles (R3).
function contradicciones(h: Hechos): string[] {
  const i = h.equipo_estado_inventario;
  const m = h.equipo_estado_mantenimiento;
  if (i !== "desconocido" && m !== "desconocido" && i !== m) {
    return [`equipo: inventario=${i} vs mantenimiento=${m}`];
  }
  return [];
}

export function evaluar(h: Hechos, e: EntradaEvaluar): Decision {
  const desc = desconocidos(h);
  const contr = contradicciones(h);
  const equipoNoDisp =
    h.equipo_estado_inventario !== "disponible" ||
    h.equipo_estado_mantenimiento !== "disponible";
  const inicio = aMin(e.franja.split("–")[0]);
  const tarde = aMin(h.hora_llegada) > inicio + 15;

  const aplica: Record<string, boolean> = {
    R1: h.induccion_seguridad === "vencida",
    R13: desc.length > 0 && contr.length > 0,
    R2: desc.length > 0,
    R3: contr.length > 0,
    R4: h.carne_vigente === "falso",
    R5: h.reserva_creada_por_rol_autorizado === "falso",
    R6: h.aprobacion_coordinacion === "verbal",
    R7: h.aforo_actual !== null && h.capacidad !== null && h.aforo_actual >= h.capacidad,
    R8: h.necesidad_accesibilidad,
    R9: equipoNoDisp,
  };

  // Orden: prioridad menor primero; empate -> mayor especificidad.
  const ordenadas = [...base.reglas].sort(
    (a, b) => a.prioridad - b.prioridad || b.especificidad - a.especificidad,
  );

  const traza: string[] = [];
  let aplicadas: Regla[] = [];
  for (const r of ordenadas) {
    if (aplica[r.id]) {
      aplicadas.push(r);
      traza.push(`${r.id}: ${r.descripcion}`);
    }
  }
  // R13 cubre a R2 y R3: no se reportan por separado.
  if (aplica.R13) aplicadas = aplicadas.filter((r) => r.id !== "R2" && r.id !== "R3");

  const bloqueante = aplicadas.find((r) => r.tipo === "bloqueante");
  let decision: "permitir" | "negar" | "escalar";

  if (bloqueante) {
    decision = bloqueante.efecto.startsWith("negar") ? "negar" : "escalar";
  } else if (h.reserva_valida === "verdadero") {
    decision = "permitir";
    const r10 = base.reglas.find((r) => r.id === "R10")!;
    aplicadas.push(r10);
    traza.push(`R10: ${r10.descripcion}`);
  } else {
    decision = "escalar";
    traza.push("Ninguna regla aplicable: se escala por seguridad.");
  }

  // Asistencia (R11). R12 queda pendiente: necesita el registro de entradas.
  let estado_asistencia: "presente" | "tardia" | "sin_registro" | "no_aplica" = "no_aplica";
  if (decision === "permitir" && e.tipo_evento === "ingreso") {
    const r11 = base.reglas.find((r) => r.id === "R11")!;
    aplicadas.push(r11);
    estado_asistencia = tarde ? "tardia" : "presente";
    traza.push(`R11: ${estado_asistencia}`);
  }

  // Sugerencia informativa: el monitor puede ignorarla.
  const equipo_sugerido =
    decision === "permitir" && !equipoNoDisp
      ? h.necesidad_accesibilidad ? "puesto accesible" : "equipo disponible"
      : null;

  return Decision.parse({
    decision,
    reglas_aplicadas: aplicadas.map((r) => r.id),
    equipo_sugerido,
    estado_asistencia,
    hechos_desconocidos: desc,
    contradicciones: contr,
    version_reglas: base.version,
    traza,
  });
}
