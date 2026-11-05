// 3.1 Aprendizaje de observaciones y 3.2 Métodos estadísticos de aprendizaje.
// Compara la capa determinista actual (palabras clave) con un clasificador Naive Bayes multinomial
// entrenado con frases etiquetadas, separando ajuste y prueba. Con --llm agrega el modelo local.
import { readFileSync } from "node:fs";
import { esIntentoDeElusion } from "../agent/llm/guardia.js";
import { rutaRapida, interpretar } from "../agent/llm/interprete.js";
import { temasDe } from "../agent/tools/ayuda.js";
import { pct, tabla, type Seccion } from "./comun.js";

type Fila = { id: string; texto: string; intencion: string; conjunto: "ajuste" | "prueba" };

export function leerCsv(ruta: URL): Fila[] {
  const lineas = readFileSync(ruta, "utf-8").trim().split("\n").slice(1);
  return lineas.map((l) => {
    const celdas: string[] = [];
    let actual = "", comillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"' && l[i + 1] === '"' && comillas) { actual += '"'; i++; }
      else if (ch === '"') comillas = !comillas;
      else if (ch === "," && !comillas) { celdas.push(actual); actual = ""; }
      else actual += ch;
    }
    celdas.push(actual);
    return { id: celdas[0], texto: celdas[1], intencion: celdas[2], conjunto: celdas[3] as Fila["conjunto"] };
  });
}

// Línea base: la capa determinista que el agente ya tiene, sin modelo.
export function lineaBase(texto: string): string {
  if (esIntentoDeElusion(texto)) return "intento_eludir_reglas";
  const r = rutaRapida(texto);
  if (r) return r;
  if (/\bE-\d{3}\b/i.test(texto)) return "consulta_ingreso";
  const temas = temasDe(texto);
  if (temas.includes("salas")) return "consulta_salas";
  if (temas.includes("reserva")) return "solicitud_reserva";
  if (temas.length) return "ayuda";
  return "fuera_de_alcance";
}

const VACIAS = new Set("el la los las de del y a en un una que me mi para por con es se lo al o su tu le".split(" "));
export function fichas(texto: string): string[] {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/\be-\d{3}\b/g, " tokid ").replace(/\b[cd]-\d{8}\b/g, " tokcarne ").replace(/\d+/g, " toknum ")
    .split(/[^a-zñ]+/).filter((t) => t && !VACIAS.has(t));
}

// Naive Bayes multinomial con suavizado de Laplace (alfa = 1).
export function entrenar(datos: Fila[]) {
  const clases = [...new Set(datos.map((d) => d.intencion))];
  const vocab = new Set<string>();
  const cuenta: Record<string, Record<string, number>> = {};
  const total: Record<string, number> = {};
  const docs: Record<string, number> = {};
  for (const c of clases) { cuenta[c] = {}; total[c] = 0; docs[c] = 0; }
  for (const d of datos) {
    docs[d.intencion]++;
    for (const t of fichas(d.texto)) {
      vocab.add(t);
      cuenta[d.intencion][t] = (cuenta[d.intencion][t] ?? 0) + 1;
      total[d.intencion]++;
    }
  }
  const V = vocab.size;
  return {
    vocab: V,
    predecir(texto: string): string {
      let mejor = clases[0], max = -Infinity;
      for (const c of clases) {
        let lp = Math.log(docs[c] / datos.length);
        for (const t of fichas(texto)) lp += Math.log(((cuenta[c][t] ?? 0) + 1) / (total[c] + V));
        if (lp > max) { max = lp; mejor = c; }
      }
      return mejor;
    },
  };
}

export async function c31c32(conModelo = false): Promise<Seccion> {
  const datos = leerCsv(new URL("../datos/consultas_etiquetadas.csv", import.meta.url));
  const ajuste = datos.filter((d) => d.conjunto === "ajuste");
  const prueba = datos.filter((d) => d.conjunto === "prueba");
  const clases = [...new Set(datos.map((d) => d.intencion))];
  const nb = entrenar(ajuste);

  const pred = prueba.map((d) => ({
    ...d,
    base: lineaBase(d.texto),
    nb: nb.predecir(d.texto),
    llm: undefined as string | undefined,
    agente: undefined as string | undefined,
  }));
  if (conModelo) {
    for (const p of pred) {
      const r = await interpretar(p.texto);
      p.llm = r.fallo ? "(sin modelo)" : r.intencion;
      // Mismo orden que agent/orquestador.ts: guardia → rutas rápidas → modelo.
      // (Los temas de ayuda y el id E-000 se usan después, no antes del modelo.)
      p.agente = esIntentoDeElusion(p.texto) ? "intento_eludir_reglas" : (rutaRapida(p.texto) ?? p.llm);
    }
  }
  const exact = (k: "base" | "nb" | "llm" | "agente") => pred.filter((p) => p[k] === p.intencion).length / pred.length;
  const recall = (k: "base" | "nb", c: string) => {
    const de = pred.filter((p) => p.intencion === c);
    return `${de.filter((p) => p[k] === c).length}/${de.length}`;
  };
  // Matriz de confusión del clasificador (filas = real, columnas = predicho).
  const corto = (c: string) => c.replace("consulta_", "c_").replace("solicitud_", "s_").replace("intento_eludir_reglas", "eludir").replace("fuera_de_alcance", "fuera").replace("registro_usuario", "registro");
  const confusion = clases.map((r) => [corto(r), ...clases.map((p) => pred.filter((x) => x.intencion === r && x.nb === p).length)]);
  const errores = pred.filter((p) => p.base !== p.intencion || p.nb !== p.intencion || (conModelo && p.llm !== p.intencion));

  const md = [
    "**Comprenda (3.1).** Aprender de observaciones es usar ejemplos etiquetados para reconocer patrones y evaluar con ejemplos nuevos. Guardar registros no es aprender.",
    "",
    `**Datos.** \`datos/consultas_etiquetadas.csv\`: ${datos.length} frases escritas por el equipo (sintéticas), ${clases.length} intenciones del chat, ${ajuste.length} de ajuste y ${prueba.length} de prueba (5 y 3 por intención, separadas antes de entrenar). Ninguna se repite con los ejemplos guía del modelo ni con \`evals/prueba-intencion.ts\`.`,
    "",
    "**Comprenda (3.2).** Se compara la regla de palabras clave que el agente ya usa (guardia, rutas rápidas, ids y temas de ayuda) con un clasificador estadístico simple: Naive Bayes multinomial con suavizado de Laplace, hecho a mano en `analisis/c31-c32-aprendizaje.ts` (vocabulario de " + nb.vocab + " fichas). Los ids, carnés y números se reemplazan por fichas genéricas para que el modelo no memorice valores.",
    "",
    tabla(["Método", "Aciertos en prueba", "Exactitud"], [
      ["Línea base por reglas (palabras clave, sin modelo)", `${pred.filter((p) => p.base === p.intencion).length}/${pred.length}`, pct(exact("base"))],
      ["Naive Bayes (entrenado con las 40 de ajuste)", `${pred.filter((p) => p.nb === p.intencion).length}/${pred.length}`, pct(exact("nb"))],
      ...(conModelo ? [
        ["llama3.2:3b con la guardia (Ollama)", `${pred.filter((p) => p.llm === p.intencion).length}/${pred.length}`, pct(exact("llm"))],
        ["Como el agente: guardia y rutas rápidas primero; si no coinciden, el modelo", `${pred.filter((p) => p.agente === p.intencion).length}/${pred.length}`, pct(exact("agente"))],
      ] : []),
    ]),
    "",
    "**Aciertos por intención (sensibilidad)**",
    "",
    tabla(["Intención", "Reglas", "Naive Bayes"], clases.map((c) => [c, recall("base", c), recall("nb", c)])),
    "",
    "**Matriz de confusión de Naive Bayes** (fila = intención real, columna = predicha)",
    "",
    tabla(["Real \\ Predicha", ...clases.map(corto)], confusion),
    "",
    "**Análisis de errores en casos nuevos**",
    "",
    conModelo
      ? tabla(["Id", "Frase", "Real", "Reglas", "Naive Bayes", "Modelo", "Agente"], errores.map((p) => [p.id, p.texto, p.intencion, p.base, p.nb, p.llm ?? "", p.agente ?? ""]))
      : tabla(["Id", "Frase", "Real", "Reglas", "Naive Bayes"], errores.map((p) => [p.id, p.texto, p.intencion, p.base, p.nb])),
    "",
    `**Lectura.** Naive Bayes acierta más (${pct(exact("nb"))} frente a ${pct(exact("base"))}), pero la diferencia importante está en **cómo** falla cada uno. Las reglas solo aciertan cuando aparece una palabra clave y, cuando no la encuentran, devuelven *fuera de alcance*: con sinónimos como \"darme de alta\", \"desocupadas\" o \"espacio con computadores\" se quedan cortas, pero su error es conservador (en el agente real, esas frases pasan al modelo). Naive Bayes reconoce mejor frases parecidas a las de ajuste, pero sus errores **meten al usuario en el flujo equivocado**: \"Necesito el certificado de notas\" la clasifica como reserva por la palabra \"necesito\", y no detecta ningún intento de eludir reglas (0/3), que es el error más peligroso. Con 5 ejemplos por intención confunde las que comparten palabras (\"sala\", \"mañana\"). ` +
      (conModelo ? `El modelo local (${pct(exact("llm"))}) es el que mejor generaliza, porque no depende de palabras exactas; por eso el agente lo usa detrás de las rutas rápidas, y la combinación de los dos da ${pct(exact("agente"))}. Aun así, el modelo solo clasifica la intención: sus errores se contienen porque el orquestador verifica los datos contra el texto y las reglas deciden.` : "Con `npm run contenidos -- --llm` (Ollama encendido) se agrega la columna del modelo local, que es el clasificador que hoy usa el agente detrás de las rutas rápidas."),
    "",
    "**Sesgos y límites.** Las frases las escribió el mismo equipo que diseñó las reglas, así que favorecen su vocabulario; 24 frases de prueba dan una exactitud muy inestable (un acierto cambia 4 puntos). **No se presenta el clasificador como fiable** ni se pone en producción. Lo que sí se aprovecha: las frases que fallaron muestran qué rutas rápidas faltan, y el clasificador podría servir de respaldo si el modelo no responde, después de entrenarlo con consultas reales autorizadas. En cualquier caso, clasificar la intención no decide nada: las reglas siguen decidiendo.",
  ].join("\n");

  return {
    id: "3.1 y 3.2", titulo: "Aprendizaje de observaciones y métodos estadísticos", uso: "Ejemplo, no se usa en producción",
    evidencia: `CSV de ${datos.length} frases (${ajuste.length} ajuste / ${prueba.length} prueba); reglas ${pct(exact("base"))} frente a Naive Bayes ${pct(exact("nb"))}`,
    md,
    verificaciones: [
      ["Ajuste y prueba no comparten frases", !ajuste.some((a) => prueba.some((p) => p.texto === a.texto))],
      ["8 intenciones con 5 de ajuste y 3 de prueba", clases.length === 8 && clases.every((c) => ajuste.filter((a) => a.intencion === c).length === 5 && prueba.filter((p) => p.intencion === c).length === 3)],
    ],
  };
}
