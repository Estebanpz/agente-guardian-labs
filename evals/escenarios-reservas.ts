// Escenarios del motor de reservas (RS-01 a RS-20), con repositorio en memoria y reloj fijo 2026-11-09 08:00.
// Lo usan evals/reservas.ts (pruebas) y evals/matriz.ts (matriz esperado vs. observado).
import type { DecisionReserva, ReservaDoc, SolicitudReserva } from "../agent/tools/esquemas-reservas.js";
import { evaluarCancelacion, evaluarRegistro, evaluarReserva, type Contexto } from "../agent/tools/reservas.js";
import { ahora, fijarReloj, liberarReloj } from "../agent/tools/reloj.js";
import { crearMemoria } from "../agent/store/memoria.js";
import type { Repositorio } from "../agent/store/repositorio.js";
import { readFileSync } from "node:fs";
const VERSION_REGLAS = JSON.parse(readFileSync(new URL("../agent/rules/reglas.json", import.meta.url), "utf-8")).version as string;

export type FilaRes = { id: string; tipo: string; entrada: string; regla: string; esperado: string; observado: string; ok: boolean };

const FECHA = "2026-11-10";

const sol = (p: Partial<SolicitudReserva>): SolicitudReserva => ({
  carne: null, fecha: FECHA, inicio: null, fin: null, sala: null,
  personas: null, equipos: null, computo_alto: null, materia: null, ...p,
});

async function contexto(repo: Repositorio, carne: string | null, fecha: string | null): Promise<Contexto> {
  const h = ahora();
  return {
    hoy: { fecha: h.fecha, minutos: h.minutos },
    carne: carne ? await repo.carne(carne) : null,
    usuario: carne ? await repo.usuario(carne) : null,
    salas: await repo.salas(),
    equipos: await repo.equipos(),
    reservasDelDia: fecha ? await repo.reservasDelDia(fecha) : [],
  };
}

type Esp = {
  decision: DecisionReserva["decision"];
  reglas: string[];
  sala?: string;               // sala_asignada (si se indica)
  alternativas?: string[];     // solo si la fila lo especifica
  notificar?: string[];        // solo si la fila lo especifica; si no, debe ser [] en programar/negar/pedir_datos
  estado?: string;
  faltantes?: string[];
  conflicto?: { codigo: string; carne: string };
};

type Caso = { id: string; tipo: string; regla: string; s: SolicitudReserva; esp: Esp };

export const CASOS: Caso[] = [
  { id: "RS-01", tipo: "Normal positivo", regla: "R25", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-02", tipo: "Normal negativo", regla: "R18", s: sol({ carne: "C-10000001", sala: "sala-13", inicio: "10:00", fin: "12:00", personas: 15 }),
    esp: { decision: "negar", reglas: ["R18"], alternativas: ["sala-11", "sala-8", "sala-9"] } },
  { id: "RS-03", tipo: "Límite capacidad", regla: "R25", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 30 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-04a", tipo: "Límite horario", regla: "R25", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "07:00", fin: "09:00", personas: 5 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-04b", tipo: "Fuera de horario", regla: "R15", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "21:00", fin: "22:30", personas: 5 }),
    esp: { decision: "negar", reglas: ["R15"] } },
  { id: "RS-21", tipo: "Jornada completa (sin tope de duración)", regla: "R25", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "07:00", fin: "22:00", personas: 5 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-22", tipo: "Menos de 30 minutos", regla: "R15", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "21:45", fin: "22:00", personas: 5 }),
    esp: { decision: "negar", reglas: ["R15"] } },
  { id: "RS-05", tipo: "Desconocido (equipos)", regla: "R19", s: sol({ carne: "D-20000001", sala: "sala-12", inicio: "10:00", fin: "12:00", personas: 14, equipos: 14, computo_alto: false, materia: "Redes" }),
    esp: { decision: "escalar", reglas: ["R19"], notificar: ["monitor", "mantenimiento"], estado: "desconocido" } },
  { id: "RS-06", tipo: "Contradicción (equipos)", regla: "R19", s: sol({ carne: "D-20000001", sala: "sala-9", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: false, materia: "Redes" }),
    esp: { decision: "escalar", reglas: ["R19"], estado: "contradictorio" } },
  { id: "RS-07", tipo: "Docente vs. estudiantes", regla: "R20", s: sol({ carne: "D-20000001", sala: "sala-6", inicio: "14:00", fin: "16:00", personas: 20, equipos: 20, computo_alto: false, materia: "Bases de datos" }),
    esp: { decision: "escalar", reglas: ["R20"], notificar: ["monitor"], conflicto: { codigo: "RS-0001", carne: "C-****0002" }, alternativas: ["sala-8", "sala-10", "sala-7"] } },
  { id: "RS-08", tipo: "Docente vs. docente", regla: "R21", s: sol({ carne: "D-20000002", sala: "sala-5", inicio: "09:00", fin: "11:00", personas: 20, equipos: 20, computo_alto: false, materia: "Redes" }),
    esp: { decision: "escalar", reglas: ["R21"], notificar: ["monitor"] } },
  { id: "RS-09", tipo: "Estudiante vs. reserva", regla: "R22", s: sol({ carne: "C-10000003", sala: "sala-6", inicio: "14:00", fin: "15:00", personas: 3 }),
    esp: { decision: "negar", reglas: ["R22"] } },
  { id: "RS-10", tipo: "Carné vencido", regla: "R16", s: sol({ carne: "C-10000011", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }),
    esp: { decision: "negar", reglas: ["R16"] } },
  { id: "RS-11", tipo: "Carné desconocido", regla: "R17", s: sol({ carne: "C-99999999", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }),
    esp: { decision: "escalar", reglas: ["R17"], notificar: ["monitor"] } },
  { id: "RS-12", tipo: "Alto cómputo sin sala", regla: "R25", s: sol({ carne: "D-20000001", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: true, materia: "IA" }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-14" } },
  { id: "RS-13", tipo: "Alto cómputo en sala estándar", regla: "R23", s: sol({ carne: "D-20000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: true, materia: "IA" }),
    esp: { decision: "negar", reglas: ["R23"], alternativas: ["sala-14", "sala-16"] } },
  { id: "RS-14", tipo: "Ninguna sala", regla: "R24", s: sol({ carne: "C-10000001", inicio: "10:00", fin: "12:00", personas: 40 }),
    esp: { decision: "negar", reglas: ["R24"] } },
  { id: "RS-15", tipo: "Faltan datos", regla: "R14", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5, fecha: null }),
    esp: { decision: "pedir_datos", reglas: ["R14"], faltantes: ["fecha"] } },
  { id: "RS-16", tipo: "Selección estándar", regla: "R25", s: sol({ carne: "C-10000004", inicio: "10:00", fin: "12:00", personas: 12 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-11" } },
  { id: "RS-20", tipo: "Hoy ya pasó", regla: "R15", s: sol({ carne: "C-10000001", fecha: "2026-11-09", inicio: "07:30", fin: "09:00", personas: 5 }),
    esp: { decision: "negar", reglas: ["R15"] } },
];

const iguales = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Resumen igual al de la matriz: decisión, reglas, sala, notificar y estado.
const resumir = (d: DecisionReserva) =>
  `${d.decision} [${d.reglas_aplicadas.join(", ")}]` +
  (d.sala_asignada ? ` · ${d.sala_asignada}` : "") +
  (d.notificar.length ? ` · notificar ${d.notificar.join(", ")}` : "") +
  ` · ${d.estado}`;

// Compara un caso. Las filas sin `notificar` esperan [] en programar, negar y pedir_datos.
function fallasDe(d: DecisionReserva, e: Esp): string[] {
  const fallas: string[] = [];
  if (d.decision !== e.decision) fallas.push(`decision=${d.decision}`);
  if (!iguales(d.reglas_aplicadas, e.reglas)) fallas.push(`reglas=[${d.reglas_aplicadas}]`);
  if (e.sala !== undefined && d.sala_asignada !== e.sala) fallas.push(`sala=${d.sala_asignada}`);
  if (e.alternativas && !iguales(d.alternativas, e.alternativas)) fallas.push(`alternativas=[${d.alternativas}]`);
  if (e.notificar) {
    if (!iguales(d.notificar, e.notificar)) fallas.push(`notificar=[${d.notificar}]`);
  } else if (["programar", "negar", "pedir_datos"].includes(d.decision) && d.notificar.length) {
    fallas.push(`notificar=[${d.notificar}]`);
  }
  if (e.estado && d.estado !== e.estado) fallas.push(`estado=${d.estado}`);
  if (e.faltantes && !iguales(d.faltantes, e.faltantes)) fallas.push(`faltantes=[${d.faltantes}]`);
  if (e.conflicto) {
    const hit = d.conflictos.find((x) => x.codigo === e.conflicto!.codigo && x.carne_enmascarado === e.conflicto!.carne);
    if (!hit) fallas.push("sin conflicto esperado");
  }
  return fallas;
}

const esperadoTexto = (e: Esp) =>
  `${e.decision} [${e.reglas.join(", ")}]` +
  (e.sala ? ` · ${e.sala}` : "") +
  (e.notificar ? ` · notificar ${e.notificar.join(", ")}` : "") +
  (e.estado ? ` · ${e.estado}` : "") +
  (e.alternativas ? ` · alternativas ${e.alternativas.join(", ")}` : "");

export async function correrEscenariosReservas(): Promise<FilaRes[]> {
  fijarReloj("2026-11-09", "08:00");
  const filas: FilaRes[] = [];
  try {
    for (const caso of CASOS) {
      const repo = crearMemoria("2026-11-09");
      const c = await contexto(repo, caso.s.carne, caso.s.fecha);
      const d = evaluarReserva(caso.s, c);
      const fallas = fallasDe(d, caso.esp);
      filas.push({
        id: caso.id, tipo: caso.tipo, entrada: caso.id, regla: caso.regla,
        esperado: esperadoTexto(caso.esp), observado: resumir(d) + (fallas.length ? ` · ${fallas.join(" ")}` : ""),
        ok: fallas.length === 0,
      });
    }

    // RS-17 y RS-18: registro ("Soy nuevo").
    {
      const repo = crearMemoria("2026-11-09");
      const nuevo = evaluarRegistro("C-10000006", await contexto(repo, "C-10000006", null));
      const okNuevo = nuevo.decision === "registrar" && iguales(nuevo.reglas_aplicadas, ["R26"]);
      filas.push({ id: "RS-17", tipo: "Registro nuevo", entrada: "C-10000006", regla: "R26",
        esperado: "registrar [R26]", observado: `${nuevo.decision} [${nuevo.reglas_aplicadas.join(", ")}]`, ok: okNuevo });
      const repetido = evaluarRegistro("C-10000001", await contexto(repo, "C-10000001", null));
      const okRep = repetido.decision === "registrar" && repetido.reglas_aplicadas.length === 0
        && iguales(repetido.traza, ["Usuario ya registrado."]);
      filas.push({ id: "RS-18", tipo: "Registro repetido", entrada: "C-10000001", regla: "—",
        esperado: "registrar [], traza \"Usuario ya registrado.\"",
        observado: `${repetido.decision} [${repetido.reglas_aplicadas.join(", ")}] · ${repetido.traza.join(" ")}`, ok: okRep });
    }

    // RS-19: concurrencia. La primera crea RS-0004; la segunda, igual, sale en conflicto y no inserta.
    {
      const repo = crearMemoria("2026-11-09");
      const s = sol({ carne: "C-10000001", sala: "sala-4", inicio: "16:00", fin: "18:00", personas: 5 });
      const base = await contexto(repo, s.carne, FECHA);
      const revalidar = (actuales: ReservaDoc[]) => evaluarReserva(s, { ...base, reservasDelDia: actuales });
      const construir = (codigo: string): ReservaDoc => ({
        codigo, sala: "sala-4", fecha: FECHA, inicio: "16:00", fin: "18:00", inicio_min: 960, fin_min: 1080,
        tipo: "estudiantes", carne: "C-10000001", rol: "estudiante", personas: 5, equipos: 5,
        computo_alto: false, materia: null, estado: "programada", reglas_aplicadas: ["R25"], traza: [],
        version_reglas: VERSION_REGLAS, creada: new Date(), origen: "chat",
      });
      const primera = await repo.crearReservaAtomica(FECHA, "sala-4", revalidar, construir);
      const segunda = await repo.crearReservaAtomica(FECHA, "sala-4", revalidar, construir);
      const ok = primera.reserva?.codigo === "RS-0004" && segunda.reserva === null && iguales(segunda.decision.reglas_aplicadas, ["R22"]);
      filas.push({ id: "RS-19", tipo: "Concurrencia", entrada: "dos reservas iguales", regla: "R22",
        esperado: "1.ª crea RS-0004; 2.ª negar [R22] sin insertar",
        observado: `1.ª ${primera.reserva?.codigo ?? "nada"}; 2.ª ${segunda.decision.decision} [${segunda.decision.reglas_aplicadas.join(", ")}]`, ok });
    }

    // RS-23 a RS-26 (14-11-2026): R27, cancelación por el titular.
    {
      const repo = crearMemoria("2026-11-09");
      const r2 = await repo.reservaPorCodigo("RS-0002");
      const hoy = { fecha: "2026-11-09", minutos: 8 * 60 };
      const casos: [string, string, ReturnType<typeof evaluarCancelacion>, string][] = [
        ["RS-23", "Titular, antes de empezar", evaluarCancelacion(r2, "D-20000001", hoy), "cancelar titular"],
        ["RS-24", "Otro carné", evaluarCancelacion(r2, "C-10000001", hoy), "negar no_encontrada"],
        ["RS-25", "Ya empezó", evaluarCancelacion(r2, "D-20000001", { fecha: "2026-11-10", minutos: 8 * 60 + 30 }), "negar ya_empezo"],
        ["RS-26", "No existe", evaluarCancelacion(null, "D-20000001", hoy), "negar no_encontrada"],
      ];
      for (const [id, tipo, dec, esp] of casos) {
        const obs = `${dec.decision} ${dec.motivo}`;
        filas.push({ id, tipo, entrada: "RS-0002", regla: "R27", esperado: `${esp} [R27]`, observado: `${obs} [${dec.reglas_aplicadas.join(", ")}]`,
          ok: obs === esp && iguales(dec.reglas_aplicadas, ["R27"]) });
      }
    }
  } finally {
    liberarReloj();
  }
  return filas;
}
