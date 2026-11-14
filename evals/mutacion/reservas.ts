// Pruebas que matan mutantes de enmascarar, ocupadaPublica y evaluarCancelacion (R27) en agent/tools/reservas.ts.
import { enmascarar, evaluarCancelacion, ocupadaPublica } from "../../agent/tools/reservas.js";
import type { ReservaDoc } from "../../agent/tools/esquemas-reservas.js";

let fallos = 0;
const ver = (nombre: string, obtenido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${ok ? "" : ` · obtenido ${JSON.stringify(obtenido)}, esperado ${JSON.stringify(esperado)}`}`);
};

ver("enmascarar", [enmascarar("C-10000002"), enmascarar("D-20000001")], ["C-****0002", "D-****0001"]);
ver("ocupadaPublica: solo inicio, fin, tipo y personas",
  ocupadaPublica({ inicio: "08:00", fin: "10:00", tipo: "clase", personas: 25, codigo: "RS-0002", carne: "D-20000001", materia: "Bases" } as never),
  { inicio: "08:00", fin: "10:00", tipo: "clase", personas: 25 });

const r = (cambios: Partial<ReservaDoc>): ReservaDoc => ({
  codigo: "RS-0001", sala: "sala-6", fecha: "2026-11-10", inicio: "13:00", fin: "15:00", inicio_min: 780, fin_min: 900,
  tipo: "estudiantes", carne: "C-10000002", rol: "estudiante", personas: 5, equipos: 5, computo_alto: false, materia: null,
  estado: "programada", reglas_aplicadas: [], traza: [], version_reglas: "2.2.0", creada: new Date(), origen: "semilla",
  ...cambios,
} as ReservaDoc);
const hoy = { fecha: "2026-11-10", minutos: 780 };
const dec = (x: ReservaDoc | null, carne = "C-10000002", h = hoy) => {
  const d = evaluarCancelacion(x, carne, h);
  return [d.decision, d.motivo, d.reglas_aplicadas];
};
ver("R27: sin reserva", dec(null), ["negar", "no_encontrada", ["R27"]]);
ver("R27: reserva ajena igual que inexistente", dec(r({}), "C-10000001"), ["negar", "no_encontrada", ["R27"]]);
ver("R27: escalada no se cancela", dec(r({ estado: "escalada" }), "C-10000002", { fecha: "2026-11-09", minutos: 0 }), ["negar", "no_programada", ["R27"]]);
ver("R27: cancelada no se cancela", dec(r({ estado: "cancelada" }), "C-10000002", { fecha: "2026-11-09", minutos: 0 }), ["negar", "no_programada", ["R27"]]);
ver("R27: fecha pasada", dec(r({ fecha: "2026-11-09" })), ["negar", "ya_empezo", ["R27"]]);
ver("R27: hoy, empieza justo ahora", dec(r({})), ["negar", "ya_empezo", ["R27"]]);
ver("R27: hoy, empezó hace un minuto", dec(r({}), "C-10000002", { fecha: "2026-11-10", minutos: 781 }), ["negar", "ya_empezo", ["R27"]]);
ver("R27: hoy, empieza en un minuto", dec(r({}), "C-10000002", { fecha: "2026-11-10", minutos: 779 }), ["cancelar", "titular", ["R27"]]);
ver("R27: mañana, aunque la hora ya pasó", dec(r({ fecha: "2026-11-11" }), "C-10000002", { fecha: "2026-11-10", minutos: 1300 }), ["cancelar", "titular", ["R27"]]);
ver("R27: versión de reglas", evaluarCancelacion(r({}), "C-10000002", { fecha: "2026-11-09", minutos: 0 }).version_reglas.length > 0, true);

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
