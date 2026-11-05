// Pruebas del motor de reservas (sin red, repositorio en memoria, reloj fijo 2026-11-09 08:00).
import type { DecisionReserva, ReservaDoc, SolicitudReserva } from "../agent/tools/esquemas-reservas.js";
import { evaluarRegistro, evaluarReserva, type Contexto } from "../agent/tools/reservas.js";
import { ahora, fijarReloj, liberarReloj } from "../agent/tools/reloj.js";
import { crearMemoria } from "../agent/store/memoria.js";
import type { Repositorio } from "../agent/store/repositorio.js";

const FECHA = "2026-11-10";
fijarReloj("2026-11-09", "08:00");

const sol = (p: Partial<SolicitudReserva>): SolicitudReserva => ({
  carne: null, fecha: FECHA, inicio: null, fin: null, sala: null,
  personas: null, equipos: null, computo_alto: null, materia: null, ...p,
});

async function contexto(repo: Repositorio, carne: string | null, fecha: string | null): Promise<Contexto> {
  const ah = ahora();
  return {
    hoy: { fecha: ah.fecha, minutos: ah.minutos },
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
  sala?: string;                 // sala_asignada (si se indica)
  alternativas?: string[];       // solo si la fila lo especifica
  notificar?: string[];          // solo si la fila lo especifica
  estado?: string;
  faltantes?: string[];
  conflicto?: { codigo: string; carne: string };
};

type Caso = { id: string; s: SolicitudReserva; esp: Esp };

const CASOS: Caso[] = [
  { id: "RS-01 Normal positivo", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-02 Normal negativo", s: sol({ carne: "C-10000001", sala: "sala-13", inicio: "10:00", fin: "12:00", personas: 15 }),
    esp: { decision: "negar", reglas: ["R18"], alternativas: ["sala-11", "sala-8", "sala-9"] } },
  { id: "RS-03 Límite capacidad", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 30 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-04a Límite horario", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "07:00", fin: "09:00", personas: 5 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-4" } },
  { id: "RS-04b Fuera de horario", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "21:00", fin: "22:30", personas: 5 }),
    esp: { decision: "negar", reglas: ["R15"] } },
  { id: "RS-05 Desconocido (equipos)", s: sol({ carne: "D-20000001", sala: "sala-12", inicio: "10:00", fin: "12:00", personas: 14, equipos: 14, computo_alto: false, materia: "Redes" }),
    esp: { decision: "escalar", reglas: ["R19"], notificar: ["monitor", "mantenimiento"] } },
  { id: "RS-06 Contradicción (equipos)", s: sol({ carne: "D-20000001", sala: "sala-9", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: false, materia: "Redes" }),
    esp: { decision: "escalar", reglas: ["R19"], estado: "contradictorio" } },
  { id: "RS-07 Docente vs. estudiantes", s: sol({ carne: "D-20000001", sala: "sala-6", inicio: "14:00", fin: "16:00", personas: 20, equipos: 20, computo_alto: false, materia: "Bases de datos" }),
    esp: { decision: "escalar", reglas: ["R20"], notificar: ["monitor"], conflicto: { codigo: "RS-0001", carne: "C-****0002" },
      alternativas: ["sala-8", "sala-10", "sala-7"] } },
  { id: "RS-08 Docente vs. docente", s: sol({ carne: "D-20000002", sala: "sala-5", inicio: "09:00", fin: "11:00", personas: 20, equipos: 20, computo_alto: false, materia: "Redes" }),
    esp: { decision: "escalar", reglas: ["R21"], notificar: ["coordinacion"] } },
  { id: "RS-09 Estudiante vs. reserva", s: sol({ carne: "C-10000003", sala: "sala-6", inicio: "14:00", fin: "15:00", personas: 3 }),
    esp: { decision: "negar", reglas: ["R22"] } },
  { id: "RS-10 Carné vencido", s: sol({ carne: "C-10000011", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }),
    esp: { decision: "negar", reglas: ["R16"] } },
  { id: "RS-11 Carné desconocido", s: sol({ carne: "C-99999999", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }),
    esp: { decision: "escalar", reglas: ["R17"], notificar: ["monitor"] } },
  { id: "RS-12 Alto cómputo sin sala", s: sol({ carne: "D-20000001", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: true, materia: "IA" }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-14" } },
  { id: "RS-13 Alto cómputo en sala estándar", s: sol({ carne: "D-20000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: true, materia: "IA" }),
    esp: { decision: "negar", reglas: ["R23"], alternativas: ["sala-14", "sala-16"] } },
  { id: "RS-14 Ninguna sala", s: sol({ carne: "C-10000001", inicio: "10:00", fin: "12:00", personas: 40 }),
    esp: { decision: "negar", reglas: ["R24"] } },
  { id: "RS-15 Faltan datos", s: sol({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5, fecha: null }),
    esp: { decision: "pedir_datos", reglas: ["R14"], faltantes: ["fecha"] } },
  { id: "RS-16 Selección estándar", s: sol({ carne: "C-10000004", inicio: "10:00", fin: "12:00", personas: 12 }),
    esp: { decision: "programar", reglas: ["R25"], sala: "sala-11" } },
  { id: "RS-20 Hoy ya pasó", s: sol({ carne: "C-10000001", fecha: "2026-11-09", inicio: "07:30", fin: "09:00", personas: 5 }),
    esp: { decision: "negar", reglas: ["R15"] } },
];

let fallos = 0;
const comprobar = (ok: boolean, texto: string) => {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${texto}`);
};
const iguales = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

for (const caso of CASOS) {
  const repo = crearMemoria("2026-11-09");
  const c = await contexto(repo, caso.s.carne, caso.s.fecha);
  const d = evaluarReserva(caso.s, c);
  const e = caso.esp;
  const fallas: string[] = [];
  if (d.decision !== e.decision) fallas.push(`decision=${d.decision}`);
  if (!iguales(d.reglas_aplicadas, e.reglas)) fallas.push(`reglas=[${d.reglas_aplicadas}]`);
  if (e.sala !== undefined && d.sala_asignada !== e.sala) fallas.push(`sala=${d.sala_asignada}`);
  if (e.alternativas && !iguales(d.alternativas, e.alternativas)) fallas.push(`alternativas=[${d.alternativas}]`);
  if (e.notificar && !iguales(d.notificar, e.notificar)) fallas.push(`notificar=[${d.notificar}]`);
  if (e.estado && d.estado !== e.estado) fallas.push(`estado=${d.estado}`);
  if (e.faltantes && !iguales(d.faltantes, e.faltantes)) fallas.push(`faltantes=[${d.faltantes}]`);
  if (e.conflicto) {
    const hit = d.conflictos.find((x) => x.codigo === e.conflicto!.codigo && x.carne_enmascarado === e.conflicto!.carne);
    if (!hit) fallas.push("sin conflicto esperado");
  }
  comprobar(fallas.length === 0, `${caso.id} -> ${d.decision} [${d.reglas_aplicadas.join(",")}]${d.sala_asignada ? ` ${d.sala_asignada}` : ""}${fallas.length ? ` · ${fallas.join(" ")}` : ""}`);
}

// RS-17 / RS-18: registro ("Soy nuevo").
{
  const repo = crearMemoria("2026-11-09");
  const nuevo = evaluarRegistro("C-10000006", await contexto(repo, "C-10000006", null));
  comprobar(nuevo.decision === "registrar" && iguales(nuevo.reglas_aplicadas, ["R26"]), "RS-17 Registro nuevo -> registrar [R26]");
  const repetido = evaluarRegistro("C-10000001", await contexto(repo, "C-10000001", null));
  comprobar(repetido.decision === "registrar" && repetido.reglas_aplicadas.length === 0
    && iguales(repetido.traza, ["Usuario ya registrado."]), "RS-18 Registro repetido -> registrar [], traza \"Usuario ya registrado.\"");
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
    version_reglas: "2.0.0", creada: new Date(), origen: "chat",
  });
  const primera = await repo.crearReservaAtomica(FECHA, "sala-4", revalidar, construir);
  comprobar(primera.reserva?.codigo === "RS-0004", `RS-19 Concurrencia: 1.ª crea ${primera.reserva?.codigo ?? "nada"}`);
  const segunda = await repo.crearReservaAtomica(FECHA, "sala-4", revalidar, construir);
  comprobar(segunda.reserva === null && iguales(segunda.decision.reglas_aplicadas, ["R22"]),
    "RS-19 Concurrencia: 2.ª negar [R22] y no inserta");
}

liberarReloj();
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
