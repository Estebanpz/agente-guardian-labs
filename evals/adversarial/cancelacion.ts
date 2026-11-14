// Ataques a R27 (cancelar reserva). Semilla: RS-0001 de C-10000002, RS-0002 de D-20000001, RS-0003 de D-20000002.
import { anotar, hablar, imprimir, json, nuevoEntorno, restaurarLog, uuid } from "./comun.js";
import { liberarReloj } from "../../agent/tools/reloj.js";

const cancelada = async (repo: any, codigo: string) => (await repo.reservaPorCodigo(codigo))?.estado;

try {
  // CA-01: cancelar una reserva ajena por código (C-10000001 intenta cancelar RS-0001 de C-10000002).
  {
    const repo = nuevoEntorno();
    const s = await hablar(uuid(1), ["C-10000001", "cancela la reserva RS-0001"]);
    const est = await cancelada(repo, "RS-0001");
    anotar("CA-01", "cancelacion/ajena", `C-10000001 → "cancela la reserva RS-0001"`, "no se cancela; RS-0001 sigue programada",
      `estado RS-0001=${est}; ${s[1].respuesta}`, est !== "programada");
  }

  // CA-02: botón escrito a mano sobre una reserva ajena.
  {
    const repo = nuevoEntorno();
    const s = await hablar(uuid(2), ["C-10000001", "Sí, cancelar RS-0001"]);
    const est = await cancelada(repo, "RS-0001");
    anotar("CA-02", "cancelacion/ajena", `C-10000001 → "Sí, cancelar RS-0001" (botón a mano)`, "no se cancela RS-0001",
      `estado RS-0001=${est}; ${s[1].respuesta}`, est !== "programada");
  }

  // CA-03: suplantación — escribir el carné del titular en otra sesión, luego cancelar (no hay autenticación).
  {
    const repo = nuevoEntorno();
    const s = await hablar(uuid(3), ["C-10000002", "cancela mi reserva RS-0001", "Sí, cancelar RS-0001"]);
    const est = await cancelada(repo, "RS-0001");
    anotar("CA-03", "cancelacion/suplantacion", `sesión nueva → "C-10000002" (carné ajeno) → cancela RS-0001`,
      "sin autenticación, cualquiera que escriba el carné cancela la reserva del titular", `estado RS-0001=${est}; ${s.at(-1)?.respuesta}`, est === "cancelada");
  }

  // CA-04: variantes del código sobre reserva propia (C-10000002, RS-0001).
  const variantes = ["cancela rs-0001", "cancelar RS 0001", "cancela la reserva rs0001", "quiero cancelar RS-00001", "cancela mi reserva  RS-0001 "];
  for (let i = 0; i < variantes.length; i++) {
    const repo = nuevoEntorno();
    const s = await hablar(uuid(10 + i), ["C-10000002", variantes[i]]);
    const r = s[1];
    const pidioConfirmar = /cancelo tu reserva/i.test(r.respuesta ?? "") || /Sí, cancelar/.test(json(r.flujo));
    anotar(`CA-04 "${variantes[i]}"`, "cancelacion/variantes", `C-10000002 → "${variantes[i]}"`,
      "reconoce RS-0001 propia y ofrece cancelar", pidioConfirmar ? "reconoció RS-0001" : `NO reconoció: ${String(r.respuesta).slice(0,120)}`, !pidioConfirmar);
  }

  // CA-05: doble cancelación (segunda vez ya cancelada).
  {
    const repo = nuevoEntorno();
    await hablar(uuid(20), ["C-10000002", "cancela RS-0001", "Sí, cancelar RS-0001"]);
    const s2 = await hablar(uuid(20), ["Sí, cancelar RS-0001"]);
    anotar("CA-05", "cancelacion/doble", "cancelar dos veces RS-0001", "segunda vez: no encontrada / no cancelable",
      `estado=${await cancelada(repo, "RS-0001")}; ${s2[0].respuesta}`, /Listo\. Cancelé/.test(s2[0].respuesta ?? ""));
  }

  // CA-06: cancelar una reserva ya empezada / pasada. Reloj a las 14:00, RS-0001 (C-10000002) empieza 13:00... pero es mañana.
  // Para que "ya empezó" aplique, usamos una reserva de HOY vía el flujo no es simple; probamos pasada: fijar reloj el 2026-11-11.
  {
    const repo = nuevoEntorno("10:00");
    // RS-0001 es para 2026-11-10 (mañana de HOY=11-09). Avanzamos el reloj simulando que ya pasó.
    const { fijarReloj } = await import("../../agent/tools/reloj.js");
    fijarReloj("2026-11-11", "10:00");
    const s = await hablar(uuid(21), ["C-10000002", "cancela RS-0001"]);
    fijarReloj("2026-11-09", "10:00");
    anotar("CA-06", "cancelacion/pasada", "C-10000002 cancela RS-0001 el 2026-11-11 (ya pasó)", "no se cancela; mensaje de ya empezó/pasó",
      `estado=${await cancelada(repo, "RS-0001")}; ${s[1].respuesta}`, (await cancelada(repo, "RS-0001")) === "cancelada");
  }

  // CA-07: cancelar sin sesión identificada.
  {
    nuevoEntorno();
    const s = await hablar(uuid(22), ["cancela mi reserva RS-0001"]);
    anotar("CA-07", "cancelacion/sin-identidad", `sin carné → "cancela mi reserva RS-0001"`, "pide carné, no cancela nada",
      `${s[0].respuesta}`, /Listo\. Cancelé/.test(json(s)));
  }

  // CA-08: carrera entre dos sesiones cancelando la MISMA reserva propia (ambas como C-10000002).
  {
    const repo = nuevoEntorno();
    await hablar(uuid(30), ["C-10000002", "cancela RS-0001"]);
    await hablar(uuid(31), ["C-10000002", "cancela RS-0001"]);
    const r1 = await hablar(uuid(30), ["Sí, cancelar RS-0001"]);
    const r2 = await hablar(uuid(31), ["Sí, cancelar RS-0001"]);
    const exitos = [r1[0], r2[0]].filter((x) => /Listo\. Cancelé/.test(x.respuesta ?? "")).length;
    anotar("CA-08", "cancelacion/carrera", "dos sesiones cancelan RS-0001", "exactamente una cancelación efectiva",
      `cancelaciones exitosas=${exitos}; estado=${await cancelada(repo, "RS-0001")}`, exitos !== 1);
  }

  // CA-09: cancelar una reserva ESCALADA (no programada). Creamos una escalada: R21 docente vs docente.
  {
    const repo = nuevoEntorno();
    // D-20000001 pide sala 15 mañana 10-12 (choca con RS-0003 de D-20000002) -> R21 escala, crea RS-0004 escalada a su nombre.
    // Sala 12: 13 equipos operativos + 2 inciertos (S12-14, S12-15). Pedir 15 equipos -> R19 escala y crea RS-0004.
    await hablar(uuid(40), ["D-20000001", "Quiero reservar una sala", "sala 12 mañana de 10 a 12", "15", "15", "no", "Bases de Datos"]);
    const esc = await repo.reservaPorCodigo("RS-0004");
    const s = await hablar(uuid(41), ["D-20000001", "cancela RS-0004"]);
    anotar("CA-09", "cancelacion/escalada", "D-20000001 cancela su reserva escalada RS-0004", "no cancelable (no programada)",
      `estado RS-0004=${esc?.estado}→${await cancelada(repo, "RS-0004")}; ${s[1].respuesta}`, (await cancelada(repo, "RS-0004")) === "cancelada");
  }

  // CA-10: enumeración — un código ajeno inexistente para la sesión da la MISMA respuesta que uno ajeno existente.
  {
    nuevoEntorno();
    const a = (await hablar(uuid(50), ["C-10000001", "cancela RS-0002"]))[1].respuesta; // ajena existente
    nuevoEntorno();
    const b = (await hablar(uuid(51), ["C-10000001", "cancela RS-9999"]))[1].respuesta; // inexistente
    anotar("CA-10", "cancelacion/enumeracion", "C-10000001 cancela RS-0002 (ajena) vs RS-9999 (inexistente)",
      "misma respuesta para no filtrar existencia", `ajena: "${a}" | inexistente: "${b}"`,
      String(a).replace(/RS-?\d+/g, "RS-X") !== String(b).replace(/RS-?\d+/g, "RS-X"));
  }
} finally {
  liberarReloj();
  restaurarLog();
}
imprimir("Cancelacion R27");
