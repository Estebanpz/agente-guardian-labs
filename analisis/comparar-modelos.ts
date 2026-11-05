// Compara proveedores de modelo (Ollama local frente a Vercel AI Gateway) en las dos tareas que el modelo
// tiene en el agente: clasificar la intención y redactar la explicación. Las decisiones no cambian, porque las
// toma el motor de reglas.
// Uso: npm run comparar-modelos                                   (proveedor del .env)
//      PROVEEDOR=vercel MODELO_VERCEL=nvidia/nemotron-3.5-lightning-free MODELOS_RESPALDO= npm run comparar-modelos
// Cada ejecución guarda docs/contenidos/modelos/<proveedor>.json y regenera docs/contenidos/comparacion-modelos.md
// con todas las ejecuciones guardadas.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { interpretar, rutaRapida } from "../agent/llm/interprete.js";
import { esIntentoDeElusion } from "../agent/llm/guardia.js";
import { redactar } from "../agent/llm/redactor.js";
import { proveedorActivo } from "../agent/llm/proveedor.js";
import { evaluar } from "../agent/tools/motor.js";
import { casos } from "../data/casos.js";
import { equipos } from "../data/equipos.js";
import { leerCsv } from "./c31-c32-aprendizaje.js";
import { num, pct, tabla } from "./comun.js";

const DIR = new URL("../docs/contenidos/modelos/", import.meta.url);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Los modelos gratis de Vercel permiten 5 solicitudes por minuto: 13 s entre llamadas (ajustable con PAUSA_MS).
const PAUSA = Number(process.env.PAUSA_MS ?? (process.env.PROVEEDOR === "vercel" ? 13000 : 0));

type Corrida = {
  proveedor: string; fecha: string; total: number; aciertos: number; aciertos_agente: number; sin_respuesta: number;
  latencia_media_ms: number;
  predicciones: { id: string; texto: string; real: string; modelo: string; agente: string; ms: number }[];
  explicaciones: { caso: string; decision: string; reglas: string; texto: string; ms: number }[];
};

async function medir<T>(f: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const r = await f();
  return [r, Math.round(performance.now() - t)];
}

// Reanudable: con TIEMPO_MAX_S (por defecto sin límite) guarda el avance en <proveedor>.parcial.json y termina;
// la siguiente ejecución continúa donde quedó. Útil con el límite de 5 solicitudes por minuto del plan gratis.
const LIMITE_MS = Number(process.env.TIEMPO_MAX_S ?? 0) * 1000;
const INICIO = performance.now();
const SLUG = proveedorActivo().replace(/[^a-z0-9.-]+/gi, "_");
const PARCIAL = new URL(`${SLUG}.parcial.json`, DIR);
type Parcial = { predicciones: Corrida["predicciones"]; explicaciones: Corrida["explicaciones"] };
const sinTiempo = () => LIMITE_MS > 0 && performance.now() - INICIO > LIMITE_MS;

async function correr(): Promise<Corrida | null> {
  mkdirSync(DIR, { recursive: true });
  let previo: Parcial = { predicciones: [], explicaciones: [] };
  try { previo = JSON.parse(readFileSync(PARCIAL, "utf-8")) as Parcial; } catch { /* empieza de cero */ }
  const guardar = () => writeFileSync(PARCIAL, JSON.stringify({ predicciones, explicaciones }, null, 2));
  const prueba = leerCsv(new URL("../datos/consultas_etiquetadas.csv", import.meta.url)).filter((d) => d.conjunto === "prueba");
  const predicciones: Corrida["predicciones"] = previo.predicciones;
  const explicaciones: Corrida["explicaciones"] = previo.explicaciones;
  for (const d of prueba) {
    if (predicciones.some((p) => p.id === d.id)) continue;
    if (sinTiempo()) { guardar(); return null; }
    let [r, ms] = await medir(() => interpretar(d.texto));
    if (r.fallo && /429|rate/i.test(r.fallo)) { // un reintento si el plan gratis limita
      await esperar(61000);
      [r, ms] = await medir(() => interpretar(d.texto));
    }
    const modelo = r.fallo ? "(sin respuesta)" : r.intencion;
    // Mismo orden que agent/orquestador.ts: guardia → rutas rápidas → modelo.
    const agente = esIntentoDeElusion(d.texto) ? "intento_eludir_reglas" : (rutaRapida(d.texto) ?? modelo);
    predicciones.push({ id: d.id, texto: d.texto, real: d.intencion, modelo, agente, ms });
    process.stdout.write(`${modelo === d.intencion ? "✅" : "❌"} ${d.id} ${modelo} (${ms} ms)\n`);
    await esperar(PAUSA);
  }

  // Redacción: tres decisiones del motor; el texto se revisa a mano (P-07 invertía el sentido de R6 con llama3.2:3b).
  const entrada = (id: string) => ({ id_sintetico: id, laboratorio: "sala-1" as const, franja: "08:00–10:00", tipo_evento: "ingreso" as const });
  const sala1 = equipos.filter((q) => q.sala === "sala-1");
  for (const caso of ["E-002", "E-009", "E-006"]) {
    if (explicaciones.some((e) => e.caso === caso)) continue;
    if (sinTiempo()) { guardar(); return null; }
    const dec = evaluar(casos[caso], entrada(caso), sala1);
    let texto: string, ms: number;
    try {
      [texto, ms] = await medir(() => redactar(dec));
    } catch (e) {
      texto = `(sin respuesta: ${(e as Error).message.slice(0, 80)})`; ms = 0;
    }
    explicaciones.push({ caso, decision: dec.decision, reglas: dec.reglas_aplicadas.join(", "), texto: texto.replace(/\s+/g, " ").trim(), ms });
    await esperar(PAUSA);
  }

  const sinRespuesta = predicciones.filter((p) => p.modelo === "(sin respuesta)").length;
  // Sin las respuestas que no llamaron al modelo (0 ms: la guardia interna de interpretar) ni las fallidas.
  const conTiempo = predicciones.filter((p) => p.modelo !== "(sin respuesta)" && p.ms > 0);
  return {
    proveedor: proveedorActivo(), fecha: new Date().toISOString(), total: prueba.length,
    aciertos: predicciones.filter((p) => p.modelo === p.real).length,
    aciertos_agente: predicciones.filter((p) => p.agente === p.real).length,
    sin_respuesta: sinRespuesta,
    latencia_media_ms: conTiempo.length ? Math.round(conTiempo.reduce((a, p) => a + p.ms, 0) / conTiempo.length) : 0,
    predicciones, explicaciones,
  };
}

// Mediana: no la mueve la primera llamada, que en Ollama incluye cargar el modelo en memoria.
function mediana(c: Corrida): number {
  const xs = c.predicciones.filter((p) => p.modelo !== "(sin respuesta)" && p.ms > 0).map((p) => p.ms).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2);
}

function informe(corridas: Corrida[]): string {
  const ids = corridas[0].predicciones.map((p) => p.id);
  const corto = (s: string) => s.replace("consulta_", "c_").replace("solicitud_", "s_").replace("intento_eludir_reglas", "eludir")
    .replace("fuera_de_alcance", "fuera").replace("registro_usuario", "registro");
  const nombre = (c: Corrida) => c.proveedor.replace(/^vercel:/, "vercel: ").replace(/^ollama:/, "ollama: ");
  return [
    "# Comparación de modelos: Ollama local frente a Vercel AI Gateway",
    "",
    "Generado por `npm run comparar-modelos` (`analisis/comparar-modelos.ts`). Mismas 24 frases de prueba de `datos/consultas_etiquetadas.csv` y mismas tres decisiones del motor. **Las decisiones no dependen del modelo**: aquí solo cambia cómo se clasifica la intención y cómo se redacta la explicación.",
    "",
    "## Clasificación de la intención",
    "",
    tabla(["Proveedor y modelo", "Modelo solo", "Como el agente (guardia → rutas → modelo)", "Sin respuesta", "Latencia media", "Latencia mediana", "Fecha"],
      corridas.map((c) => [nombre(c), `${c.aciertos}/${c.total} (${pct(c.aciertos / c.total)})`,
        `${c.aciertos_agente}/${c.total} (${pct(c.aciertos_agente / c.total)})`, c.sin_respuesta,
        `${num(c.latencia_media_ms / 1000, 1)} s`, `${num(mediana(c) / 1000, 1)} s`, c.fecha.slice(0, 16).replace("T", " ")])),
    "",
    "## Frase por frase (respuesta del modelo solo)",
    "",
    tabla(["Id", "Frase", "Real", ...corridas.map(nombre)],
      ids.map((id) => {
        const p0 = corridas[0].predicciones.find((p) => p.id === id)!;
        return [id, p0.texto, corto(p0.real), ...corridas.map((c) => {
          const p = c.predicciones.find((x) => x.id === id)!;
          return `${p.modelo === p.real ? "✅" : "❌"} ${corto(p.modelo)}`;
        })];
      })),
    "",
    "## Redacción de la explicación (revisión humana)",
    "",
    "E-009 es el caso P-07: la aprobación de coordinación fue solo verbal y R6 no la acepta. Con llama3.2:3b la explicación llegó a invertir ese sentido.",
    "",
    ...corridas.flatMap((c) => [
      `### ${nombre(c)}`, "",
      tabla(["Caso", "Decisión del motor", "Explicación del modelo", "Tiempo"],
        c.explicaciones.map((e) => [e.caso, `${e.decision} [${e.reglas}]`, e.texto, `${num(e.ms / 1000, 1)} s`])),
      "",
    ]),
    "**Privacidad y límites.** Con Vercel el texto sale del equipo hacia un servicio en la nube; las frases son sintéticas, pero con datos reales no sería aceptable. Los modelos gratuitos pueden limitar las solicitudes por minuto y, según el listado del gateway, no garantizan que el proveedor no use los datos para entrenar. El taller exige el modelo local, así que esta comparación es de referencia.",
    "",
  ].join("\n");
}

const corrida = await correr();
if (!corrida) {
  console.log(`\nAvance guardado en docs/contenidos/modelos/${SLUG}.parcial.json; vuelva a ejecutar para continuar.`);
  process.exit(0);
}
writeFileSync(new URL(`${SLUG}.json`, DIR), JSON.stringify(corrida, null, 2) + "\n");
rmSync(PARCIAL, { force: true });
const todas = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".parcial.json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf-8")) as Corrida)
  .sort((a, b) => a.proveedor.localeCompare(b.proveedor));
writeFileSync(new URL("../comparacion-modelos.md", DIR), informe(todas));
console.log(`\n${corrida.proveedor}: modelo ${corrida.aciertos}/${corrida.total}, agente ${corrida.aciertos_agente}/${corrida.total}, ` +
  `sin respuesta ${corrida.sin_respuesta}, latencia media ${corrida.latencia_media_ms} ms · docs/contenidos/comparacion-modelos.md`);
