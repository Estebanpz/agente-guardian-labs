export {};
// Fuzzing del chat en los tres modos: visitante (sin sesión), con sesión (Laura, C-10000001) y legado (carné
// escrito, como en las pruebas de flujo). Mensajes armados con fragmentos de español informal, carnés con tildes
// combinadas, códigos RS, fechas imposibles, frases genéricas de inyección y cadenas Unicode raras.
process.env.REPOSITORIO = "memoria";
const { SEMILLA, cuantas, azar, fugas, tamLog, restaurarLog, informe, conLimite, textoAleatorio, uuidDe } = await import("./base.js");
const { mensaje, configurarParaPruebas } = await import("../../agent/orquestador.js");
const { crearMemoria } = await import("../../agent/store/memoria.js");
const { modeloSimulado } = await import("../modelo-simulado.js");
const { fijarReloj } = await import("../../agent/tools/reloj.js");
const { carnesEn } = await import("../../agent/tools/extraer.js");

const inf = informe("Fuzzing chat");
const tam0 = tamLog();
fijarReloj("2026-11-09", "10:00");
const repo = crearMemoria("2026-11-09");
configurarParaPruebas({ repo, interpretar: modeloSimulado });
console.log(`Semilla: ${SEMILLA}`);
const a = azar(SEMILLA);
const SEMILLA_RS = ["RS-0001", "RS-0002", "RS-0003"];
const estados = async () => Promise.all(SEMILLA_RS.map(async (c) => (await repo.reservaPorCodigo(c))?.estado));
const inicial = JSON.stringify(await estados());
const PROHIBIDAS_VISITANTE = ["solicitud_reserva", "cancelar_reserva", "mis_reservas", "registro_usuario", "saludo_identificado"];

let colgados = 0, excepciones = 0, fugasN = 0, visitanteAbrio = 0;
const t0 = Date.now();

async function turno(modo: "visitante" | "laura" | "legado", sesion: string, texto: string) {
  const contexto = modo === "visitante" ? { sesion, autenticado: null } : modo === "laura" ? { sesion, autenticado: "C-10000001" } : { sesion };
  try {
    const r = await conLimite(mensaje(texto, contexto) as Promise<Record<string, unknown>>, 4000);
    if (r === "colgado") { colgados++; inf.hallazgo("colgado", `modo ${modo}: sin respuesta en 4 s`, texto); return null; }
    // Carnés permitidos en la respuesta: el propio (Laura) o los que la persona escribió (modo legado).
    const permitidos = modo === "laura" ? ["C-10000001"] : modo === "legado" ? carnesEn(texto) : [];
    const f = fugas(JSON.stringify(r), permitidos);
    if (f.length) { fugasN++; inf.hallazgo("fuga", `modo ${modo}: ${f.join(" | ")}`, texto); }
    if (modo === "visitante" && PROHIBIDAS_VISITANTE.includes(String(r.intencion))) {
      visitanteAbrio++; inf.hallazgo("visitante", `abrió ${r.intencion}`, texto);
    }
    return r;
  } catch (e) {
    excepciones++; inf.hallazgo("excepcion", `modo ${modo}: ${(e as Error).message}`, texto);
    return null;
  }
}

const N = cuantas(1500);
try {
  // 1) Visitante y Laura: conversaciones de 1 a 6 mensajes en sesiones nuevas.
  let n = 0, s = 1;
  while (n < N) {
    const modo = a.si(0.5) ? "visitante" : "laura";
    const sesion = uuidDe(s++);
    for (let k = a.entero(1, 6); k > 0 && n < N; k--, n++) await turno(modo, sesion, textoAleatorio(a));
  }
  const tras = JSON.stringify(await estados());
  inf.objetivo(`visitante y Laura no cambian RS-0001..RS-0003 (${inicial} → ${tras})`, tras === inicial);
  const ajenas = [];
  for (const d of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) {
    for (const r of await repo.reservasDelDia(d)) if (!SEMILLA_RS.includes(r.codigo) && r.carne !== "C-10000001") ajenas.push(`${r.codigo}:${r.carne}`);
  }
  inf.objetivo(`toda reserva creada con la sesión de Laura es de Laura (${ajenas.length} ajenas)`, ajenas.length === 0);

  // 2) Modo legado (identidad por carné escrito, solo pruebas y consola): no debe colgarse ni lanzar excepciones.
  for (let i = 0; i < Math.round(N / 3); i++) {
    const sesion = uuidDe(100_000 + Math.floor(i / 4));
    await turno("legado", sesion, textoAleatorio(a));
  }
  console.log(`${N + Math.round(N / 3)} mensajes en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  inf.objetivo(`ningún mensaje colgado (${colgados})`, colgados === 0);
  inf.objetivo(`ninguna excepción (${excepciones})`, excepciones === 0);
  inf.objetivo(`sin carnés ajenos, trazas ni hashes en las respuestas (${fugasN})`, fugasN === 0);
  inf.objetivo(`el visitante nunca abre reserva, cancelación ni registro (${visitanteAbrio})`, visitanteAbrio === 0);
} catch (e) {
  inf.objetivo(`el fuzzer terminó sin excepción: ${(e as Error).message}`, false);
} finally {
  restaurarLog(tam0);
}
inf.terminar();
