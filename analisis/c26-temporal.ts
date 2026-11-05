// 2.6 Razonamiento probabilista en el tiempo: cadena de Markov del estado de los equipos.
// Se estima la matriz de transición a partir de una secuencia SIMULADA y se pronostica el día siguiente.
import { num, rng, tabla, type Seccion } from "./comun.js";

const ESTADOS = ["disponible", "diagnostico", "mantenimiento"] as const;
type E = 0 | 1 | 2;
// Transición "verdadera" del simulador (fila = hoy, columna = mañana).
const T: number[][] = [
  [0.95, 0.04, 0.01],
  [0.5, 0.3, 0.2],
  [0.3, 0.1, 0.6],
];
const EQUIPOS = 60;
const DIAS = 31; // 30 transiciones por equipo

function siguiente(e: E, u: number): E {
  const fila = T[e];
  return (u < fila[0] ? 0 : u < fila[0] + fila[1] ? 1 : 2) as E;
}

export async function c26(): Promise<Seccion> {
  const azar = rng(1104);
  const conteo = ESTADOS.map(() => ESTADOS.map(() => 0));
  const ultimo: E[] = [];
  for (let q = 0; q < EQUIPOS; q++) {
    let e: E = azar() < 0.85 ? 0 : azar() < 0.5 ? 1 : 2;
    for (let d = 1; d < DIAS; d++) {
      const n = siguiente(e, azar());
      conteo[e][n]++;
      e = n;
    }
    ultimo.push(e);
  }
  const T2 = conteo.map((fila) => {
    const s = fila.reduce((a, b) => a + b, 0);
    return fila.map((x) => (s ? x / s : 0));
  });
  const transiciones = conteo.flat().reduce((a, b) => a + b, 0);

  // Dos momentos: un equipo en diagnóstico hoy.
  const pDisp = T2[1][0];
  // Toda la flota: distribución de hoy (último día simulado) → mañana.
  const hoy = ESTADOS.map((_, i) => ultimo.filter((x) => x === i).length / EQUIPOS);
  const manana = ESTADOS.map((_, j) => hoy.reduce((acc, p, i) => acc + p * T2[i][j], 0));

  const md = [
    "**Comprenda.** Un modelo temporal actualiza la estimación con la secuencia de estados, no solo con el último dato. Un registro con fecha, por sí solo, no es un modelo temporal.",
    "",
    `**Datos.** Secuencia **simulada** (semilla 1104) del estado diario de ${EQUIPOS} equipos durante ${DIAS} días: ${transiciones} transiciones observadas. No son registros reales de mantenimiento.`,
    "",
    "**Matriz de transición estimada** (fila = estado hoy, columna = estado mañana; conteos entre paréntesis):",
    "",
    tabla(["Hoy \\ Mañana", ...ESTADOS], ESTADOS.map((e, i) => [e, ...T2[i].map((p, j) => `${num(p)} (${conteo[i][j]})`)])),
    "",
    "**Operación de dos momentos.** Un equipo está hoy en diagnóstico, así que P(hoy) = [0; 1; 0]:",
    "",
    `P(disponible mañana) = 0 × ${num(T2[0][0])} + 1 × ${num(pDisp)} + 0 × ${num(T2[2][0])} = **${num(pDisp)}**`,
    "",
    "Para la flota completa (último día simulado):",
    "",
    tabla(["Momento", ...ESTADOS], [
      ["Hoy (observado)", ...hoy.map((p) => num(p))],
      ["Mañana (pronóstico = hoy × T)", ...manana.map((p) => num(p))],
    ]),
    "",
    `**Conclusión y supuestos.** Supone que el cambio de estado depende solo del estado de hoy (propiedad de Markov) y que la matriz no cambia con el tiempo. Sirve para **anticipar** (por ejemplo, avisar a mantenimiento si se espera que muchos equipos de una sala sigan en diagnóstico mañana). **El agente no lo usa para decidir**: R9 y R19 exigen que inventario y mantenimiento digan "disponible" hoy; una probabilidad de ${num(pDisp)} no convierte un equipo en disponible. No hay evidencia para producción: la entrevista no cubrió registros de mantenimiento.`,
  ].join("\n");

  return {
    id: "2.6", titulo: "Razonamiento probabilista en el tiempo", uso: "Ejemplo, no se usa en producción",
    evidencia: `Matriz de transición con ${transiciones} transiciones y pronóstico de dos momentos`,
    md,
    verificaciones: [
      ["Cada fila de la matriz suma 1", T2.every((f) => Math.abs(f.reduce((a, b) => a + b, 0) - 1) < 1e-9)],
      ["La matriz estimada queda a menos de 0,1 de la del simulador", T2.every((f, i) => f.every((p, j) => Math.abs(p - T[i][j]) < 0.1))],
      ["El pronóstico de mañana suma 1", Math.abs(manana.reduce((a, b) => a + b, 0) - 1) < 1e-9],
    ],
  };
}
