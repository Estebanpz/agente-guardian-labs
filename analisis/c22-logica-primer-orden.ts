// 2.2 Lógica de primer orden: base lógica mínima con predicados, reglas con variables y consultas.
// Motor propio de encadenamiento hacia adelante (estilo Datalog) con unificación de variables.
import { carnetizacionSemilla, reservasSemilla } from "../data/semilla.js";
import { crearMemoria } from "../agent/store/memoria.js";
import { aMin } from "../agent/tools/reloj.js";
import { decidir, solicitud, tabla, type Seccion } from "./comun.js";

type Termino = string | number;            // "?x" es variable
type Atomo = [string, ...Termino[]];
type Regla = { id: string; cabeza: Atomo; cuerpo: Atomo[]; texto: string };
type Ligadura = Record<string, Termino>;

const esVar = (t: Termino): t is string => typeof t === "string" && t.startsWith("?");
const BUILTINS: Record<string, (a: number, b: number) => boolean> = { "<": (a, b) => a < b };

function unificar(patron: Atomo, hecho: Atomo, l: Ligadura): Ligadura | null {
  if (patron[0] !== hecho[0] || patron.length !== hecho.length) return null;
  const r = { ...l };
  for (let i = 1; i < patron.length; i++) {
    const p = patron[i];
    const h = hecho[i];
    if (esVar(p)) {
      if (p in r && r[p] !== h) return null;
      r[p] = h;
    } else if (p !== h) return null;
  }
  return r;
}

const sustituir = (a: Atomo, l: Ligadura): Atomo => a.map((t, i) => (i > 0 && esVar(t) ? l[t] : t)) as Atomo;
const clave = (a: Atomo) => JSON.stringify(a);

function satisfacer(cuerpo: Atomo[], hechos: Atomo[], l: Ligadura): Ligadura[] {
  if (!cuerpo.length) return [l];
  const [primero, ...resto] = cuerpo;
  if (primero[0] in BUILTINS) {
    const [a, b] = sustituir(primero, l).slice(1) as number[];
    return BUILTINS[primero[0]](a, b) ? satisfacer(resto, hechos, l) : [];
  }
  return hechos.flatMap((h) => {
    const u = unificar(primero, h, l);
    return u ? satisfacer(resto, hechos, u) : [];
  });
}

// Encadenamiento hacia adelante hasta el punto fijo. Devuelve hechos y la regla que derivó cada uno.
function inferir(base: Atomo[], reglas: Regla[]) {
  const hechos = [...base];
  const vistos = new Set(base.map(clave));
  const origen = new Map<string, string>();
  let nuevos = true;
  while (nuevos) {
    nuevos = false;
    for (const r of reglas) {
      for (const l of satisfacer(r.cuerpo, hechos, {})) {
        const h = sustituir(r.cabeza, l);
        if (!vistos.has(clave(h))) {
          vistos.add(clave(h)); hechos.push(h); origen.set(clave(h), r.id); nuevos = true;
        }
      }
    }
  }
  return { hechos, origen };
}

const consultar = (hechos: Atomo[], patron: Atomo) => hechos.flatMap((h) => (unificar(patron, h, {}) ? [h] : []));

export async function c22(): Promise<Seccion> {
  const fecha = "2026-11-10";
  const base: Atomo[] = [];
  // Hechos desde la carnetización simulada y las reservas de demostración.
  for (const c of carnetizacionSemilla) {
    base.push([c.rol === "docente" ? "Docente" : "Estudiante", c._id]);
    if (c.vigencia === "vencido") base.push(["Vencido", c._id]);
  }
  for (const r of reservasSemilla("2026-11-09")) base.push(["Reserva", r.codigo, r.carne, r.sala, r.fecha, r.inicio_min, r.fin_min]);
  // Dos solicitudes nuevas (las mismas de RS-07 y RS-09).
  base.push(["Solicitud", "S1", "D-20000001", "sala-6", fecha, aMin("14:00"), aMin("16:00")]);
  base.push(["Solicitud", "S2", "C-10000003", "sala-6", fecha, aMin("14:00"), aMin("15:00")]);

  const reglas: Regla[] = [
    { id: "L1", texto: "∀c Vencido(c) → NoPuedeReservar(c)", cabeza: ["NoPuedeReservar", "?c"], cuerpo: [["Vencido", "?c"]] },
    {
      id: "L2", texto: "∀s,r Solicitud(s,c1,sa,f,i1,f1) ∧ Reserva(r,c2,sa,f,i2,f2) ∧ i2<f1 ∧ i1<f2 → Choca(s,r)",
      cabeza: ["Choca", "?s", "?r"],
      cuerpo: [["Solicitud", "?s", "?c1", "?sa", "?f", "?i1", "?f1"], ["Reserva", "?r", "?c2", "?sa", "?f", "?i2", "?f2"], ["<", "?i2", "?f1"], ["<", "?i1", "?f2"]],
    },
    {
      id: "L3", texto: "∀s,r Choca(s,r) ∧ Solicitud(s,c1,…) ∧ Docente(c1) ∧ Reserva(r,c2,…) ∧ Estudiante(c2) → EscalarAlMonitor(s)",
      cabeza: ["EscalarAlMonitor", "?s"],
      cuerpo: [["Choca", "?s", "?r"], ["Solicitud", "?s", "?c1", "?sa", "?f", "?i1", "?f1"], ["Docente", "?c1"],
        ["Reserva", "?r", "?c2", "?sa2", "?f2", "?i2", "?ff2"], ["Estudiante", "?c2"]],
    },
    {
      id: "L4", texto: "∀s,r Choca(s,r) ∧ Solicitud(s,c,…) ∧ Estudiante(c) → NegarSala(s)",
      cabeza: ["NegarSala", "?s"],
      cuerpo: [["Choca", "?s", "?r"], ["Solicitud", "?s", "?c", "?sa", "?f", "?i1", "?f1"], ["Estudiante", "?c"]],
    },
  ];

  const { hechos, origen } = inferir(base, reglas);
  const q1 = consultar(hechos, ["NoPuedeReservar", "C-10000011"]);
  const q2 = consultar(hechos, ["NoPuedeReservar", "C-10000001"]);
  const q3 = consultar(hechos, ["EscalarAlMonitor", "?s"]);
  const q4 = consultar(hechos, ["NegarSala", "?s"]);

  // Equivalencia con el motor de reservas (la versión controlada que usa el agente).
  const repo = crearMemoria("2026-11-09");
  const m10 = await decidir(repo, solicitud({ carne: "C-10000011", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }));
  const m07 = await decidir(repo, solicitud({ carne: "D-20000001", sala: "sala-6", inicio: "14:00", fin: "16:00", personas: 20, equipos: 20, computo_alto: false, materia: "Bases de datos" }));
  const m09 = await decidir(repo, solicitud({ carne: "C-10000003", sala: "sala-6", inicio: "14:00", fin: "15:00", personas: 3 }));

  const md = [
    "**Comprenda.** La lógica de primer orden representa individuos (carnés, salas, solicitudes), propiedades (`Vencido(c)`) y relaciones (`Choca(s,r)`), y deduce conclusiones con reglas generales. El agente usa un **equivalente controlado**: reglas en JSON y funciones TypeScript. Aquí se construye una base lógica pequeña (`analisis/c22-logica-primer-orden.ts`), con unificación de variables y encadenamiento hacia adelante, y se comprueba que llega a las mismas conclusiones que el motor.",
    "",
    "**Predicados**",
    "",
    tabla(["Predicado", "Significado", "Ejemplo"], [
      ["Estudiante(c) / Docente(c)", "El carné c pertenece a un estudiante o a un docente", "Docente(D-20000001)"],
      ["Vencido(c)", "La carnetización reporta el carné c como vencido", "Vencido(C-10000011)"],
      ["Reserva(r,c,sala,f,i,f)", "La reserva r de c ocupa la sala el día f de i a f (minutos)", "Reserva(RS-0001, C-10000002, sala-6, 2026-11-10, 780, 900)"],
      ["Solicitud(s,c,sala,f,i,f)", "La solicitud s pide la sala en ese horario", "Solicitud(S1, D-20000001, sala-6, 2026-11-10, 840, 960)"],
      ["Choca(s,r)", "La solicitud s se solapa con la reserva r", "derivado"],
    ]),
    "",
    "**Reglas con variables**",
    "",
    tabla(["Id", "Regla", "Equivale a"], [
      ["L1", reglas[0].texto, "R16"], ["L2", reglas[1].texto, "condición de choque"],
      ["L3", reglas[2].texto, "R20"], ["L4", reglas[3].texto, "R22"],
    ]),
    "",
    `Hechos base: ${base.length}. Hechos derivados: ${hechos.length - base.length}.`,
    "",
    "**Consultas y conclusión comprobada**",
    "",
    tabla(["Consulta", "Respuesta de la base lógica", "Regla que lo derivó", "Motor del agente"], [
      ["¿NoPuedeReservar(C-10000011)?", q1.length ? "Sí" : "No", q1.length ? origen.get(clave(q1[0]))! : "—", `${m10.decision} [${m10.reglas_aplicadas.join(", ")}]`],
      ["¿NoPuedeReservar(C-10000001)?", q2.length ? "Sí" : "No se puede derivar", "—", "(carné vigente)"],
      ["EscalarAlMonitor(?s)", q3.map((h) => h[1]).join(", ") || "ninguna", q3.length ? origen.get(clave(q3[0]))! : "—", `S1 → ${m07.decision} [${m07.reglas_aplicadas.join(", ")}]`],
      ["NegarSala(?s)", q4.map((h) => h[1]).join(", ") || "ninguna", q4.length ? origen.get(clave(q4[0]))! : "—", `S2 → ${m09.decision} [${m09.reglas_aplicadas.join(", ")}]`],
    ]),
    "",
    "**Límite.** En esta base, que una consulta no se pueda derivar no significa que sea falsa: `¿NoPuedeReservar(C-10000001)?` solo dice que no hay evidencia para concluirlo. Por eso el agente no usa mundo cerrado para los datos críticos: un carné que no aparece en carnetización se trata como **desconocido** (R17) y se escala, no como vigente ni como vencido.",
  ].join("\n");

  return {
    id: "2.2", titulo: "Lógica de primer orden e inferencia", uso: "Se usa",
    evidencia: "5 predicados, 4 reglas con variables, 4 consultas comprobadas contra el motor",
    md,
    verificaciones: [
      ["L1 deriva NoPuedeReservar(C-10000011)", q1.length === 1],
      ["No deriva NoPuedeReservar(C-10000001)", q2.length === 0],
      ["L3 deriva EscalarAlMonitor(S1) como el motor (R20)", q3.length === 1 && q3[0][1] === "S1" && m07.reglas_aplicadas.includes("R20")],
      ["L4 deriva NegarSala(S2) como el motor (R22)", q4.length === 1 && q4[0][1] === "S2" && m09.reglas_aplicadas.includes("R22")],
      ["L1 coincide con R16 del motor", m10.reglas_aplicadas.includes("R16")],
    ],
  };
}
