// 2.3 Representación del conocimiento: hechos con metadatos, observaciones de campo,
// diccionario de datos y una consulta funcional sobre la base.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tabla, type Seccion } from "./comun.js";

type Hecho = {
  id: string; tipo: string; sujeto: string; valor: string;
  fuente: string; fecha: string; verificacion: "verificado" | "pendiente" | "no_aplica";
  estado: "confirmado" | "falso" | "desconocido" | "contradictorio";
  nota?: string;
};

// Hechos: los que vienen de la entrevista son reales; los sintéticos se marcan como tales.
const HECHOS: Hecho[] = [
  { id: "H01", tipo: "infraestructura", sujeto: "salas", valor: "16 salas de cómputo", fuente: "entrevista_monitor_P4", fecha: "2026-10-27", verificacion: "verificado", estado: "confirmado" },
  { id: "H02", tipo: "horario", sujeto: "salas", valor: "07:00 a 22:00", fuente: "entrevista_monitor_P2b", fecha: "2026-10-27", verificacion: "verificado", estado: "confirmado" },
  { id: "H03", tipo: "proceso", sujeto: "reservas", valor: "la programación se lleva en un horario en Excel", fuente: "entrevista_monitor_P3", fecha: "2026-10-27", verificacion: "pendiente", estado: "confirmado", nota: "No se sabe quién actualiza el Excel ni con qué frecuencia." },
  { id: "H04", tipo: "autoridad", sujeto: "casos dudosos", valor: "decide la Vicerrectoría académica", fuente: "entrevista_monitor_P9", fecha: "2026-10-27", verificacion: "pendiente", estado: "confirmado", nota: "Resuelto por el equipo (4-11-2026): el monitor es la primera instancia; el agente le escala y él decide la acción o remite a coordinación y, en última instancia, a la Vicerrectoría académica. El agente nunca escala directo a la Vicerrectoría." },
  { id: "H05", tipo: "datos", sujeto: "registro de ingreso", valor: "se anotan nombres completos y celular", fuente: "entrevista_monitor_P10", fecha: "2026-10-27", verificacion: "verificado", estado: "confirmado", nota: "El agente NO usa estos datos: solo identificadores sintéticos." },
  { id: "H06", tipo: "equipo", sujeto: "PC-07", valor: "inventario=disponible; mantenimiento=diagnostico", fuente: "ejemplo_sintetico", fecha: "2026-11-04", verificacion: "no_aplica", estado: "contradictorio" },
  { id: "H07", tipo: "equipo", sujeto: "S3-05", valor: "mantenimiento sin dato", fuente: "ejemplo_sintetico", fecha: "2026-11-04", verificacion: "no_aplica", estado: "desconocido" },
  { id: "H08", tipo: "carne", sujeto: "C-10000011", valor: "vencido", fuente: "carnetizacion_simulada", fecha: "2026-11-04", verificacion: "no_aplica", estado: "falso", nota: "falso = el carné no está vigente." },
  { id: "H09", tipo: "carne", sujeto: "C-10000012", valor: "vigencia sin dato", fuente: "carnetizacion_simulada", fecha: "2026-11-04", verificacion: "no_aplica", estado: "desconocido" },
  { id: "H10", tipo: "induccion", sujeto: "inducción de seguridad", valor: "no se mencionó en la entrevista", fuente: "entrevista_monitor", fecha: "2026-10-27", verificacion: "pendiente", estado: "desconocido", nota: "Las reglas R1 y R2 se basan en la situación 2 del taller." },
];

// Observaciones de campo: transcritas de la entrevista al monitor (Anexo D), sin datos personales.
const OBSERVACIONES = [
  ["O1", "El ingreso a las salas se controla con una plataforma web", "Existe un sistema de control; el agente lo complementa, no lo reemplaza", "entrevista_monitor_P1", "2026-10-27", "confirmado"],
  ["O2", "La reserva o autorización previa es el horario en Excel", "Regla candidata: reserva válida = aparece en el horario vigente", "entrevista_monitor_P3", "2026-10-27", "dudoso"],
  ["O3", "Registrar a una persona toma cerca de 1 minuto por sala", "Medida de desempeño: tiempo de registro", "entrevista_monitor_P6", "2026-10-27", "confirmado"],
  ["O4", "Sin carné puede haber inconvenientes por daños y por falta de datos", "Regla candidata: carné obligatorio (R4, R16)", "entrevista_monitor_P8", "2026-10-27", "confirmado"],
  ["O5", "Los casos dudosos los decide la Vicerrectoría académica", "Ruta de escalamiento: el agente escala al monitor (primera instancia) y la Vicerrectoría es la última instancia", "entrevista_monitor_P9", "2026-10-27", "confirmado"],
  ["O6", "Al ingresar se registran nombres completos y celular", "Dato personal: el agente no lo recibe ni lo guarda", "entrevista_monitor_P10", "2026-10-27", "confirmado"],
  ["O7", "La entrevista no menciona la inducción de seguridad", "Dato sin fuente institucional: R1 y R2 quedan como supuestos", "entrevista_monitor", "2026-10-27", "desconocido"],
];

const DICCIONARIO: string[][] = [
  ["carne", "texto", "Carné sintético del solicitante", "`C-` u `D-` + 8 dígitos", "carnetización simulada", "Si no existe: desconocido → R17"],
  ["rol", "enumeración", "Rol derivado del prefijo del carné", "estudiante, docente", "carné", "No se pregunta: sale del prefijo"],
  ["vigencia", "enumeración", "Estado del carné en carnetización", "vigente, vencido, desconocida", "carnetización simulada", "desconocida → R17 (escalar)"],
  ["sala", "texto", "Sala pedida o asignada", "sala-1 … sala-16", "solicitud / motor", "null = el motor elige"],
  ["capacidad", "entero", "Puestos de la sala", "10 a 30", "salas (sintético)", "Obligatorio en la semilla"],
  ["computo", "enumeración", "Tipo de sala", "estandar, alto", "salas (sintético)", "Obligatorio en la semilla"],
  ["inventario / mantenimiento", "enumeración", "Estado del equipo según cada fuente", "disponible, mantenimiento, diagnostico, desconocido", "inventario y mantenimiento (sintéticos)", "Distintos → contradictorio (R3, R19); desconocido → R2, R19"],
  ["fecha", "texto", "Día de la reserva", "AAAA-MM-DD, hoy a +30 días", "solicitud", "Falta → R14 (pedir dato)"],
  ["inicio / fin", "texto", "Horario de la reserva", "HH:MM, 07:00–22:00, 30 min a 4 h", "solicitud", "Falta → R14; fuera de rango → R15"],
  ["personas", "entero", "Personas que usarán la sala", "1 a 200", "solicitud", "Falta → R14"],
  ["equipos", "entero", "Computadores requeridos", "0 a 200 (estudiantes: = personas)", "solicitud", "Docente sin dato → R14"],
  ["computo_alto", "booleano", "Si se necesita alto cómputo", "sí, no", "solicitud", "Docente sin dato → R14; estudiante: no"],
  ["materia", "texto", "Espacio académico del docente", "2 a 60 caracteres", "solicitud", "Docente sin dato → R14"],
  ["estado (reserva)", "enumeración", "Estado en la base de demostración", "programada, escalada", "motor de reservas", "Solo `programada` bloquea el horario"],
  ["induccion_seguridad", "enumeración", "Inducción del estudiante (ingreso)", "vigente, vencida, desconocida", "registro de inducciones (sintético)", "desconocida → R2 (escalar)"],
  ["hora_llegada", "texto", "Hora de llegada (asistencia)", "HH:MM", "reloj del sistema", "Sin entrada al cierre → R12 (sin registro)"],
];

const RAIZ = new URL("../", import.meta.url);

export async function c23(): Promise<Seccion> {
  mkdirSync(new URL("conocimiento/", RAIZ), { recursive: true });
  mkdirSync(new URL("datos/", RAIZ), { recursive: true });
  writeFileSync(new URL("conocimiento/hechos.json", RAIZ),
    JSON.stringify({ version: "1.0.0", generado_por: "analisis/c23-representacion.ts", hechos: HECHOS }, null, 2) + "\n");
  const csv = ["id,observacion,hecho_o_regla_candidata,fuente,fecha,estado",
    ...OBSERVACIONES.map((o) => o.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))].join("\n") + "\n";
  writeFileSync(new URL("datos/observaciones.csv", RAIZ), csv);

  const reglas = (JSON.parse(readFileSync(new URL("agent/rules/reglas.json", RAIZ), "utf-8")) as {
    version: string; reglas: { id: string; fuente?: string; vigente_desde?: string }[];
  });
  const conMetadatos = reglas.reglas.filter((r) => r.fuente && r.vigente_desde).length;

  // Consulta funcional: ¿qué hechos no se pueden usar para concluir? (desconocidos y contradictorios)
  const inciertos = HECHOS.filter((h) => h.estado === "desconocido" || h.estado === "contradictorio");

  const md = [
    "**Comprenda.** El conocimiento se guarda en archivos versionados con su fuente, fecha y estado, para que el agente los consulte y para que una persona pueda auditarlos. Equivalencias con los archivos que pide la guía:",
    "",
    tabla(["Pide la guía", "En el proyecto"], [
      ["`datos/observaciones.csv`", `\`datos/observaciones.csv\`: ${OBSERVACIONES.length} observaciones reales de la entrevista`],
      ["`conocimiento/hechos.json`", `\`conocimiento/hechos.json\`: ${HECHOS.length} hechos con fuente, fecha y estado`],
      ["`conocimiento/reglas.json`", `\`agent/rules/reglas.json\` (versión ${reglas.version}): ${reglas.reglas.length} reglas, ${conMetadatos} con fuente y vigencia`],
    ]),
    "",
    "Un archivo JSON no certifica por sí mismo una regla institucional: por eso cada hecho dice si la fuente es la entrevista, la situación del taller o un ejemplo sintético.",
    "",
    "**Diccionario de datos**",
    "",
    tabla(["Campo", "Tipo", "Significado", "Valores permitidos", "Origen", "Si falta o es inválido"], DICCIONARIO),
    "",
    "**Observaciones de campo** (entrevista al monitor, 27-10-2026)",
    "",
    tabla(["Id", "Observación", "Hecho o regla candidata", "Fuente", "Estado"], OBSERVACIONES.map((o) => [o[0], o[1], o[2], o[3], o[5]])),
    "",
    "**Consulta funcional:** hechos que el agente no puede usar para concluir (estado desconocido o contradictorio):",
    "",
    tabla(["Id", "Sujeto", "Valor", "Estado", "Nota"], inciertos.map((h) => [h.id, h.sujeto, h.valor, h.estado, h.nota ?? ""])),
    "",
    "**Discrepancia resuelta (H04 y O5).** La entrevista dice que los casos dudosos los decide la Vicerrectoría académica, y el diseño escalaba al monitor. El equipo lo resolvió sin cambiar el límite del agente: el monitor es la primera instancia humana, recibe todos los escalamientos y decide la acción o remite a coordinación y, en última instancia, a la Vicerrectoría. El agente nunca decide un caso dudoso ni escala directo a la Vicerrectoría.",
  ].join("\n");

  return {
    id: "2.3", titulo: "Representación del conocimiento", uso: "Se usa",
    evidencia: "`conocimiento/hechos.json`, `datos/observaciones.csv`, diccionario de 16 campos, `reglas.json` con fuente y vigencia",
    md,
    verificaciones: [
      ["Al menos 5 hechos con fuente, fecha y estado", HECHOS.length >= 5 && HECHOS.every((h) => h.fuente && h.fecha && h.estado)],
      ["Al menos 5 reglas con fuente y vigencia", conMetadatos >= 5],
      ["Todas las reglas tienen fuente y vigencia", conMetadatos === reglas.reglas.length],
      ["Al menos 5 observaciones de campo", OBSERVACIONES.length >= 5],
    ],
  };
}
