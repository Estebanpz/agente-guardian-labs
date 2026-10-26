import { readFileSync } from "node:fs";
import { Decision, type Equipo, type EntradaEvaluar, type Hechos } from "./esquemas.js";

type Regla = {
  id: string; prioridad: number; especificidad: number;
  tipo: string; efecto: string; descripcion: string;
};

const base = JSON.parse(
  readFileSync(new URL("../rules/reglas.json", import.meta.url), "utf-8"),
) as { version: string; parametros: { tolerancia_asistencia_min: number }; reglas: Regla[] };

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
    return [`${h.equipo_id}: inventario=${i} vs mantenimiento=${m}`];
  }
  return [];
}

export function evaluar(h: Hechos, e: EntradaEvaluar, equipos: Equipo[] = [],
  opciones: { tolerancia?: number } = {},
): Decision {
  // R12: al cierre de la franja, sin entrada registrada -> "sin registro" (no ausente definitivo).
  if (e.tipo_evento === "cierre") {
    const r12 = base.reglas.find((r) => r.id === "R12")!;
    const sinRegistro = !h.entrada_registrada;
    return Decision.parse({
      decision: sinRegistro ? "escalar" : "permitir",
      reglas_aplicadas: sinRegistro ? ["R12"] : [],
      equipo_sugerido: null,
      notificar: [],
      estado_asistencia: sinRegistro ? "sin_registro" : "no_aplica",
      hechos_desconocidos: [],
      contradicciones: [],
      version_reglas: base.version,
      traza: [sinRegistro ? `R12: ${r12.descripcion}` : "Entrada registrada; sin acción al cierre."],
    });
  }

  const desc = desconocidos(h);
  const contr = contradicciones(h);
  const equipoNoDisp =
    h.equipo_estado_inventario !== "disponible" ||
    h.equipo_estado_mantenimiento !== "disponible";
  const inicio = aMin(e.franja.split("–")[0]);
  const tol = opciones.tolerancia ?? base.parametros.tolerancia_asistencia_min;
  const tarde = aMin(h.hora_llegada) > inicio + tol;

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

  // Sugerencia de equipo (informativa; el monitor puede ignorarla).
  // Nunca se sugiere si hay datos desconocidos (R13/R2) ni si se niega el ingreso.
  let equipo_sugerido: string | null = null;
  const puedeSugerir =
    desc.length === 0 && (decision === "permitir" || (decision === "escalar" && aplica.R3));
  if (puedeSugerir) {
    const propio = !equipoNoDisp && !h.necesidad_accesibilidad ? h.equipo_id : null;
    const ok = (q: Equipo) =>
      q.id !== h.equipo_id &&
      q.inventario === "disponible" &&
      q.mantenimiento === "disponible" &&
      (!h.necesidad_accesibilidad || q.accesible);
    equipo_sugerido = propio ?? equipos.find(ok)?.id ?? null;
  }

  // R8: si necesita puesto accesible y no hay, se escala.
  if (decision === "permitir" && aplica.R8 && !equipo_sugerido) {
    decision = "escalar";
    aplicadas = aplicadas.filter((r) => r.id !== "R10");
    traza.push("R8: no hay puesto accesible disponible; escalar.");
  }

  // Asistencia (R11). R12 queda pendiente: necesita el registro de entradas.
  let estado_asistencia: "presente" | "tardia" | "sin_registro" | "no_aplica" = "no_aplica";
  if (decision === "permitir" && e.tipo_evento === "ingreso") {
    const r11 = base.reglas.find((r) => r.id === "R11")!;
    aplicadas.push(r11);
    estado_asistencia = tarde ? "tardia" : "presente";
    traza.push(`R11: ${estado_asistencia}`);
  }

  // A quién avisar.
  const notificar: string[] = [];
  if (aplica.R13 || aplica.R3) notificar.push("mantenimiento");
  if (aplica.R5 || aplica.R6) notificar.push("coordinación");

  return Decision.parse({
    decision,
    reglas_aplicadas: aplicadas.map((r) => r.id),
    equipo_sugerido,
    notificar,
    estado_asistencia,
    hechos_desconocidos: desc,
    contradicciones: contr,
    version_reglas: base.version,
    traza,
  });
}
