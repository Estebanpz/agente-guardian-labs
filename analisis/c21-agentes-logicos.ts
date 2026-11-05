// 2.1 Agentes lógicos: dos trazas, una con la regla activada y otra con la regla no activada.
import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";
import { crearMemoria } from "../agent/store/memoria.js";
import { decidir, solicitud, tabla, type Seccion } from "./comun.js";

const entrada = (id: string) => ({
  id_sintetico: id, laboratorio: "sala-1" as const, franja: "08:00–10:00", tipo_evento: "ingreso" as const,
});

export async function c21(): Promise<Seccion> {
  const sala1 = equipos.filter((q) => q.sala === "sala-1");
  const activa = evaluar(casos["E-001"], entrada("E-001"), sala1);
  const noActiva = evaluar(casos["E-005"], entrada("E-005"), sala1);

  const repo = crearMemoria("2026-11-09");
  const rs01 = await decidir(repo, solicitud({ carne: "C-10000001", sala: "sala-4", inicio: "10:00", fin: "12:00", personas: 5 }));
  const rs09 = await decidir(repo, solicitud({ carne: "C-10000003", sala: "sala-6", inicio: "14:00", fin: "15:00", personas: 3 }));

  const md = [
    "**Comprenda.** El agente decide con hechos verificables y reglas explícitas (`agent/rules/reglas.json`, versión 2.0.0), y cada conclusión deja una traza. El motor de ingreso (`agent/tools/motor.ts`) aplica R1–R13 y el de reservas (`agent/tools/reservas.ts`) aplica R14–R26, ordenadas por prioridad y especificidad.",
    "",
    "**Evidencia: dos trazas por motor.**",
    "",
    tabla(["Caso", "Hechos clave", "Decisión", "Reglas", "Traza"], [
      ["E-001 (R10 activada)", "todo en regla", activa.decision, activa.reglas_aplicadas.join(", "), activa.traza.join(" → ")],
      ["E-005 (R10 no activada)", "inducción desconocida", noActiva.decision, noActiva.reglas_aplicadas.join(", "), noActiva.traza.join(" → ")],
      ["RS-01 (R25 activada)", "sala-4 libre, 5 personas", rs01.decision, rs01.reglas_aplicadas.join(", "), rs01.traza.join(" → ")],
      ["RS-09 (R25 no activada)", "sala-6 ocupada por estudiantes", rs09.decision, rs09.reglas_aplicadas.join(", "), rs09.traza.join(" → ")],
    ]),
    "",
    "En E-005 la regla R10 (recomendar ingreso) no se activa porque R2 (dato crítico desconocido) es bloqueante y tiene más prioridad. En RS-09 la regla R25 (programar) no se activa porque R22 (choque de horario, solicitante estudiante) bloquea antes. La acción segura en ambos casos es escalar o negar con el motivo, nunca permitir por omisión.",
  ].join("\n");

  return {
    id: "2.1", titulo: "Agentes lógicos", uso: "Se usa",
    evidencia: "`reglas.json` 2.0.0 + 4 trazas (2 activadas, 2 no activadas)",
    md,
    verificaciones: [
      ["E-001 activa R10", activa.reglas_aplicadas.includes("R10")],
      ["E-005 no activa R10 y sí R2", !noActiva.reglas_aplicadas.includes("R10") && noActiva.reglas_aplicadas.includes("R2")],
      ["RS-01 programa con R25", rs01.decision === "programar" && rs01.reglas_aplicadas.includes("R25")],
      ["RS-09 niega con R22, sin R25", rs09.decision === "negar" && rs09.reglas_aplicadas.includes("R22") && !rs09.reglas_aplicadas.includes("R25")],
    ],
  };
}
