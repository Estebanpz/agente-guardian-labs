// 2.5 Razonamiento probabilista: frecuencia de ocupación por franja en un historial SIMULADO.
// La frecuencia es descriptiva: no concede permisos ni sustituye las reglas.
import { num, rng, tabla, wilson, type Seccion } from "./comun.js";

const FRANJAS = ["07–09", "09–11", "11–13", "13–15", "15–17", "17–19", "19–21"];
// Probabilidad "verdadera" del simulador (desconocida en la vida real; solo sirve para validar el método).
const VERDAD = [0.3, 0.7, 0.6, 0.4, 0.55, 0.45, 0.2];
const SEMANAS = 8;
const DIAS = SEMANAS * 5;   // lunes a viernes
const SALAS = 16;

export async function c25(): Promise<Seccion> {
  const azar = rng(2026);
  const ocupadas = FRANJAS.map(() => 0);
  const ocupadasAlto = FRANJAS.map(() => 0);
  for (let d = 0; d < DIAS; d++) {
    for (let s = 1; s <= SALAS; s++) {
      FRANJAS.forEach((_, f) => {
        // Las salas de alto cómputo (14–16) se piden un poco más en la mañana.
        const p = s >= 14 ? Math.min(0.95, VERDAD[f] + 0.1) : VERDAD[f];
        if (azar() < p) {
          ocupadas[f]++;
          if (s >= 14) ocupadasAlto[f]++;
        }
      });
    }
  }
  const n = DIAS * SALAS;
  const nAlto = DIAS * 3;
  const frec = ocupadas.map((o) => o / n);
  const filas = FRANJAS.map((fr, i) => {
    const [a, b] = wilson(ocupadas[i], n);
    return [fr, n, ocupadas[i], num(frec[i]), `${num(a)} – ${num(b)}`, num(ocupadasAlto[i] / nAlto)];
  });
  const iMax = frec.indexOf(Math.max(...frec));
  const iMin = frec.indexOf(Math.min(...frec));

  const md = [
    "**Comprenda.** Una frecuencia estima qué tan seguido pasa algo en los registros observados; no prueba que vaya a pasar en un caso concreto.",
    "",
    `**Datos.** Historial **simulado** (semilla fija 2026) de ${SEMANAS} semanas hábiles (${DIAS} días) × ${SALAS} salas × ${FRANJAS.length} franjas de 2 h. Cada celda es "ocupada" o "libre". Muestra por franja: n = ${n} (${nAlto} en las salas de alto cómputo). Fuente: \`analisis/c25-probabilista.ts\`. No son estadísticas de UniEspinal.`,
    "",
    tabla(["Franja", "n", "Ocupadas", "Frecuencia", "Intervalo 95 % (Wilson)", "Frecuencia alto cómputo"], filas),
    "",
    `**Cálculo de ejemplo:** franja ${FRANJAS[iMax]}: ${ocupadas[iMax]}/${n} = ${num(frec[iMax])}. Es la más ocupada; la menos ocupada es ${FRANJAS[iMin]} (${num(frec[iMin])}).`,
    "",
    "**Comparación con las reglas.** Para una fecha concreta el agente **no estima**: consulta las reservas programadas de ese día (un hecho) y aplica R18–R25. La frecuencia solo serviría para orientar, por ejemplo para sugerir primero las franjas menos ocupadas cuando no hay sala libre (R24). Nunca cambia una decisión: si la sala está libre, se programa aunque la franja suela estar llena, y si está ocupada, se escala o se niega aunque suela estar libre.",
    "",
    "**Límites y decisión.** Los datos son simulados y el intervalo depende del tamaño de muestra: si se mirara una sola sala (n = 40 por franja), sería mucho más ancho. La entrevista dice que el horario está en Excel, pero no se obtuvo ese historial. **No se incorpora a la versión real** hasta tener registros reales autorizados de varias semanas; con ellos, este mismo cálculo se repetiría sin cambiar código.",
  ].join("\n");

  return {
    id: "2.5", titulo: "Razonamiento probabilista", uso: "Ejemplo, no se usa en producción",
    evidencia: `Frecuencias por franja con n = ${n}, intervalo de Wilson y límites`,
    md,
    verificaciones: [
      ["Las frecuencias quedan a menos de 0,06 del valor del simulador", frec.every((f, i) => Math.abs(f - VERDAD[i]) < 0.06)],
      ["Muestra por franja = 640", n === 640],
    ],
  };
}
