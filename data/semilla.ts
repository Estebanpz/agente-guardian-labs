// Semilla sintética de la base de demostración de reservas (Fase 1).
// Todos los datos son ficticios. Los equipos de sala-1 a sala-3 vienen de data/equipos.ts.
import type { CarneDoc, CuentaDoc, EquipoDoc, ReservaDoc, SalaDoc, UsuarioDoc } from "../agent/tools/esquemas-reservas.js";
import { equipos } from "./equipos.js";
import { facultadPorId } from "./programas.js";

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

// Carnetización simulada: 12 estudiantes y 5 docentes ficticios (plan de identidad, sección 2).
// Las facultades usan el nombre completo del catálogo (data/programas.ts).
const ING = facultadPorId("ingenieria")!.nombre;
const ECO = facultadPorId("economicas")!.nombre;
const SOC = facultadPorId("sociales")!.nombre;
type Vig = "vigente" | "vencido" | "desconocida";
const estudiante = (_id: string, vigencia: Vig, nombres: string, apellidos: string, programa: string, facultad: string, jornada: "Mañana" | "Noche"): CarneDoc =>
  ({ _id, rol: "estudiante", vigencia, nombres, apellidos, programa, facultad, jornada });
const docente = (_id: string, vigencia: Vig, nombres: string, apellidos: string, facultad: string, espacios: string[]): CarneDoc =>
  ({ _id, rol: "docente", vigencia, nombres, apellidos, facultad, espacios });

export const carnetizacionSemilla: CarneDoc[] = [
  estudiante("C-10000001", "vigente", "Laura Valentina", "Gómez Rojas", "Ingeniería de Sistemas", ING, "Noche"),
  estudiante("C-10000002", "vigente", "Juan Camilo", "Torres Díaz", "Gestión Informática", ING, "Mañana"),
  estudiante("C-10000003", "vigente", "María José", "Rincón Castro", "Técnica Profesional en Programación Web", ING, "Noche"),
  estudiante("C-10000004", "vigente", "Andrés Felipe", "Morales Pérez", "Ingeniería Electrónica", ING, "Mañana"),
  estudiante("C-10000005", "vigente", "Daniela", "Ortiz Suárez", "Ingeniería Civil", ING, "Mañana"),
  estudiante("C-10000006", "vigente", "Santiago", "Herrera López", "Ingeniería Ambiental", ING, "Noche"),
  estudiante("C-10000007", "vigente", "Valeria", "Cárdenas Mejía", "Contaduría Pública", ECO, "Noche"),
  estudiante("C-10000008", "vigente", "Sebastián", "Ramírez Vargas", "Administración de Empresas", ECO, "Mañana"),
  estudiante("C-10000009", "vigente", "Natalia", "Guzmán Ospina", "Trabajo Social", SOC, "Mañana"),
  estudiante("C-10000010", "vigente", "Miguel Ángel", "Bermúdez Silva", "Actividad Física y Deporte", SOC, "Noche"),
  estudiante("C-10000011", "vencido", "Camila Andrea", "Reyes Muñoz", "Gestión Empresarial", ECO, "Noche"),
  estudiante("C-10000012", "desconocida", "Diego Alejandro", "Pardo Rubio", "Ingeniería Agronómica", ING, "Mañana"),
  docente("D-20000001", "vigente", "Carlos Eduardo", "Medina Ríos", ING, ["Bases de Datos", "Programación Orientada a Objetos", "Ingeniería de Software"]),
  docente("D-20000002", "vigente", "Patricia Elena", "Soto Quintero", ING, ["Redes de Computadores", "Sistemas Operativos", "Seguridad Informática"]),
  docente("D-20000003", "vigente", "Luis Fernando", "Acosta Beltrán", ECO, ["Sistemas de Información Contable", "Excel Financiero"]),
  docente("D-20000004", "vigente", "Adriana Marcela", "Lozano Ruiz", SOC, ["Estadística Aplicada", "Informática Básica"]),
  docente("D-20000005", "vencido", "Jorge Iván", "Castaño Prieto", ING, ["Electrónica Digital", "Microcontroladores"]),
];

// Cuentas de acceso sintéticas (login). Solo se guarda el hash scrypt; las contraseñas de prueba están en
// docs/cuentas-de-prueba.md. Dominio .test: reservado, nunca es un correo real. Nombres desde carnetización.
const cuenta = (correo: string, rol: CuentaDoc["rol"], carne: string | null, hash: string): CuentaDoc => {
  const c = carne ? carnetizacionSemilla.find((x) => x._id === carne)! : null;
  return {
    _id: correo, rol, carne, hash,
    nombres: c?.nombres ?? "Sofía", apellidos: c?.apellidos ?? "Martínez Lara",
  };
};
export const cuentasSemilla: CuentaDoc[] = [
  cuenta("laura.gomez@estudiantes.uniespinal.test", "estudiante", "C-10000001", "scrypt$QPVn5KF_TMiEeW6NeaEqUw$gGgvvDFLzr1V8jvQ6ClbYZmwb367-8O3EdUEf2aJ3vo"),
  cuenta("juan.torres@estudiantes.uniespinal.test", "estudiante", "C-10000002", "scrypt$v0EwiYszMn22pXnYmn9zuw$2mbtnl-ZSnB_-s2vTN7TLYH9r_exDAB122jglU1cjX4"),
  cuenta("maria.rincon@estudiantes.uniespinal.test", "estudiante", "C-10000003", "scrypt$aRzdS0Zy-J65DwF2xQsHvw$G3XYE86qOEYYbF7LQzJanQeHf1FkouOiDtka7OFk93s"),
  cuenta("andres.morales@estudiantes.uniespinal.test", "estudiante", "C-10000004", "scrypt$_u9zLPyQ9hlR0Ymiw1mMPg$bNhccdW2xlnF4j-bWgP2pW4T7riaWxmEQ6lAgb5X2N8"),
  cuenta("daniela.ortiz@estudiantes.uniespinal.test", "estudiante", "C-10000005", "scrypt$9GDV2l9DKaWZ0W0R7y42sg$nynwIlobA_x1MsQFKTybWKUEwxG-ru3nKF3ZlfHJzcY"),
  cuenta("santiago.herrera@estudiantes.uniespinal.test", "estudiante", "C-10000006", "scrypt$SJaoLn5xvFr5d2APr_WKNQ$_SwIMf3j_0jcXQuEJywcoAEXVu-QYupBdYWK0V96bOo"),
  cuenta("valeria.cardenas@estudiantes.uniespinal.test", "estudiante", "C-10000007", "scrypt$k6oZ6tIXRiH7c3vFCak-tA$12WdzwL0OdaD_pAQB6KFKh6pgTQ2q3sZEXd3O8cewOE"),
  cuenta("sebastian.ramirez@estudiantes.uniespinal.test", "estudiante", "C-10000008", "scrypt$_OlIDO4yINwYKgVRZf2frQ$kUGhgCPWKTdvihWrbJ1YsNhBY-CieYFuoO4qsMxnAGo"),
  cuenta("natalia.guzman@estudiantes.uniespinal.test", "estudiante", "C-10000009", "scrypt$Xlf-P1VEgdzKBme-70-pfg$RsAx5qvQvpjxKhBPrzFANvZsPyJKM2EvkQp67wfMmaM"),
  cuenta("miguel.bermudez@estudiantes.uniespinal.test", "estudiante", "C-10000010", "scrypt$tpnoPrL9u5Qa4nh-lwiKUA$xiDdcz68PJcQrwM5XwEROOXDYqefXHFW1mre0GxCPJU"),
  cuenta("camila.reyes@estudiantes.uniespinal.test", "estudiante", "C-10000011", "scrypt$XT4P_UgemIE27Qml8PstLA$8fBgBSC8Z1XQrbL98euJFTejcy_x-6XjbFYTnjTvJTA"),
  cuenta("diego.pardo@estudiantes.uniespinal.test", "estudiante", "C-10000012", "scrypt$MkqTe9h8Z9FPNrnGHrlq3w$6d6gt0Upv3rYCgGVygIthS15qW-iARrUbono28kCu58"),
  cuenta("carlos.medina@docentes.uniespinal.test", "docente", "D-20000001", "scrypt$fKFYufVseOlvyfH4PoJH0Q$F3Y9_Ld2ogJ4gLoEQxd8Ni_1oCROPRLoQC4QLKa1iLk"),
  cuenta("patricia.soto@docentes.uniespinal.test", "docente", "D-20000002", "scrypt$kPbL2BWSMLWcqc9zF0G8aA$CBVJOB1tZUno-CeiYAWBKI2SgdA2BIfGQ58kWWW2mcs"),
  cuenta("luis.acosta@docentes.uniespinal.test", "docente", "D-20000003", "scrypt$ms3Pb69NkFGle7E1rsZmsQ$qyAiEi_yjMqAXDreQKptbFNPpCsU5dnuveXRPiLmyMg"),
  cuenta("adriana.lozano@docentes.uniespinal.test", "docente", "D-20000004", "scrypt$mJ8ZSQlhzgPtALZvkZ6-fg$Vi9udqPgocXWUMtisOzHlrL_bcRH0SW3QJAO5UfDbNU"),
  cuenta("jorge.castano@docentes.uniespinal.test", "docente", "D-20000005", "scrypt$qP90MyFaJCtg_l2BCu71Bw$nWczfg7-wZvMB53jsozY_anH6T9fyDCMUw7QjNle_8I"),
  cuenta("monitor.salas@uniespinal.test", "monitor", null, "scrypt$qgMVG-CedTktAqXF9ieuFA$jUZDcV1gVBrR_U6AH1zihM7bW4Fa4YhqrT5RiC3TpKU"),
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
    construir({ codigo: "RS-0002", sala: "sala-5", inicio: "08:00", fin: "10:00", tipo: "clase", carne: "D-20000001", personas: 25, alto: false, materia: "Bases de Datos" }),
    construir({ codigo: "RS-0003", sala: "sala-15", inicio: "10:00", fin: "12:00", tipo: "clase", carne: "D-20000002", personas: 18, alto: true, materia: "Redes de Computadores" }),
  ];
}
