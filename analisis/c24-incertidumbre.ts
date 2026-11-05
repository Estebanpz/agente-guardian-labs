// 2.4 Incertidumbre: confirmado, falso, desconocido y contradictorio, cada uno con su acción segura.
import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";
import { crearMemoria } from "../agent/store/memoria.js";
import { decidir, solicitud, tabla, type Seccion } from "./comun.js";

const entrada = (id: string) => ({
  id_sintetico: id, laboratorio: "sala-1" as const, franja: "08:00–10:00", tipo_evento: "ingreso" as const,
});

export async function c24(): Promise<Seccion> {
  const sala1 = equipos.filter((q) => q.sala === "sala-1");
  const ing = (id: string) => evaluar(casos[id], entrada(id), sala1);
  const repo = crearMemoria("2026-11-09");
  const res = (p: Parameters<typeof solicitud>[0]) => decidir(repo, solicitud(p));

  const filas = [
    { estado: "confirmado", caso: "P-01 (E-001)", d: ing("E-001"), esperado: "permitir", accion: "Recomendar ingreso y sugerir equipo" },
    { estado: "falso", caso: "P-02 (E-002, inducción vencida)", d: ing("E-002"), esperado: "negar", accion: "Negar uso de equipos y remitir a inducción" },
    { estado: "desconocido", caso: "P-04 (E-005, sin registro de inducción)", d: ing("E-005"), esperado: "escalar", accion: "No concluir; decir qué falta y escalar" },
    { estado: "contradictorio", caso: "P-05 (E-008, PC-07 en dos estados)", d: ing("E-008"), esperado: "escalar", accion: "No elegir una fuente; escalar y avisar a mantenimiento" },
  ];
  const r10 = await res({ carne: "C-10000011", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 });
  const r11 = await res({ carne: "C-99999999", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 });
  const r05 = await res({ carne: "D-20000001", sala: "sala-12", inicio: "10:00", fin: "12:00", personas: 14, equipos: 14, computo_alto: false, materia: "Redes" });
  const r06 = await res({ carne: "D-20000001", sala: "sala-9", inicio: "10:00", fin: "12:00", personas: 20, equipos: 20, computo_alto: false, materia: "Redes" });
  const r01 = await res({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 });

  const md = [
    "**Comprenda.** La incertidumbre aquí no es probabilidad: es no tener el dato (desconocido) o tener dos fuentes que no coinciden (contradictorio). El agente los trata distinto de un dato falso, y cada estado lleva a una acción segura.",
    "",
    "**Ingreso (motor R1–R13)**",
    "",
    tabla(["Estado", "Prueba", "Esperado", "Observado", "Reglas", "Acción segura"],
      filas.map((f) => [f.estado, f.caso, f.esperado, f.d.decision, f.d.reglas_aplicadas.join(", "), f.accion])),
    "",
    "**Reservas (motor R14–R26).** Aquí el estado sale explícito en el contrato de salida (`estado`):",
    "",
    tabla(["Prueba", "Situación", "estado", "Decisión", "Reglas"], [
      ["RS-01", "Todo en regla", r01.estado, r01.decision, r01.reglas_aplicadas.join(", ")],
      ["RS-10", "Carné vencido", r10.estado, r10.decision, r10.reglas_aplicadas.join(", ")],
      ["RS-11", "Carné que no aparece en carnetización", r11.estado, r11.decision, r11.reglas_aplicadas.join(", ")],
      ["RS-05", "Equipos que solo alcanzan contando dos sin dato", r05.estado, r05.decision, r05.reglas_aplicadas.join(", ")],
      ["RS-06", "Equipos que solo alcanzan contando uno en conflicto", r06.estado, r06.decision, r06.reglas_aplicadas.join(", ")],
    ]),
    "",
    "Diferencia clave: un carné **vencido** (falso) se niega porque hay una fuente que lo dice; un carné que **no aparece** (desconocido) no se niega ni se acepta, se escala a una persona.",
  ].join("\n");

  return {
    id: "2.4", titulo: "Incertidumbre", uso: "Se usa",
    evidencia: "4 pruebas de ingreso (P-01, P-02, P-04, P-05) y 5 de reservas con `estado` explícito",
    md,
    verificaciones: [
      ...filas.map((f) => [`${f.caso} → ${f.esperado}`, f.d.decision === f.esperado] as [string, boolean]),
      ["RS-01 confirmado", r01.estado === "confirmado"],
      ["RS-10 falso", r10.estado === "falso"],
      ["RS-11 desconocido", r11.estado === "desconocido"],
      ["RS-05 desconocido", r05.estado === "desconocido"],
      ["RS-06 contradictorio", r06.estado === "contradictorio"],
    ],
  };
}
