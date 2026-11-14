// Propiedades de contraseñas y tokens (agent/tools/acceso.ts). scrypt es lento (~60 ms): pocos casos.
import { DURACION_MS, crearToken, hashClave, leerToken, revocar, verificarClave } from "../../agent/tools/acceso.js";
import { carneArb, esPrincipal, fc, grupo, propiedad, terminar } from "./comun.js";

// Claves unicode bien formadas (grafemas), no vacías.
const clave = fc.string({ unit: "grapheme", minLength: 1, maxLength: 24 });
// Cuenta sintética: el monitor no tiene carné.
const cuenta = fc.oneof(
  fc.record({ _id: fc.emailAddress(), rol: fc.constantFrom("estudiante" as const, "docente" as const), carne: carneArb }),
  fc.record({ _id: fc.emailAddress(), rol: fc.constant("monitor" as const), carne: fc.constant(null) }),
);
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Clave con un surrogate UTF-16 suelto (JSON.parse('"\\ud800"') lo produce): dos claves distintas de este tipo.
const surrogateSuelto = fc.integer({ min: 0xd800, max: 0xdfff }).map((c) => String.fromCharCode(c));

export async function correr(): Promise<void> {
  grupo("Acceso (contraseñas y tokens)");

  await propiedad("verificarClave(c, hashClave(c)) es true y con otra clave distinta es false (huella scrypt$sal$clave)",
    fc.property(clave, clave, (c, otra) => {
      fc.pre(c !== otra);
      const h = hashClave(c);
      return /^scrypt\$[\w-]{22}\$[\w-]{43}$/.test(h) && verificarClave(c, h) && !verificarClave(otra, h);
    }), 60);

  // Corregido el 14-11-2026: una clave con un surrogate suelto no se puede guardar ni verifica contra ninguna huella
  // (antes "\uD800" verificaba la huella de "\uD801" y de "\uFFFD").
  await propiedad("claves con surrogates sueltos: hashClave las rechaza y nunca verifican (tampoco contra la huella de U+FFFD)",
    fc.property(fc.string({ unit: "grapheme-ascii", maxLength: 8 }), surrogateSuelto, (base, s) => {
      let rechazada = false;
      try { hashClave(base + s); } catch { rechazada = true; }
      return rechazada && !verificarClave(base + s, hashClave(base + "\uFFFD"));
    }), 40);

  await propiedad("leerToken(crearToken(x)) devuelve el mismo correo, rol y carné, con exp = ahora + 8 h",
    fc.property(cuenta, (c) => {
      const ahora = Date.now();
      const q = leerToken(crearToken(c, ahora), ahora);
      return q !== null && q.correo === c._id && q.rol === c.rol && q.carne === c.carne && q.exp === ahora + DURACION_MS;
    }), 2000);

  await propiedad("cambiar cualquier carácter del token → null",
    fc.property(cuenta, fc.nat(), fc.constantFrom(...B64URL, "."), (c, pos, nuevo) => {
      const t = crearToken(c);
      const i = pos % t.length;
      fc.pre(t[i] !== nuevo);
      return leerToken(t.slice(0, i) + nuevo + t.slice(i + 1)) === null;
    }), 3000);

  await propiedad("token vencido (leído en exp o después) → null; antes de exp sigue valiendo",
    fc.property(cuenta, fc.integer({ min: 0, max: 30 * 24 * 3600 * 1000 }), fc.integer({ min: 1, max: DURACION_MS - 1 }), (c, tarde, antes) => {
      const ahora = Date.now();
      const t = crearToken(c, ahora);
      return leerToken(t, ahora + DURACION_MS + tarde) === null && leerToken(t, ahora + DURACION_MS - antes) !== null;
    }), 2000);

  await propiedad("después de revocar(q) el token → null (y los otros tokens de la misma cuenta siguen valiendo)",
    fc.property(cuenta, (c) => {
      const t1 = crearToken(c), t2 = crearToken(c);
      const q = leerToken(t1);
      if (!q) return false;
      revocar(q);
      return leerToken(t1) === null && leerToken(t2) !== null;
    }), 1000);
}

if (esPrincipal(import.meta.url)) {
  const t0 = Date.now();
  await correr();
  terminar(t0);
}
