// Carga única y validada de agent/rules/reglas.json (hallazgo 2 de la auditoría del 16-11-2026). La usan el motor de
// ingreso (motor.ts), el de reservas (reservas.ts) y la ayuda (ayuda.ts). Si el archivo falta o un campo está mal
// escrito, el proceso se detiene al arrancar con un mensaje que dice qué campo falla, en vez de fallar a medias
// en plena decisión. Si cambias la forma de reglas.json, cambia este esquema (no un `as`).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora HH:MM");

export const Regla = z.object({
  id: z.string().regex(/^R\d+$/, "id Rnn"),
  prioridad: z.number().int(),
  especificidad: z.number().int(),
  tipo: z.string().min(1),
  efecto: z.string().min(1),
  descripcion: z.string().min(1),
  fuente: z.string().min(1),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha aaaa-mm-dd"),
});
export type Regla = z.infer<typeof Regla>;

export const BaseReglas = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "versión x.y.z"),
  parametros: z.object({
    tolerancia_asistencia_min: z.number().int().nonnegative(),
    horario_abre: HHMM,
    horario_cierra: HHMM,
    duracion_min_min: z.number().int().positive(),
    duracion_max_min: z.number().int().positive().nullable(), // null = sin tope (decisión del 12-11-2026)
    dias_adelante_max: z.number().int().positive(),
  }),
  reglas: z.array(Regla).min(1),
})
  .refine((b) => b.parametros.horario_abre < b.parametros.horario_cierra, {
    message: "horario_abre debe ser anterior a horario_cierra", path: ["parametros", "horario_abre"],
  })
  .refine((b) => new Set(b.reglas.map((r) => r.id)).size === b.reglas.length, {
    message: "hay ids de regla repetidos", path: ["reglas"],
  });
export type BaseReglas = z.infer<typeof BaseReglas>;

const RUTA = new URL("../rules/reglas.json", import.meta.url);

// Valida un objeto ya leído (también lo usan las pruebas). Lanza un error con la ruta del archivo y cada campo que falla.
export function validarReglas(datos: unknown, origen = fileURLToPath(RUTA)): BaseReglas {
  const v = BaseReglas.safeParse(datos);
  if (!v.success) {
    const detalle = v.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
    throw new Error(`reglas.json inválido (${origen}): ${detalle}`);
  }
  return v.data;
}

let cache: BaseReglas | null = null;

export function cargarReglas(): BaseReglas {
  if (cache) return cache;
  let texto: string;
  try {
    texto = readFileSync(RUTA, "utf-8");
  } catch (e) {
    throw new Error(`No se pudo leer reglas.json (${fileURLToPath(RUTA)}): ${(e as Error).message}`);
  }
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    throw new Error(`reglas.json no es JSON válido (${fileURLToPath(RUTA)}): ${(e as Error).message}`);
  }
  cache = validarReglas(datos);
  return cache;
}
