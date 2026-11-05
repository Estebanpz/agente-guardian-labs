// 3.3 Aprendizaje por refuerzo: simulación SEGURA y separada del agente.
// Q-learning aprende cuándo preguntar un dato y cuándo proponer la reserva.
// Nunca se entrena con decisiones institucionales reales ni con usuarios.
import { num, rng, tabla, type Seccion } from "./comun.js";

const ACCIONES = ["preguntar", "proponer"] as const;
type Accion = 0 | 1;
const MAX_FALTANTES = 4;          // estado = cuántos datos obligatorios faltan (0..4)
const R_TURNO = -1, R_BIEN = 10, R_MAL = -10;
const ALFA = 0.1, GAMMA = 0.9, EPSILON = 0.1, EPISODIOS = 2000, MAX_PASOS = 10;

// Entorno simulado: preguntar reduce en 1 los faltantes (si quedan); proponer termina el episodio.
function paso(k: number, a: Accion): { k: number; r: number; fin: boolean } {
  if (a === 1) return { k, r: k === 0 ? R_BIEN : R_MAL, fin: true };
  return { k: Math.max(0, k - 1), r: R_TURNO, fin: false };
}

function episodio(politica: (k: number) => Accion, inicio: number) {
  let k = inicio, total = 0;
  for (let t = 0; t < MAX_PASOS; t++) {
    const s = paso(k, politica(k));
    total += s.r; k = s.k;
    if (s.fin) break;
  }
  return total;
}

export async function c33(): Promise<Seccion> {
  const azar = rng(33);
  const Q = Array.from({ length: MAX_FALTANTES + 1 }, () => [0, 0]);
  const curva: number[] = [];
  for (let e = 0; e < EPISODIOS; e++) {
    let k = 1 + Math.floor(azar() * MAX_FALTANTES);
    let total = 0;
    for (let t = 0; t < MAX_PASOS; t++) {
      const a: Accion = azar() < EPSILON ? (azar() < 0.5 ? 0 : 1) : (Q[k][0] >= Q[k][1] ? 0 : 1);
      const s = paso(k, a);
      const objetivo = s.fin ? s.r : s.r + GAMMA * Math.max(...Q[s.k]);
      Q[k][a] += ALFA * (objetivo - Q[k][a]);
      total += s.r; k = s.k;
      if (s.fin) break;
    }
    curva.push(total);
  }
  const politica = (k: number): Accion => (Q[k][0] >= Q[k][1] ? 0 : 1);
  const disenada = (k: number): Accion => (k > 0 ? 0 : 1); // lo que hace agent/conversacion.ts
  const coincide = Array.from({ length: MAX_FALTANTES + 1 }, (_, k) => politica(k) === disenada(k)).every(Boolean);

  const eval100 = (p: (k: number) => Accion) => {
    const a = rng(99);
    let s = 0;
    for (let i = 0; i < 100; i++) s += episodio(p, 1 + Math.floor(a() * MAX_FALTANTES));
    return s / 100;
  };
  const azarP = rng(7);
  const promedio = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Antes de entrenar, Q = 0 en todo: en el empate elige "preguntar" y nunca propone.
  const antes = eval100(() => 0);
  const despues = eval100(politica);
  const optima = eval100(disenada);
  const alAzar = eval100(() => (azarP() < 0.5 ? 0 : 1));

  const md = [
    "**Comprenda.** En aprendizaje por refuerzo un agente aprende una política probando acciones en un entorno y recibiendo recompensas. No equivale a guardar la satisfacción del usuario ni a corregir instrucciones del modelo.",
    "",
    "**Diseño estado–acción–recompensa** (simulador en `analisis/c33-refuerzo.ts`, separado del agente):",
    "",
    tabla(["Elemento", "Definición"], [
      ["Estado", `Cuántos datos obligatorios faltan para la reserva (0 a ${MAX_FALTANTES})`],
      ["Acciones", "Preguntar un dato · Proponer la reserva"],
      ["Transición", "Preguntar quita un faltante (el usuario responde); proponer termina el episodio"],
      ["Recompensa", `${R_TURNO} por cada pregunta (turno extra); ${R_BIEN} si propone sin faltantes; ${R_MAL} si propone con faltantes`],
      ["Episodios", `${EPISODIOS}, Q-learning con α = ${num(ALFA, 1)}, γ = ${num(GAMMA, 1)}, ε = ${num(EPSILON, 1)}, semilla 33`],
    ]),
    "",
    "```mermaid\nstateDiagram-v2\n  [*] --> F4\n  F4 --> F3: preguntar (−1)\n  F3 --> F2: preguntar (−1)\n  F2 --> F1: preguntar (−1)\n  F1 --> F0: preguntar (−1)\n  F0 --> [*]: proponer (+10)\n  F1 --> [*]: proponer con faltantes (−10)\n```",
    "",
    "**Resultados**",
    "",
    tabla(["Faltantes", "Q(preguntar)", "Q(proponer)", "Política aprendida", "Política diseñada en el chat"],
      Q.map((q, k) => [k, num(q[0]), num(q[1]), ACCIONES[politica(k)], ACCIONES[disenada(k)]])),
    "",
    "Recompensa media en 100 episodios de evaluación (sin exploración, mismos estados iniciales):",
    "",
    tabla(["Política", "Recompensa media"], [
      ["Antes de entrenar (Q = 0: siempre pregunta y nunca propone)", num(antes)],
      ["Al azar", num(alAzar)],
      ["Aprendida con Q-learning", num(despues)],
      ["Diseñada en `agent/conversacion.ts`", num(optima)],
    ]),
    "",
    `Durante el entrenamiento la recompensa media de los últimos 100 episodios fue ${num(promedio(curva.slice(-100)))}; es menor que la de evaluación porque el 10 % de las acciones se toman al azar para explorar.`,
    "",
    `**Conclusión y justificación de no uso.** La política aprendida ${coincide ? "**coincide**" : "**no coincide**"} con la que ya está programada en \`agent/conversacion.ts\`: preguntar mientras falte algo y proponer solo cuando está completo. El refuerzo **no se incorpora** al agente real por tres razones: (1) la política correcta ya se conoce y se puede escribir como regla verificable; (2) aprender "probando" sobre reservas reales significaría proponer reservas incompletas a estudiantes y docentes para recibir la penalización, algo que la guía prohíbe; (3) no hay una recompensa institucional medible y autorizada. El ejemplo se conserva como simulación de aula.`,
  ].join("\n");

  return {
    id: "3.3", titulo: "Aprendizaje por refuerzo", uso: "Justificado, no se usa",
    evidencia: `Simulación Q-learning de ${EPISODIOS} episodios; la política aprendida ${coincide ? "coincide" : "no coincide"} con la diseñada`,
    md,
    verificaciones: [
      ["La política aprendida coincide con la diseñada", coincide],
      ["La política aprendida supera a la inicial y a la de azar", despues > antes && despues > alAzar],
      ["La política aprendida rinde igual que la diseñada", Math.abs(despues - optima) < 1e-9],
    ],
  };
}
