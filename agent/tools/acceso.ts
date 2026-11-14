// Inicio de sesión por rol (estudiante, docente, monitor). Mitiga ADV-03, ADV-05 y ADV-06: la identidad ya no
// sale de un carné escrito en el chat, sino de una cuenta con contraseña, y la API del monitor exige su rol.
// Sin dependencias nuevas: scrypt y HMAC de node:crypto.
import { createHmac, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Carne, Rol, type CuentaDoc } from "./esquemas-reservas.js";
import { enmascarar } from "./reservas.js";
import type { Repositorio } from "../store/repositorio.js";
import { escalarCarneDesconocido } from "../conversacion.js";

// ── Contraseñas ───────────────────────────────────────────────────────────
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const LARGO = 32;

export function hashClave(clave: string, sal: Buffer = randomBytes(16)): string {
  return `scrypt$${sal.toString("base64url")}$${scryptSync(clave, sal, LARGO, PARAMS).toString("base64url")}`;
}

export function verificarClave(clave: string, hash: string): boolean {
  const [, sal, esperado] = hash.split("$");
  if (!sal || !esperado) return false;
  const calculado = scryptSync(clave, Buffer.from(sal, "base64url"), LARGO, PARAMS);
  const e = Buffer.from(esperado, "base64url");
  return e.length === calculado.length && timingSafeEqual(e, calculado);
}

// Versión asíncrona para el login: scrypt corre en el pool de libuv y no bloquea el hilo principal (fuzzing).
const scryptAsync = promisify(scrypt) as (clave: string, sal: Buffer, largo: number, opciones: typeof PARAMS) => Promise<Buffer>;
export async function verificarClaveAsync(clave: string, hash: string): Promise<boolean> {
  const [, sal, esperado] = hash.split("$");
  if (!sal || !esperado) return false;
  const calculado = await scryptAsync(clave, Buffer.from(sal, "base64url"), LARGO, PARAMS);
  const e = Buffer.from(esperado, "base64url");
  return e.length === calculado.length && timingSafeEqual(e, calculado);
}

// Si el correo no existe se compara igual contra un hash cualquiera: la respuesta tarda lo mismo y no revela
// qué correos tienen cuenta.
const HASH_FICTICIO = hashClave(randomUUID());

// ── Token de sesión ───────────────────────────────────────────────────────
// payload.firma en base64url, firmado con HMAC-SHA256. El secreto sale de SESION_SECRETO (.env, 32+ caracteres);
// sin él se genera uno al arrancar y los tokens dejan de valer al reiniciar la API.
export const DURACION_MS = 8 * 60 * 60 * 1000;
let secreto: Buffer | null = null;
function clave(): Buffer {
  if (!secreto) {
    const env = process.env.SESION_SECRETO ?? "";
    if (env && env.length < 32) console.warn("[acceso] SESION_SECRETO tiene menos de 32 caracteres: se usa uno aleatorio.");
    secreto = env.length >= 32 ? Buffer.from(env) : randomBytes(32);
  }
  return secreto;
}

export type Quien = { correo: string; rol: Rol; carne: string | null; exp: number; jti: string };
const revocados = new Map<string, number>(); // jti → exp (se limpian al vencer)

const firmar = (datos: string) => createHmac("sha256", clave()).update(datos).digest("base64url");

export function crearToken(c: Pick<CuentaDoc, "_id" | "rol" | "carne">, ahoraMs = Date.now()): string {
  const quien: Quien = { correo: c._id, rol: c.rol, carne: c.carne, exp: ahoraMs + DURACION_MS, jti: randomUUID() };
  const datos = Buffer.from(JSON.stringify(quien)).toString("base64url");
  return `${datos}.${firmar(datos)}`;
}

// null si el token está mal formado, mal firmado, vencido o revocado.
export function leerToken(token: string, ahoraMs = Date.now()): Quien | null {
  const [datos, firma, sobra] = token.split(".");
  if (!datos || !firma || sobra !== undefined) return null;
  const esperada = Buffer.from(firmar(datos));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const q = JSON.parse(Buffer.from(datos, "base64url").toString()) as Quien;
    if (!Rol.safeParse(q.rol).success || typeof q.exp !== "number" || q.exp <= ahoraMs) return null;
    if (q.carne !== null && !Carne.safeParse(q.carne).success) return null;
    if (revocados.has(q.jti)) return null;
    return q;
  } catch {
    return null;
  }
}

export function revocar(q: Quien): void {
  const ahora = Date.now();
  for (const [jti, exp] of revocados) if (exp <= ahora) revocados.delete(jti);
  revocados.set(q.jti, q.exp);
}

// ── Intentos fallidos ─────────────────────────────────────────────────────
// 5 contraseñas erradas seguidas bloquean ese correo 5 minutos.
const MAX_FALLOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;
const fallos = new Map<string, { n: number; hasta: number }>();
export const reiniciarIntentos = () => fallos.clear();
// El mapa no crece sin límite (fuzzing): se limpian los bloqueos vencidos y, pasado el tope, las entradas más viejas.
const MAX_ENTRADAS = 10_000;
function podar(ahoraMs: number): void {
  if (fallos.size < MAX_ENTRADAS) return;
  for (const [c, f] of fallos) if (f.hasta !== 0 && f.hasta <= ahoraMs) fallos.delete(c);
  for (const c of fallos.keys()) {
    if (fallos.size < MAX_ENTRADAS * 0.9) break;
    fallos.delete(c);
  }
}
export const intentosRegistrados = () => fallos.size;

// ── Inicio de sesión ──────────────────────────────────────────────────────
export type Usuario = {
  nombres: string; apellidos: string; rol: Rol; correo: string;
  carne: string | null; programa: string | null;
};
export type ResultadoLogin =
  | { ok: true; token: string; usuario: Usuario; registrado: boolean }
  | { ok: false; status: 400 | 401 | 403 | 429; error: string };

const INCORRECTO = "Correo o contraseña incorrectos.";

export async function iniciarSesion(correoTxt: string, claveTxt: string, repo: Repositorio, ahoraMs = Date.now()): Promise<ResultadoLogin> {
  // NFKC: formas Unicode equivalentes del mismo correo cuentan como el mismo correo para el bloqueo.
  const correo = correoTxt.normalize("NFKC").trim().toLowerCase();
  const f = fallos.get(correo);
  if (f && f.hasta > ahoraMs) {
    return { ok: false, status: 429, error: "Demasiados intentos fallidos. Espera 5 minutos e intenta de nuevo." };
  }
  const cuenta = await repo.cuenta(correo);
  const valida = (await verificarClaveAsync(claveTxt, cuenta?.hash ?? HASH_FICTICIO)) && cuenta !== null;
  if (!valida || !cuenta) {
    podar(ahoraMs);
    // Un bloqueo ya vencido empieza la cuenta de cero.
    const n = (f && f.hasta === 0 ? f.n : 0) + 1;
    fallos.set(correo, n >= MAX_FALLOS ? { n: 0, hasta: ahoraMs + BLOQUEO_MS } : { n, hasta: 0 });
    return { ok: false, status: 401, error: INCORRECTO };
  }
  fallos.delete(correo);

  // Estudiante o docente: la carnetización decide (R17 desconocido, vencido) y el primer ingreso registra (R26).
  let programa: string | null = null;
  let registrado = false;
  if (cuenta.carne) {
    const doc = await repo.carne(cuenta.carne);
    if (!doc || doc.vigencia === "desconocida") {
      return { ok: false, status: 403, error: await escalarCarneDesconocido(cuenta.carne, repo) };
    }
    if (doc.vigencia === "vencido") {
      return { ok: false, status: 403, error: "Tu carné está vencido; remítete a carnetización." };
    }
    if (!(await repo.usuario(cuenta.carne))) {
      registrado = (await repo.registrarUsuario({ _id: cuenta.carne, rol: doc.rol, registrado: new Date(ahoraMs) })) === "creado";
    }
    programa = doc.rol === "estudiante" ? doc.programa : null;
  }
  return {
    ok: true,
    token: crearToken(cuenta, ahoraMs),
    registrado,
    usuario: {
      nombres: cuenta.nombres, apellidos: cuenta.apellidos, rol: cuenta.rol, correo: cuenta._id,
      carne: cuenta.carne ? enmascarar(cuenta.carne) : null, programa,
    },
  };
}
