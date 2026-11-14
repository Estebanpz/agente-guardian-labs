// Estado y sesión: recargar (sesión nueva), salir/cancelar fuera de flujo, reuso de sesión ajena, cambio de carné.
import { anotar, hablar, imprimir, json, nuevoEntorno, restaurarLog, uuid } from "./comun.js";
import { liberarReloj } from "../../agent/tools/reloj.js";

try {
  // S-01: reuso de la sesión de otra persona. A identifica C-10000001; luego en la MISMA sesión llega C-10000002.
  {
    const repo = nuevoEntorno();
    const s = await hablar(uuid(1), ["C-10000001", "C-10000002", "cancela RS-0001"]);
    const est = (await repo.reservaPorCodigo("RS-0001"))?.estado;
    anotar("S-01", "sesion/cambio-carne", "misma sesión: C-10000001 → C-10000002 → cancela RS-0001",
      "el segundo carné reidentifica y cierra la conversación; no mezcla identidades", `saludo2=${/Juan Camilo/.test(json(s[1]))}; tras cancela=${String(s[2].respuesta).slice(0,90)}; RS-0001=${est}`,
      est === "cancelada" && !/Juan Camilo/.test(json(s[1])));
  }

  // S-02: "salir" fuera de flujo borra la sesión; el siguiente mensaje pide carné.
  {
    nuevoEntorno();
    const s = await hablar(uuid(2), ["C-10000001", "salir", "estado de salas"]);
    anotar("S-02", "sesion/salir", `C-10000001 → "salir" → "estado de salas"`, "tras salir pide carné de nuevo",
      `${String(s[2].respuesta).slice(0,80)}`, !/escríbeme tu carné|Para atenderte/.test(s[2].respuesta ?? ""));
  }

  // S-03: "cancelar" fuera de un flujo abierto.
  {
    nuevoEntorno();
    const s = await hablar(uuid(3), ["C-10000001", "cancelar"]);
    anotar("S-03", "sesion/cancelar", `C-10000001 → "cancelar" (sin flujo abierto)`, "no crashea; respuesta coherente",
      `intencion=${s[1].intencion}; ${String(s[1].respuesta).slice(0,80)}`, s[1] === undefined || s[1].respuesta === undefined);
  }

  // S-04: recargar = sesión nueva: el flujo abierto de la vieja no se arrastra.
  {
    nuevoEntorno();
    await hablar(uuid(4), ["C-10000001", "Quiero reservar una sala", "mañana"]);
    const s = await hablar(uuid(5), ["hola"]); // sesión nueva -> pide carné
    anotar("S-04", "sesion/recarga", "sesión A en pleno flujo; sesión B nueva dice 'hola'", "B arranca limpia pidiendo carné",
      `${String(s[0].respuesta).slice(0,80)}`, !/carné|Para atenderte/.test(s[0].respuesta ?? ""));
  }

  // S-05: sin sesión (undefined): no hay estado; cada mensaje pide carné.
  {
    nuevoEntorno();
    const s = await hablar(undefined, ["C-10000001", "Quiero reservar una sala", "mañana"]);
    anotar("S-05", "sesion/sin-sesion", "sin UUID de sesión: carné + reserva + mañana", "sin sesión no se mantiene estado; no asigna reservas",
      `r1=${String(s[1].respuesta).slice(0,70)}`, /RS-\d{4}/.test(json(s)));
  }

  // S-06: una reserva propia confirmada OLVIDA el carné; un siguiente mensaje no debe seguir autenticado.
  {
    const repo = nuevoEntorno();
    const s = await hablar(uuid(6), ["C-10000001", "Quiero reservar una sala", "mañana", "de 10 a 12", "somos 3", "sí", "cancela mi última reserva"]);
    anotar("S-06", "sesion/olvido", "reserva confirmada luego 'cancela mi última reserva'", "tras confirmar se olvida el carné; pide carné otra vez",
      `final: ${String(s.at(-1)?.respuesta).slice(0,90)}`, !/carné|Para atenderte/.test(s.at(-1)?.respuesta ?? ""));
  }
} finally {
  liberarReloj();
  restaurarLog();
}
imprimir("Estado y sesion");
