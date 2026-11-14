// Propiedades del motor de reservas (agent/tools/reservas.ts): enmascarar, R27, evaluarReserva (R14–R25),
// disponibilidad y lo que sale al público de una reserva ajena.
import { publica } from "../../agent/conversacion.js";
import { aHora, aMin, sumarDias } from "../../agent/tools/reloj.js";
import {
  causaR15, disponibilidad, enmascarar, evaluarCancelacion, evaluarReserva, ocupadaPublica, type Contexto,
} from "../../agent/tools/reservas.js";
import type { CarneDoc, EquipoDoc, ReservaDoc, SalaDoc, SolicitudReserva } from "../../agent/tools/esquemas-reservas.js";
import { carnetizacionSemilla, equiposSemilla, salasSemilla } from "../../data/semilla.js";
import { HOY, carneArb, esPrincipal, fc, grupo, propiedad, terminar } from "./comun.js";

const AHORA = { fecha: HOY, minutos: 10 * 60 }; // lunes 9 de noviembre de 2026, 10:00
const EQUIPOS = equiposSemilla();
const CARNES = ["C-10000001", "C-10000002", "D-20000001", "D-20000002", "C-10000011", "C-10000012", "C-99999999"];

// ── Generadores ──────────────────────────────────────────────────────────
const fechaCerca = fc.integer({ min: -3, max: 34 }).map((n) => sumarDias(HOY, n));
const slot = (min: number, max: number) => fc.integer({ min: min / 30, max: max / 30 }).map((k) => k * 30);
const salaId = fc.integer({ min: 1, max: 16 }).map((n) => `sala-${n}`);

const reserva = (fecha: fc.Arbitrary<string>) => fc.record({
  codigo: fc.integer({ min: 1, max: 9999 }).map((n) => `RS-${String(n).padStart(4, "0")}`),
  sala: salaId, fecha,
  inicio_min: slot(7 * 60, 21 * 60 + 30),
  dur: slot(30, 240),
  tipo: fc.constantFrom("estudiantes" as const, "clase" as const),
  carne: fc.constantFrom(...CARNES),
  personas: fc.integer({ min: 1, max: 30 }),
  estado: fc.constantFrom("programada" as const, "escalada" as const, "cancelada" as const),
  materia: fc.option(fc.constantFrom("Bases de Datos", "Redes"), { nil: null }),
}).map(({ dur, ...r }): ReservaDoc => {
  const fin_min = Math.min(r.inicio_min + dur, 22 * 60);
  return {
    ...r, inicio: aHora(r.inicio_min), fin: aHora(fin_min), fin_min,
    rol: r.carne.startsWith("D-") ? "docente" : "estudiante", equipos: r.personas, computo_alto: false,
    reglas_aplicadas: [], traza: [], version_reglas: "2.2.0", creada: new Date("2026-11-01T00:00:00Z"), origen: "semilla",
  };
});

// Cambios al azar en el estado de algunos equipos (desconocido, contradictorio, mantenimiento).
const estadoEquipo = fc.constantFrom("disponible" as const, "mantenimiento" as const, "diagnostico" as const, "desconocido" as const);
const equiposArb = fc.array(fc.tuple(fc.nat({ max: EQUIPOS.length - 1 }), estadoEquipo, estadoEquipo), { maxLength: 25 })
  .map((cambios) => {
    const eq: EquipoDoc[] = EQUIPOS.map((q) => ({ ...q }));
    for (const [i, inv, man] of cambios) eq[i] = { ...eq[i], inventario: inv, mantenimiento: man };
    return eq;
  });

// conInactivas: 1 de cada 6 salas inactiva; "muchas": la mitad.
const salasArb = (conInactivas: boolean | "muchas") => fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 16, maxLength: 16 })
  .map((xs): SalaDoc[] => salasSemilla.map((s, i) => ({ ...s, activa: !conInactivas || xs[i] > (conInactivas === "muchas" ? 2 : 0) })));

const hora = slot(6 * 60, 23 * 60).map(aHora);
const escenario = (conInactivas: boolean | "muchas", salaPedida = false) => fc.record({
  carne: fc.oneof({ weight: 9, arbitrary: fc.constantFrom(...CARNES) }, { weight: 1, arbitrary: fc.constant(null) }),
  vigencia: fc.option(fc.constantFrom("vigente" as const, "vencido" as const, "desconocida" as const), { nil: undefined, freq: 3 }),
  registrado: fc.oneof({ weight: 5, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  fecha: fc.option(fechaCerca, { nil: null, freq: 10 }),
  inicio: fc.option(hora, { nil: null, freq: 10 }), fin: fc.option(hora, { nil: null, freq: 10 }),
  sala: salaPedida ? salaId : fc.option(salaId, { nil: null, freq: 2 }),
  personas: fc.option(fc.integer({ min: 1, max: 40 }), { nil: null, freq: 10 }),
  equipos: fc.option(fc.integer({ min: 0, max: 40 }), { nil: null, freq: 2 }),
  computo_alto: fc.option(fc.boolean(), { nil: null, freq: 3 }),
  materia: fc.option(fc.constantFrom("Bases de Datos", "Redes de Computadores"), { nil: null, freq: 3 }),
  salas: salasArb(conInactivas), equipos_doc: equiposArb,
  reservas: fc.array(reserva(fc.constant(HOY)), { maxLength: 10 }),
}).map((e) => {
  const s: SolicitudReserva = {
    carne: e.carne, fecha: e.fecha, inicio: e.inicio, fin: e.fin, sala: e.sala,
    personas: e.personas, equipos: e.equipos, computo_alto: e.computo_alto, materia: e.materia,
  };
  const base = e.carne ? carnetizacionSemilla.find((c) => c._id === e.carne) ?? null : null;
  const carneDoc: CarneDoc | null = base && e.vigencia ? { ...base, vigencia: e.vigencia } : base;
  // Las reservas del día son las programadas de la fecha pedida (contrato de repo.reservasDelDia).
  const reservasDelDia = e.reservas.map((r) => ({ ...r, fecha: e.fecha ?? HOY, estado: "programada" as const }));
  const c: Contexto = {
    hoy: AHORA, carne: carneDoc,
    usuario: carneDoc && e.registrado ? { _id: carneDoc._id, rol: carneDoc.rol, registrado: new Date("2026-10-01T00:00:00Z") } : null,
    salas: e.salas, equipos: e.equipos_doc, reservasDelDia,
  };
  return { s, c };
});

const operativos = (sala: string, eq: EquipoDoc[]) =>
  eq.filter((q) => q.sala === sala && q.inventario === "disponible" && q.mantenimiento === "disponible").length;
const choca = (r: ReservaDoc, sala: string, fecha: string, i: number, f: number) =>
  r.sala === sala && r.fecha === fecha && r.inicio_min < f && r.fin_min > i;

// Invariantes de una decisión "programar" (lo que la sala asignada debe cumplir).
function programarEsCoherente(s: SolicitudReserva, c: Contexto, sala: string | null): boolean {
  if (!sala || !s.fecha || !s.inicio || !s.fin || s.personas === null || !s.carne) return false;
  const doc = c.salas.find((x) => x._id === sala);
  if (!doc) return false;
  const equipos = s.equipos ?? s.personas;
  const i = aMin(s.inicio), f = aMin(s.fin);
  return doc.capacidad >= s.personas
    && operativos(sala, c.equipos) >= equipos
    && (!s.computo_alto || doc.computo === "alto")
    && !c.reservasDelDia.some((r) => choca(r, sala, s.fecha!, i, f))
    && causaR15(s.fecha, s.inicio, s.fin, c.hoy) === null
    && c.carne?.vigencia === "vigente" && c.usuario !== null;
}

export async function correr(): Promise<void> {
  grupo("Reservas (enmascarar, R27, R14–R25, disponibilidad)");

  await propiedad("enmascarar(carné) no contiene los 8 dígitos, conserva el prefijo C-/D- y los 4 últimos",
    fc.property(carneArb, (c) => {
      const m = enmascarar(c);
      return !m.includes(c.slice(2)) && m.startsWith(c.slice(0, 2)) && m.endsWith(c.slice(-4)) && m === `${c.slice(0, 2)}****${c.slice(-4)}`;
    }), 5000);

  await propiedad("R27: solo \"cancelar\" si la reserva es del mismo carné, está programada y no ha empezado",
    fc.property(fc.option(reserva(fechaCerca), { nil: null, freq: 8 }), fc.constantFrom(...CARNES), slot(0, 23 * 60 + 30),
      (r, carne, minutos) => {
        const hoy = { fecha: HOY, minutos };
        const d = evaluarCancelacion(r, carne, hoy);
        const debe = r !== null && r.carne === carne && r.estado === "programada"
          && (r.fecha > HOY || (r.fecha === HOY && r.inicio_min > minutos));
        return (d.decision === "cancelar") === debe && d.reglas_aplicadas.includes("R27")
          && (d.decision === "cancelar" ? d.motivo === "titular" : d.motivo !== "titular");
      }), 5000);

  await propiedad("R27: una reserva ajena responde igual que una inexistente (no revela reservas de otros)",
    fc.property(reserva(fechaCerca), fc.constantFrom(...CARNES), (r, carne) => {
      fc.pre(r.carne !== carne);
      return JSON.stringify(evaluarCancelacion(r, carne, AHORA)) === JSON.stringify(evaluarCancelacion(null, carne, AHORA));
    }), 3000);

  await propiedad("evaluarReserva: pedir_datos ⇔ faltan datos; negar/escalar sin sala asignada; alternativas únicas, ≤3 y sin la asignada",
    fc.property(escenario(false), ({ s, c }) => {
      const d = evaluarReserva(s, c);
      const pide = d.decision === "pedir_datos";
      const altsOk = d.alternativas.length <= 3 && new Set(d.alternativas).size === d.alternativas.length
        && (d.sala_asignada === null || !d.alternativas.includes(d.sala_asignada));
      return pide === (d.faltantes.length > 0) && (!pide || JSON.stringify(d.reglas_aplicadas) === '["R14"]')
        && (d.decision === "programar") === (d.sala_asignada !== null) && altsOk;
    }), 3000);

  await propiedad("evaluarReserva: \"programar\" implica R15 cumplida, carné vigente y registrado, aforo, equipos operativos, cómputo y sin choques",
    fc.property(escenario(false), ({ s, c }) => {
      const d = evaluarReserva(s, c);
      return d.decision !== "programar" || programarEsCoherente(s, c, d.sala_asignada);
    }), 4000);

  await propiedad("evaluarReserva: las alternativas ofrecidas están activas, tienen aforo y no chocan en ese horario",
    fc.property(escenario(true), ({ s, c }) => {
      const d = evaluarReserva(s, c);
      return d.alternativas.every((id) => {
        const sala = c.salas.find((x) => x._id === id)!;
        const libre = !s.fecha || !s.inicio || !s.fin
          || !c.reservasDelDia.some((r) => choca(r, id, s.fecha!, aMin(s.inicio!), aMin(s.fin!)));
        return sala.activa && (s.personas === null || sala.capacidad >= s.personas) && libre;
      });
    }), 3000);

  await propiedad("evaluarReserva: el orden de las reservas del día no cambia la decisión, la sala ni las alternativas",
    fc.property(escenario(true), fc.nat(), ({ s, c }, k) => {
      const a = evaluarReserva(s, c);
      const giradas = c.reservasDelDia.map((_, i, xs) => xs[(i + k) % xs.length]).reverse();
      const b = evaluarReserva(s, { ...c, reservasDelDia: giradas });
      return a.decision === b.decision && a.sala_asignada === b.sala_asignada
        && JSON.stringify(a.alternativas) === JSON.stringify(b.alternativas) && JSON.stringify(a.reglas_aplicadas) === JSON.stringify(b.reglas_aplicadas);
    }), 3000);

  await propiedad("evaluarReserva: nunca programa una sala inactiva (activa: false), tampoco si la persona la pide por nombre",
    fc.property(escenario("muchas", true), ({ s, c }) => {
      const d = evaluarReserva(s, c);
      return d.decision !== "programar" || c.salas.find((x) => x._id === d.sala_asignada)?.activa === true;
    }), 4000);

  await propiedad("disponibilidad: los huecos libres son exactamente los tramos ≥30 min sin reservas programadas, dentro de 07:00–22:00",
    fc.property(salaId, fc.array(reserva(fc.constantFrom(HOY, sumarDias(HOY, 1))), { maxLength: 12 }), (id, reservas) => {
      const sala = salasSemilla.find((x) => x._id === id)!;
      const ctx: Contexto = { hoy: AHORA, carne: null, usuario: null, salas: salasSemilla, equipos: EQUIPOS, reservasDelDia: [] };
      const r = disponibilidad(sala, HOY, reservas, ctx);
      const ocupado = new Array(24 * 60).fill(false);
      for (const x of reservas) if (x.sala === id && x.fecha === HOY && x.estado === "programada") for (let m = x.inicio_min; m < x.fin_min; m++) ocupado[m] = true;
      const esperado: { inicio: string; fin: string }[] = [];
      for (let m = 7 * 60; m < 22 * 60;) {
        if (ocupado[m]) { m++; continue; }
        let f = m;
        while (f < 22 * 60 && !ocupado[f]) f++;
        if (f - m >= 30) esperado.push({ inicio: aHora(m), fin: aHora(f) });
        m = f;
      }
      const propias = reservas.filter((x) => x.sala === id && x.fecha === HOY && x.estado === "programada").length;
      return JSON.stringify(r.libres) === JSON.stringify(esperado) && r.ocupadas.length === propias;
    }), 3000);

  await propiedad("lo público de una reserva ajena (ocupadaPublica y publica) no lleva código, carné ni materia",
    fc.property(escenario(true), ({ s, c }) => {
      const d = evaluarReserva(s, c);
      const pub = JSON.stringify(publica(d));
      const ok = d.conflictos.every((x) => !pub.includes(x.codigo) && !pub.includes(x.carne_enmascarado)
        && (x.materia === null || !pub.includes(x.materia)));
      return ok && d.conflictos.every((x) => Object.keys(ocupadaPublica(x)).sort().join() === "fin,inicio,personas,tipo");
    }), 3000);
}

if (esPrincipal(import.meta.url)) {
  const t0 = Date.now();
  await correr();
  terminar(t0);
}
