// Pruebas que matan mutantes de agent/tools/acceso.ts (Stryker, 14-11-2026): verificación de claves con huellas
// mal formadas, secreto del token, formato y contenido del token, revocación, bloqueo por intentos y su poda.
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const SECRETO = "s".repeat(32); // exactamente 32: el mínimo aceptado
process.env.SESION_SECRETO = SECRETO;
process.env.REPOSITORIO = "memoria";
const A = await import("../../agent/tools/acceso.js");
const { crearMemoria } = await import("../../agent/store/memoria.js");

let fallos = 0;
const ver = (nombre: string, obtenido: unknown, esperado: unknown) => {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${ok ? "" : ` · obtenido ${JSON.stringify(obtenido)}, esperado ${JSON.stringify(esperado)}`}`);
};
const sinError = async (f: () => unknown) => { try { return await f(); } catch (e) { return `excepción: ${(e as Error).message}`; } };

// ── Claves ──
const h = A.hashClave("clave");
const [, sal] = h.split("$");
for (const [nombre, f] of [["síncrona", A.verificarClave], ["asíncrona", A.verificarClaveAsync]] as const) {
  ver(`${nombre}: clave correcta`, await sinError(() => f("clave", h)), true);
  ver(`${nombre}: huella sin $`, await sinError(() => f("clave", "x")), false);
  ver(`${nombre}: huella sin la parte esperada`, await sinError(() => f("clave", `scrypt$${sal}`)), false);
  ver(`${nombre}: huella sin sal`, await sinError(() => f("clave", `scrypt$$${h.split("$")[2]}`)), false);
  ver(`${nombre}: huella esperada más corta (sin excepción)`, await sinError(() => f("clave", `scrypt$${sal}$AAAA`)), false);
  ver(`${nombre}: surrogate alto suelto`, await sinError(() => f("a\uD800", A.hashClave("a�"))), false);
  ver(`${nombre}: surrogate bajo suelto`, await sinError(() => f("a\uDC00", A.hashClave("a�"))), false);
  ver(`${nombre}: par surrogate válido (emoji) sí verifica`, await sinError(() => f("a😀", A.hashClave("a😀"))), true);
}
ver("hashClave rechaza un surrogate suelto", await sinError(() => A.hashClave("\uD800")), "excepción: La contraseña tiene caracteres Unicode inválidos.");
ver("hashClave rechaza un surrogate bajo suelto", typeof (await sinError(() => A.hashClave("x\uDC00y"))) === "string" && String(await sinError(() => A.hashClave("x\uDC00y"))).startsWith("excepción"), true);

// ── Token: secreto, duración, formato y contenido ──
const T0 = 1_800_000_000_000;
const cuenta = { _id: "laura.gomez@estudiantes.uniespinal.test", rol: "estudiante" as const, carne: "C-10000001" };
const tok = A.crearToken(cuenta, T0);
const [datos, firma] = tok.split(".");
ver("firma = HMAC-SHA256 con SESION_SECRETO de 32 caracteres", firma, createHmac("sha256", SECRETO).update(datos).digest("base64url"));
ver("duración de 8 horas", A.DURACION_MS, 8 * 60 * 60 * 1000);
ver("exp = ahora + 8 h", A.leerToken(tok, T0)?.exp, T0 + 8 * 3600 * 1000);
ver("vale un milisegundo antes de vencer", A.leerToken(tok, T0 + A.DURACION_MS - 1)?.correo, cuenta._id);
ver("vence justo a las 8 h", A.leerToken(tok, T0 + A.DURACION_MS), null);
const firmar = (obj: unknown) => {
  const d = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${d}.${createHmac("sha256", SECRETO).update(d).digest("base64url")}`;
};
const base = { correo: "x@uniespinal.test", rol: "monitor", carne: null, exp: T0 + 1000, jti: "j1" };
ver("token firmado válido", A.leerToken(firmar(base), T0)?.rol, "monitor");
ver("rol inventado", A.leerToken(firmar({ ...base, rol: "admin" }), T0), null);
ver("exp no numérico", A.leerToken(firmar({ ...base, exp: String(T0 + 1000) }), T0), null);
ver("carné mal formado", A.leerToken(firmar({ ...base, carne: "X-1" }), T0), null);
ver("carné válido", A.leerToken(firmar({ ...base, rol: "docente", carne: "D-20000001" }), T0)?.carne, "D-20000001");
const noJson = Buffer.from("no es json").toString("base64url");
ver("contenido que no es JSON (sin excepción)", await sinError(() => A.leerToken(`${noJson}.${createHmac("sha256", SECRETO).update(noJson).digest("base64url")}`, T0)), null);
ver("tres partes", A.leerToken(`${tok}.x`, T0), null);
ver("sin firma", A.leerToken(`${datos}.`, T0), null);
ver("sin datos", A.leerToken(`.${firma}`, T0), null);
ver("una sola parte", A.leerToken(datos, T0), null);
ver("firma más corta (sin excepción)", await sinError(() => A.leerToken(`${datos}.${firma.slice(0, 10)}`, T0)), null);
ver("firma del mismo largo pero distinta", A.leerToken(`${datos}.${firma.slice(0, -1)}${firma.endsWith("A") ? "B" : "A"}`, T0), null);

// ── Revocación y su limpieza ──
const q = A.leerToken(firmar({ ...base, jti: "vivo", exp: Date.now() + 60_000 }))!;
const vencido = { ...base, jti: "vencido", exp: Date.now() - 1 } as never;
A.revocar(vencido);
const antes = A.revocadosRegistrados();
A.revocar(q);
ver("revocar limpia los ya vencidos", A.revocadosRegistrados(), antes);
ver("token revocado no vale", A.leerToken(firmar({ ...base, jti: "vivo", exp: Date.now() + 60_000 })), null);
const otro = { ...base, jti: "vence-justo", exp: Date.now() } as never;
A.revocar(otro);
const n1 = A.revocadosRegistrados();
A.revocar({ ...base, jti: "otro-mas", exp: Date.now() + 60_000 } as never);
ver("el que vence justo ahora también se limpia", A.revocadosRegistrados(), n1);

// ── Secreto corto: se ignora (proceso aparte, porque el secreto se fija una vez) ──
const hijo = spawnSync(process.execPath, ["--import", "tsx", "-e", `(async () => {
  process.env.SESION_SECRETO = "${"c".repeat(31)}";
  const A = await import(${JSON.stringify(fileURLToPath(new URL("../../agent/tools/acceso.ts", import.meta.url)))});
  const { createHmac } = await import("node:crypto");
  const [d, f] = A.crearToken({ _id: "a@b.co", rol: "monitor", carne: null }).split(".");
  console.log(f === createHmac("sha256", "${"c".repeat(31)}").update(d).digest("base64url") ? "USA_CORTO" : "IGNORA_CORTO");
})();`], { encoding: "utf8", env: { ...process.env, REPOSITORIO: "memoria" } });
if (hijo.status !== 0) console.log(hijo.stderr.slice(0, 400));
ver("un secreto de 31 caracteres se ignora", hijo.stdout.trim().split("\n").at(-1), "IGNORA_CORTO");

// ── Login: mensajes, normalización del correo, bloqueo y sus límites ──
const repo = crearMemoria("2026-11-09");
const L = "laura.gomez@estudiantes.uniespinal.test";
A.reiniciarIntentos();
const r1 = await A.iniciarSesion("x@uniespinal.test", "mala", repo, T0);
ver("clave errada: 401 y mensaje", r1.ok ? null : [r1.status, r1.error], [401, "Correo o contraseña incorrectos."]);
const r2 = await A.iniciarSesion("  LAURA.Gomez@Estudiantes.UniEspinal.test ", "Estudiante2026!", repo, T0);
ver("correo con mayúsculas y espacios inicia sesión", r2.ok && r2.usuario.correo, L);
ver("usuario ya registrado: registrado = false", r2.ok && r2.registrado, false);
const doc = await A.iniciarSesion("carlos.medina@docentes.uniespinal.test", "Docente2026!", repo, T0);
ver("docente: programa null", doc.ok && doc.usuario.programa, null);
ver("estudiante: programa", r2.ok && r2.usuario.programa, "Ingeniería de Sistemas");
const mon = await A.iniciarSesion("monitor.salas@uniespinal.test", "Monitor2026!", repo, T0);
ver("monitor: carné y programa null", mon.ok && [mon.usuario.carne, mon.usuario.programa], [null, null]);

A.reiniciarIntentos();
for (let i = 0; i < 4; i++) await A.iniciarSesion(L, "mala", repo, T0);
ver("4 fallos: n = 4, sin bloqueo", A.intentoDe(L), { n: 4, hasta: 0 });
ver("4 fallos: la clave correcta entra", (await A.iniciarSesion(L, "Estudiante2026!", repo, T0)).ok, true);
ver("el éxito borra los fallos", A.intentoDe(L), null);
for (let i = 0; i < 5; i++) await A.iniciarSesion(L, "mala", repo, T0);
ver("5 fallos: bloqueado 5 minutos", A.intentoDe(L), { n: 0, hasta: T0 + 5 * 60 * 1000 });
const bloq = await A.iniciarSesion(L, "Estudiante2026!", repo, T0 + 5 * 60 * 1000 - 1);
ver("un ms antes del fin: 429 con mensaje", bloq.ok ? null : [bloq.status, bloq.error.includes("5 minutos")], [429, true]);
ver("justo al vencer el bloqueo entra", (await A.iniciarSesion(L, "Estudiante2026!", repo, T0 + 5 * 60 * 1000)).ok, true);
for (let i = 0; i < 5; i++) await A.iniciarSesion(L, "mala", repo, T0);
await A.iniciarSesion(L, "mala", repo, T0 + 6 * 60 * 1000);
ver("tras un bloqueo vencido, la cuenta empieza en 1", A.intentoDe(L), { n: 1, hasta: 0 });
A.reiniciarIntentos();
ver("reiniciarIntentos vacía el registro", A.intentosRegistrados(), 0);

// Poda: con 10 000 correos se borran los bloqueos vencidos y luego los más viejos hasta quedar bajo 9 000.
const falso = { cuenta: async (c: string) => ({ _id: c, rol: "estudiante", carne: null, nombres: "x", apellidos: "y", hash: "x" }) } as never;
for (let i = 0; i < 5; i++) await A.iniciarSesion("bloqueado@uniespinal.test", "mala", falso, T0);
for (let i = 0; i < 9_999; i++) await A.iniciarSesion(`p${i}@uniespinal.test`, "mala", falso, T0);
ver("10 000 entradas antes de podar", A.intentosRegistrados(), 10_000);
for (let i = 0; i < 5; i++) await A.iniciarSesion("nuevo-bloqueado@uniespinal.test", "mala", falso, T0 + 10 * 60 * 1000);
ver("tras podar quedan menos de 9 000 + las nuevas", A.intentosRegistrados(), 9_000);
ver("el bloqueo vencido se borró", A.intentoDe("bloqueado@uniespinal.test"), null);
ver("los más viejos se borraron", A.intentoDe("p0@uniespinal.test"), null);
ver("los más nuevos siguen", A.intentoDe("p9998@uniespinal.test"), { n: 1, hasta: 0 });
A.reiniciarIntentos();

console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
