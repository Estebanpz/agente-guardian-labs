// Motor de reservas (R14–R26). Decide con reglas; el modelo nunca interviene aquí.
import { readFileSync } from "node:fs";
import {
  Carne, DecisionReserva,
  type CarneDoc, type Conflicto, type EquipoDoc, type ReservaDoc, type SalaDoc,
  type SolicitudReserva, type UsuarioDoc,
} from "./esquemas-reservas.js";
import { aHora, aMin, sumarDias } from "./reloj.js";

type Regla = { id: string; descripcion: string };
const base = JSON.parse(
  readFileSync(new URL("../rules/reglas.json", import.meta.url), "utf-8"),
) as {
  version: string;
  parametros: {
    horario_abre: string; horario_cierra: string;
    duracion_min_min: number; duracion_max_min: number | null; dias_adelante_max: number;
  };
  reglas: Regla[];
};
const P = base.parametros;

export type Contexto = {
  hoy: { fecha: string; minutos: number };
  carne: CarneDoc | null;           // de carnetizacion
  usuario: UsuarioDoc | null;       // de usuarios
  salas: SalaDoc[];
  equipos: EquipoDoc[];
  reservasDelDia: ReservaDoc[];     // programadas de esa fecha (todas las salas)
};

type Decision = DecisionReserva["decision"];
type Estado = DecisionReserva["estado"];
type Accion = DecisionReserva["accion"];
type Notificar = DecisionReserva["notificar"][number];

const FUENTES = [
  `reglas.json ${base.version}`, "carnetizacion (simulada)", "salas y equipos (sintéticos)", "reservas (base de demostración)",
];

const descripcionDe = (id: string): string => base.reglas.find((r) => r.id === id)?.descripcion ?? id;

export const horarioLaboratorio = (): { abre: string; cierra: string } => ({ abre: P.horario_abre, cierra: P.horario_cierra });
export const enmascarar = (carne: string): string => `${carne.slice(0, 2)}****${carne.slice(-4)}`;

// Construye la decisión con su traza ("Rxx: descripción").
function decidir(d: {
  decision: Decision; estado: Estado; accion: Accion; reglas: string[];
  sala?: string | null; alternativas?: string[]; conflictos?: Conflicto[];
  faltantes?: string[]; notificar?: Notificar[]; traza?: string[];
}): DecisionReserva {
  return DecisionReserva.parse({
    decision: d.decision,
    estado: d.estado,
    accion: d.accion,
    reglas_aplicadas: d.reglas,
    sala_asignada: d.sala ?? null,
    alternativas: (d.alternativas ?? []).slice(0, 3),
    conflictos: d.conflictos ?? [],
    faltantes: d.faltantes ?? [],
    notificar: d.notificar ?? [],
    fuentes: FUENTES,
    version_reglas: base.version,
    traza: d.traza ?? d.reglas.map((id) => `${id}: ${descripcionDe(id)}`),
  });
}

// Estado de una sala según sus equipos: operativos, inciertos y si hay contradicción.
function estadoSala(sala: SalaDoc, equipos: EquipoDoc[]) {
  const propios = equipos.filter((q) => q.sala === sala._id);
  const operativos = propios.filter((q) => q.inventario === "disponible" && q.mantenimiento === "disponible").length;
  const inciertos = propios.filter((q) =>
    q.inventario === "desconocido" || q.mantenimiento === "desconocido" || q.inventario !== q.mantenimiento).length;
  const contradictorio = propios.some((q) =>
    q.inventario !== "desconocido" && q.mantenimiento !== "desconocido" && q.inventario !== q.mantenimiento);
  return { operativos, inciertos, contradictorio };
}

const solapa = (r: ReservaDoc, inicio: number, fin: number): boolean =>
  r.inicio_min < fin && r.fin_min > inicio;

const aConflicto = (r: ReservaDoc): Conflicto => ({
  codigo: r.codigo, tipo: r.tipo, personas: r.personas, inicio: r.inicio, fin: r.fin,
  carne_enmascarado: enmascarar(r.carne), materia: r.materia,
});

type Req = { personas: number; equipos: number; alto: boolean; inicio: number; fin: number; fecha: string; docente: boolean };

// Salas que cumplen los criterios de la solicitud, en el orden de preferencia (paso 6 del plan).
// Un criterio que falta no filtra: sin personas no hay mínimo de aforo; sin horario no hay choques.
// Sin carné o para estudiantes, los equipos son las personas. Con la solicitud completa, el resultado es el
// mismo que antes de extraer esta función (RS-01 a RS-20).
export function candidatas(s: SolicitudReserva, c: Contexto): SalaDoc[] {
  const personas = s.personas;
  const equipos = s.equipos ?? personas ?? 0;
  const alto = s.computo_alto ?? false;
  const tieneHorario = s.fecha !== null && s.inicio !== null && s.fin !== null;
  const inicio = s.inicio ? aMin(s.inicio) : 0;
  const fin = s.fin ? aMin(s.fin) : 0;
  return c.salas
    .filter((sala) => sala.activa)
    .filter((sala) => personas === null || sala.capacidad >= personas)
    .filter((sala) => estadoSala(sala, c.equipos).operativos >= equipos)
    .filter((sala) => !tieneHorario || !c.reservasDelDia.some((r) =>
      r.sala === sala._id && r.fecha === s.fecha && solapa(r, inicio, fin)))
    .filter((sala) => !alto || sala.computo === "alto")
    .sort((a, b) =>
      (alto ? 0 : (a.computo === "estandar" ? 0 : 1) - (b.computo === "estandar" ? 0 : 1))
      || a.capacidad - b.capacidad
      || Number(a._id.slice(5)) - Number(b._id.slice(5)));
}

// Hasta 3 alternativas de la selección, sin la sala indicada.
const alternativas = (s: SolicitudReserva, c: Contexto, sin?: string): string[] =>
  candidatas(s, c).map((x) => x._id).filter((id) => id !== sin).slice(0, 3);

// Causa concreta de un incumplimiento de R15 (la misma comprobación que la regla), o null si todo está permitido.
// `campo` dice qué dato hay que cambiar: la fecha o el horario.
export type CausaR15 = { campo: "fecha" | "horario"; motivo: string };
export function causaR15(fecha: string, inicio: string, fin: string, hoy: { fecha: string; minutos: number }): CausaR15 | null {
  const i = aMin(inicio);
  const f = aMin(fin);
  const dur = f - i;
  if (fecha < hoy.fecha) return { campo: "fecha", motivo: "esa fecha ya pasó" };
  if (fecha > sumarDias(hoy.fecha, P.dias_adelante_max)) {
    return { campo: "fecha", motivo: `solo se puede reservar hasta ${P.dias_adelante_max} días adelante` };
  }
  if (fecha === hoy.fecha && i <= hoy.minutos) {
    return { campo: "horario", motivo: `Ese horario de hoy ya pasó (son las ${aHora(hoy.minutos)})` };
  }
  if (i < aMin(P.horario_abre) || f > aMin(P.horario_cierra)) {
    return { campo: "horario", motivo: `las salas abren de ${P.horario_abre} a ${P.horario_cierra}` };
  }
  if (f <= i) return { campo: "horario", motivo: "la hora de fin debe ser posterior a la de inicio" };
  if (dur < P.duracion_min_min) return { campo: "horario", motivo: `la reserva dura menos de ${P.duracion_min_min} minutos` };
  // Sin tope de duración (reglas 2.1.0): solo se revisa si el parámetro tiene valor.
  if (P.duracion_max_min !== null && dur > P.duracion_max_min) return { campo: "horario", motivo: `la reserva dura más de ${P.duracion_max_min / 60} horas` };
  return null;
}

// Evalúa una solicitud completa, en el orden de la sección 6.3 del plan.
export function evaluarReserva(s: SolicitudReserva, c: Contexto): DecisionReserva {
  const docente = s.carne?.startsWith("D-") ?? false;

  // R14: datos obligatorios (pedir, no concluir).
  const faltantes: string[] = [];
  if (!s.carne) faltantes.push("carne");
  if (!s.fecha) faltantes.push("fecha");
  if (!s.inicio) faltantes.push("inicio");
  if (!s.fin) faltantes.push("fin");
  if (s.personas === null) faltantes.push("personas");
  if (docente) {
    if (s.equipos === null) faltantes.push("equipos");
    if (s.computo_alto === null) faltantes.push("computo_alto");
    if (!s.materia) faltantes.push("materia");
  }
  if (c.carne?.vigencia === "vigente" && !c.usuario) faltantes.push("registro");
  if (faltantes.length) {
    return decidir({ decision: "pedir_datos", estado: "desconocido", accion: "pedir_datos", reglas: ["R14"], faltantes });
  }

  const fecha = s.fecha!;
  const inicio = aMin(s.inicio!);
  const fin = aMin(s.fin!);

  // R15: fecha, horario y duración permitidos.
  if (causaR15(fecha, s.inicio!, s.fin!, c.hoy)) {
    return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R15"] });
  }

  // R16: carné vencido.
  if (c.carne?.vigencia === "vencido") {
    return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R16"] });
  }

  // R17: carné que no aparece o con vigencia desconocida.
  if (!c.carne || c.carne.vigencia === "desconocida") {
    return decidir({
      decision: "escalar", estado: "desconocido", accion: "revision_humana", reglas: ["R17"], notificar: ["monitor"],
    });
  }

  const req: Req = {
    personas: s.personas!,
    equipos: s.equipos ?? s.personas!,
    alto: s.computo_alto ?? false,
    inicio, fin, fecha, docente,
  };
  const reservasDeFecha = c.reservasDelDia.filter((r) => r.fecha === fecha);

  // Sala pedida.
  if (s.sala) {
    const sala = c.salas.find((x) => x._id === s.sala);
    // Una sala inexistente o inactiva no se reserva (propiedades, 14-11-2026: el motor asignaba salas inactivas).
    if (!sala || !sala.activa) {
      return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R18"], alternativas: alternativas(s, c) });
    }
    const est = estadoSala(sala, c.equipos);
    const alts = alternativas(s, c, sala._id);

    // R23: alto cómputo pedido en una sala estándar.
    if (req.alto && sala.computo === "estandar") {
      return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R23"], alternativas: alts });
    }

    // R18: no alcanza por aforo o por equipos.
    if (req.personas > sala.capacidad || req.equipos > est.operativos + est.inciertos) {
      return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R18"], alternativas: alts });
    }

    // R19: los equipos solo alcanzan contando equipos inciertos.
    if (est.operativos < req.equipos && req.equipos <= est.operativos + est.inciertos) {
      return decidir({
        decision: "escalar",
        estado: est.contradictorio ? "contradictorio" : "desconocido",
        accion: "revision_humana",
        reglas: ["R19"],
        alternativas: alts,
        notificar: ["monitor", "mantenimiento"],
      });
    }

    // Choques de horario en esa sala.
    const choques = reservasDeFecha.filter((r) => r.sala === sala._id && solapa(r, inicio, fin));
    if (choques.length) {
      const conflictos = choques.map(aConflicto);
      if (docente && choques.every((r) => r.tipo === "estudiantes")) {
        // R20: docente frente a estudiantes.
        return decidir({
          decision: "escalar", estado: "contradictorio", accion: "revision_humana", reglas: ["R20"],
          conflictos, alternativas: alts, notificar: ["monitor"],
        });
      }
      if (docente) {
        // R21: docente frente a otro docente. Primera instancia: el monitor (H04); él remite a coordinación si hace falta.
        return decidir({
          decision: "escalar", estado: "contradictorio", accion: "revision_humana", reglas: ["R21"],
          conflictos, alternativas: alts, notificar: ["monitor"],
        });
      }
      // R22: estudiante frente a una sala ya separada.
      return decidir({
        decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R22"],
        conflictos, alternativas: alts,
      });
    }

    // R25: nada bloquea.
    return decidir({
      decision: "programar", estado: "confirmado", accion: "programar_reserva", reglas: ["R25"],
      sala: sala._id, alternativas: alts,
    });
  }

  // Sin sala pedida: el motor elige (paso 6).
  const cand = candidatas(s, c);
  if (!cand.length) {
    return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R24"] });
  }
  return decidir({
    decision: "programar", estado: "confirmado", accion: "programar_reserva", reglas: ["R25"],
    sala: cand[0]._id, alternativas: cand.slice(1).map((x) => x._id).slice(0, 3),
  });
}

// Evalúa el registro de un carné nuevo ("Soy nuevo").
export function evaluarRegistro(carne: string, c: Pick<Contexto, "carne" | "usuario">): DecisionReserva {
  if (!Carne.safeParse(carne).success) {
    return decidir({ decision: "pedir_datos", estado: "desconocido", accion: "pedir_datos", reglas: ["R14"], faltantes: ["carne"] });
  }
  if (c.carne?.vigencia === "vencido") {
    return decidir({ decision: "negar", estado: "falso", accion: "orientar_proceso", reglas: ["R16"] });
  }
  if (!c.carne || c.carne.vigencia === "desconocida") {
    return decidir({ decision: "escalar", estado: "desconocido", accion: "revision_humana", reglas: ["R17"], notificar: ["monitor"] });
  }
  if (c.usuario) {
    return decidir({
      decision: "registrar", estado: "confirmado", accion: "registrar_usuario", reglas: [],
      traza: ["Usuario ya registrado."],
    });
  }
  return decidir({ decision: "registrar", estado: "confirmado", accion: "registrar_usuario", reglas: ["R26"] });
}

// Disponibilidad de una sala en una fecha: ocupaciones y huecos de 30 min o más.
export function disponibilidad(
  sala: SalaDoc, fecha: string, reservas: ReservaDoc[], c: Contexto,
): { ocupadas: Conflicto[]; libres: { inicio: string; fin: string }[]; operativos: number; inciertos: number } {
  const propias = reservas
    .filter((r) => r.sala === sala._id && r.fecha === fecha && r.estado === "programada")
    .sort((a, b) => a.inicio_min - b.inicio_min);
  const libres: { inicio: string; fin: string }[] = [];
  let cursor = aMin(P.horario_abre);
  const cierre = aMin(P.horario_cierra);
  for (const r of propias) {
    if (r.inicio_min - cursor >= P.duracion_min_min) libres.push({ inicio: aHora(cursor), fin: aHora(r.inicio_min) });
    cursor = Math.max(cursor, r.fin_min);
  }
  if (cierre - cursor >= P.duracion_min_min) libres.push({ inicio: aHora(cursor), fin: aHora(cierre) });
  const est = estadoSala(sala, c.equipos);
  return { ocupadas: propias.map(aConflicto), libres, operativos: est.operativos, inciertos: est.inciertos };
}

// Lo que sale hacia el chat o la API pública de una reserva ajena: solo el bloque ocupado, sin código, carné ni
// materia (ADV-01 y ADV-02 del informe adversarial, 14-11-2026).
export const ocupadaPublica = (c: { inicio: string; fin: string; tipo: string; personas: number }) =>
  ({ inicio: c.inicio, fin: c.fin, tipo: c.tipo, personas: c.personas });

// R27 (14-11-2026): cancelar una reserva desde el chat. Solo el titular (el carné de la sesión) puede cancelarla,
// y solo si está programada y aún no empieza. Si el carné no coincide o la reserva no existe, la respuesta es la
// misma ("no_encontrada"), para no revelar reservas de otras personas.
export type DecisionCancelacion = {
  decision: "cancelar" | "negar";
  motivo: "titular" | "no_encontrada" | "no_programada" | "ya_empezo";
  reglas_aplicadas: string[];
  version_reglas: string;
};

export function evaluarCancelacion(
  r: ReservaDoc | null, carne: string, hoy: { fecha: string; minutos: number },
): DecisionCancelacion {
  const fin = (decision: DecisionCancelacion["decision"], motivo: DecisionCancelacion["motivo"]): DecisionCancelacion =>
    ({ decision, motivo, reglas_aplicadas: ["R27"], version_reglas: base.version });
  if (!r || r.carne !== carne) return fin("negar", "no_encontrada");
  if (r.estado !== "programada") return fin("negar", "no_programada");
  if (r.fecha < hoy.fecha || (r.fecha === hoy.fecha && r.inicio_min <= hoy.minutos)) return fin("negar", "ya_empezo");
  return fin("cancelar", "titular");
}
