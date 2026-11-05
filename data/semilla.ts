// Semilla sintética de la base de demostración de reservas (Fase 1).
// Todos los datos son ficticios. Los equipos de sala-1 a sala-3 vienen de data/equipos.ts.
import type { CarneDoc, EquipoDoc, ReservaDoc, SalaDoc, UsuarioDoc } from "../agent/tools/esquemas-reservas.js";
import { equipos } from "./equipos.js";

type Estado = EquipoDoc["inventario"];

// [número de sala, capacidad, cómputo]
const TABLA: [number, number, "estandar" | "alto"][] = [
  [1, 25, "estandar"], [2, 20, "estandar"], [3, 15, "estandar"], [4, 30, "estandar"],
  [5, 30, "estandar"], [6, 25, "estandar"], [7, 25, "estandar"], [8, 20, "estandar"],
  [9, 20, "estandar"], [10, 20, "estandar"], [11, 15, "estandar"], [12, 15, "estandar"],
  [13, 10, "estandar"], [14, 25, "alto"], [15, 20, "alto"], [16, 30, "alto"],
];

// Excepciones de equipos generados: inventario / mantenimiento.
const EXCEPCIONES: Record<string, { inventario: Estado; mantenimiento: Estado }> = {
  "S09-20": { inventario: "disponible", mantenimiento: "diagnostico" },
  "S12-14": { inventario: "disponible", mantenimiento: "desconocido" },
  "S12-15": { inventario: "disponible", mantenimiento: "desconocido" },
  "S15-19": { inventario: "mantenimiento", mantenimiento: "mantenimiento" },
  "S15-20": { inventario: "mantenimiento", mantenimiento: "mantenimiento" },
};

const aMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const salasSemilla: SalaDoc[] = TABLA.map(([n, capacidad, computo]) => ({
  _id: `sala-${n}`,
  nombre: computo === "alto" ? `Sala ${n} · alto cómputo` : `Sala ${n}`,
  capacidad,
  computo,
  activa: true,
  fuente: "sintetico" as const,
}));

function equiposGenerados(n: number, capacidad: number): EquipoDoc[] {
  const nn = String(n).padStart(2, "0");
  return Array.from({ length: capacidad }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const id = `S${nn}-${mm}`;
    const exc = EXCEPCIONES[id];
    return {
      _id: id,
      sala: `sala-${n}`,
      inventario: exc?.inventario ?? "disponible",
      mantenimiento: exc?.mantenimiento ?? "disponible",
      accesible: mm === "01" || mm === "02",
    };
  });
}

// Equipos de data/equipos.ts (sala-1 a sala-3) más los generados (sala-4 a sala-16).
export function equiposSemilla(): EquipoDoc[] {
  const base: EquipoDoc[] = equipos.map((q) => ({
    _id: q.id,
    sala: q.sala,
    inventario: q.inventario,
    mantenimiento: q.mantenimiento,
    accesible: q.accesible,
  }));
  const generados = TABLA.filter(([n]) => n > 3).flatMap(([n, capacidad]) => equiposGenerados(n, capacidad));
  return [...base, ...generados];
}

export const carnetizacionSemilla: CarneDoc[] = [
  ...Array.from({ length: 10 }, (_, i): CarneDoc => ({
    _id: `C-${10000001 + i}`, rol: "estudiante", vigencia: "vigente",
  })),
  { _id: "C-10000011", rol: "estudiante", vigencia: "vencido" },
  { _id: "C-10000012", rol: "estudiante", vigencia: "desconocida" },
  ...Array.from({ length: 4 }, (_, i): CarneDoc => ({
    _id: `D-${20000001 + i}`, rol: "docente", vigencia: "vigente",
  })),
  { _id: "D-20000005", rol: "docente", vigencia: "vencido" },
];

// Fecha fija de registro para que la semilla sea idempotente.
const REGISTRO_SEMILLA = new Date("2026-11-04T08:00:00-05:00");

export const usuariosSemilla: UsuarioDoc[] = [
  ...["C-10000001", "C-10000002", "C-10000003", "C-10000004", "C-10000005"].map((id): UsuarioDoc => ({
    _id: id, rol: "estudiante", registrado: REGISTRO_SEMILLA,
  })),
  { _id: "D-20000001", rol: "docente", registrado: REGISTRO_SEMILLA },
  { _id: "D-20000002", rol: "docente", registrado: REGISTRO_SEMILLA },
];

// Suma un día a una fecha aaaa-mm-dd (calendario, sin zona horaria).
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Reservas de demostración. "dia 1" = mañana en Bogotá respecto de `hoy` (aaaa-mm-dd).
export function reservasSemilla(hoy: string): ReservaDoc[] {
  const fecha = diaSiguiente(hoy);
  const creada = new Date(`${hoy}T00:00:00-05:00`);
  const base = {
    fecha, estado: "programada" as const, reglas_aplicadas: [] as string[], traza: [] as string[],
    version_reglas: "2.0.0", creada, origen: "semilla" as const,
  };
  const construir = (p: {
    codigo: string; sala: string; inicio: string; fin: string; tipo: "estudiantes" | "clase";
    carne: string; personas: number; alto: boolean; materia: string | null;
  }): ReservaDoc => ({
    ...base,
    codigo: p.codigo,
    sala: p.sala,
    inicio: p.inicio,
    fin: p.fin,
    inicio_min: aMin(p.inicio),
    fin_min: aMin(p.fin),
    tipo: p.tipo,
    carne: p.carne,
    rol: p.carne.startsWith("D-") ? "docente" : "estudiante",
    personas: p.personas,
    equipos: p.personas,
    computo_alto: p.alto,
    materia: p.materia,
  });
  return [
    construir({ codigo: "RS-0001", sala: "sala-6", inicio: "13:00", fin: "15:00", tipo: "estudiantes", carne: "C-10000002", personas: 5, alto: false, materia: null }),
    construir({ codigo: "RS-0002", sala: "sala-5", inicio: "08:00", fin: "10:00", tipo: "clase", carne: "D-20000001", personas: 25, alto: false, materia: "Redes" }),
    construir({ codigo: "RS-0003", sala: "sala-15", inicio: "10:00", fin: "12:00", tipo: "clase", carne: "D-20000002", personas: 18, alto: true, materia: "Inteligencia Artificial" }),
  ];
}
