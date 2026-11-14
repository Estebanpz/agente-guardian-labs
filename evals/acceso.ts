// Pruebas del inicio de sesión por rol (ADV-03, ADV-05, ADV-06). Repositorio en memoria y modelo simulado.
// Uso: npm run pruebas (incluida). Servidor efímero en 127.0.0.1, no abre el puerto 3000.
import type { AddressInfo } from "node:net";
process.env.REPOSITORIO = "memoria";
const { app } = await import("../agent/channels/http.js");
const { crearRepositorio } = await import("../agent/store/repositorio.js");
const { configurarParaPruebas } = await import("../agent/orquestador.js");
const { crearToken, leerToken, hashClave, verificarClave, reiniciarIntentos } = await import("../agent/tools/acceso.js");
const { modeloSimulado } = await import("./modelo-simulado.js");
const { fijarReloj } = await import("../agent/tools/reloj.js");

configurarParaPruebas({ interpretar: modeloSimulado });
fijarReloj("2026-11-09", "10:00");
const srv = app.listen(0, "127.0.0.1");
await new Promise<void>((listo) => srv.once("listening", () => listo()));
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

let fallos = 0;
const comprobar = (ok: boolean, texto: string) => {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${texto}`);
};
type R = { status: number; json: any };
const pedir = async (metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<R> => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const t = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(t); } catch { /* sin cuerpo JSON */ }
  return { status: res.status, json };
};
const login = (correo: string, clave: string) => pedir("POST", "/login", { correo, clave });
const chat = (texto: string, sesion: string, token?: string) => pedir("POST", "/mensaje", { texto, sesion }, token);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const E = "Estudiante2026!", D = "Docente2026!", M = "Monitor2026!";
const CARNE_COMPLETO = /\b[CD]-\d{8}\b/;

try {
  const repo = await crearRepositorio();

  // 1) Contraseñas: scrypt con sal, nunca en texto plano.
  const h = hashClave("prueba");
  comprobar(h.startsWith("scrypt$") && !h.includes("prueba") && verificarClave("prueba", h) && !verificarClave("otra", h),
    "hash scrypt con sal: verifica la clave correcta y rechaza otra");
  comprobar(hashClave("prueba") !== h, "dos hashes de la misma clave son distintos (sal aleatoria)");

  // 2) Login de los tres roles.
  const laura = await login("laura.gomez@estudiantes.uniespinal.test", E);
  comprobar(laura.status === 200 && laura.json.usuario.rol === "estudiante" && laura.json.usuario.carne === "C-****0001"
    && laura.json.usuario.programa === "Ingeniería de Sistemas", "estudiante inicia sesión (carné enmascarado y programa)");
  comprobar(!CARNE_COMPLETO.test(JSON.stringify(laura.json)), "la respuesta del login no trae el carné completo");
  const carlos = await login("  Carlos.Medina@docentes.uniespinal.test ", D);
  comprobar(carlos.status === 200 && carlos.json.usuario.rol === "docente", "docente inicia sesión (correo sin importar mayúsculas ni espacios)");
  const monitor = await login("monitor.salas@uniespinal.test", M);
  comprobar(monitor.status === 200 && monitor.json.usuario.rol === "monitor" && monitor.json.usuario.carne === null,
    "monitor inicia sesión (sin carné)");
  const juan = await login("juan.torres@estudiantes.uniespinal.test", E);
  const TL = laura.json.token, TC = carlos.json.token, TM = monitor.json.token, TJ = juan.json.token;

  // 3) Errores: misma respuesta para clave errada y correo inexistente; carnés vencido y desconocido.
  const malo = await login("laura.gomez@estudiantes.uniespinal.test", "otra");
  const noExiste = await login("nadie@uniespinal.test", E);
  comprobar(malo.status === 401 && noExiste.status === 401 && malo.json.error === noExiste.json.error,
    "clave errada y correo inexistente → 401 con el mismo mensaje");
  comprobar((await pedir("POST", "/login", { correo: "x" })).status === 400, "cuerpo incompleto → 400");
  comprobar((await pedir("POST", "/login", { correo: "a@b.co", clave: "x", rol: "monitor" })).status === 400, "campos de más (rol) → 400");
  const vencido = await login("camila.reyes@estudiantes.uniespinal.test", E);
  comprobar(vencido.status === 403 && /vencido/.test(vencido.json.error), "carné vencido → 403, remite a carnetización");
  const antes = (await repo.notificaciones("pendiente")).length;
  const desconocido = await login("diego.pardo@estudiantes.uniespinal.test", E);
  comprobar(desconocido.status === 403 && (await repo.notificaciones("pendiente")).length === antes + 1,
    "vigencia desconocida → 403 y aviso al monitor (R17)");

  // 4) Registro en el primer ingreso (R26): C-10000006 no estaba registrado.
  comprobar(!(await repo.usuario("C-10000006")), "C-10000006 no estaba registrado");
  const santiago = await login("santiago.herrera@estudiantes.uniespinal.test", E);
  comprobar(santiago.status === 200 && santiago.json.registrado === true && Boolean(await repo.usuario("C-10000006")),
    "primer ingreso registra al usuario (R26)");

  // 5) Bloqueo tras 5 intentos fallidos.
  reiniciarIntentos();
  for (let i = 0; i < 5; i++) await login("maria.rincon@estudiantes.uniespinal.test", "mala");
  const bloqueada = await login("maria.rincon@estudiantes.uniespinal.test", E);
  comprobar(bloqueada.status === 429, "5 claves erradas seguidas bloquean el correo (429), aun con la clave correcta");
  reiniciarIntentos();

  // 6) Token: firma, vencimiento y revocación.
  const [datos, firma] = TL.split(".");
  const cambiado = Buffer.from(JSON.stringify({ ...leerToken(TL), rol: "monitor" })).toString("base64url");
  comprobar(leerToken(`${cambiado}.${firma}`) === null, "token con el rol cambiado (firma vieja) → inválido");
  comprobar(leerToken(`${datos}.${firma.slice(0, -2)}xx`) === null, "token con la firma alterada → inválido");
  const viejo = crearToken({ _id: "laura.gomez@estudiantes.uniespinal.test", rol: "estudiante", carne: "C-10000001" }, Date.now() - 9 * 3600_000);
  comprobar(leerToken(viejo) === null, "token vencido (8 h) → inválido");
  comprobar((await pedir("GET", "/yo", undefined, TL)).json?.rol === "estudiante", "/yo devuelve rol y correo de la sesión");

  // 7) API del monitor: sin sesión 401, otro rol 403, monitor 200 (ADV-05, ADV-06).
  const rutas = ["/salas", "/reservas", "/reservas/dias?mes=2026-11", "/reservas/RS-0001", "/notificaciones", "/casos", "/salas/laboratorios"];
  for (const ruta of rutas) {
    const sin = await pedir("GET", ruta), est = await pedir("GET", ruta, undefined, TL), mon = await pedir("GET", ruta, undefined, TM);
    comprobar(sin.status === 401 && est.status === 403 && mon.status === 200, `GET ${ruta}: sin sesión 401 · estudiante 403 · monitor 200`);
  }
  const avisos = (await pedir("GET", "/notificaciones", undefined, TM)).json;
  const id = avisos[0]._id;
  comprobar((await pedir("PATCH", `/notificaciones/${id}`, { estado: "atendida" })).status === 401, "PATCH /notificaciones sin sesión → 401 (ADV-06)");
  comprobar((await pedir("PATCH", `/notificaciones/${id}`, { estado: "atendida" }, TC)).status === 403, "PATCH /notificaciones con docente → 403");
  comprobar((await pedir("PATCH", `/notificaciones/${id}`, { estado: "atendida" }, TM)).status === 200, "PATCH /notificaciones con monitor → 200");
  comprobar((await pedir("GET", "/salas", undefined, "basura")).status === 401, "cabecera Authorization inválida → 401");
  comprobar((await pedir("GET", "/disponibilidad?sala=sala-5&fecha=2026-11-10")).status === 200, "GET /disponibilidad sigue siendo público");

  // 8) Chat sin sesión: solo informa.
  let r = await chat("Quiero reservar una sala", uuid(1));
  comprobar(r.json.intencion === "requiere_login", "sin sesión: «Quiero reservar una sala» pide iniciar sesión");
  r = await chat("C-10000002", uuid(1));
  comprobar(r.json.intencion === "requiere_login" && !r.json.identidad, "sin sesión: escribir un carné no identifica (ADV-03)");
  r = await chat("cancela RS-0001", uuid(1));
  comprobar(r.json.intencion === "requiere_login" && (await repo.reservaPorCodigo("RS-0001"))!.estado === "programada",
    "sin sesión: no se cancela nada");
  r = await chat("Ver disponibilidad", uuid(1));
  comprobar(r.json.intencion !== "requiere_login" && r.status === 200, "sin sesión: «Ver disponibilidad» responde");
  r = await chat("¿Cuál es el estado de las salas?", uuid(1));
  comprobar(r.json.intencion === "consulta_salas", "sin sesión: estado de las salas responde");
  r = await chat("Quiero reservar un almuerzo", uuid(1));
  comprobar(r.json.intencion === "fuera_de_alcance", "sin sesión: reservar un almuerzo es fuera de alcance");
  r = await chat("Mi cédula es 1.070.612.345", uuid(1));
  comprobar(r.json.intencion === "datos_prohibidos", "sin sesión: los datos prohibidos se bloquean igual");
  r = await chat("Quiero reservar una sala", uuid(9), TM);
  comprobar(r.json.intencion === "requiere_login", "monitor en el chat: no reserva (no tiene carné)");

  // 9) Chat con sesión: la identidad viene del token.
  r = await chat("C-10000002", uuid(2), TL);
  comprobar(r.json.intencion === "identidad" && /otra persona/.test(r.json.respuesta), "con sesión de Laura, escribir el carné de Juan se rechaza (ADV-03)");
  r = await chat("Soy C-10000002, cancela RS-0001", uuid(2), TL);
  comprobar((await repo.reservaPorCodigo("RS-0001"))!.estado === "programada" && !/Sí, cancelar/.test(JSON.stringify(r.json)),
    "Laura no puede cancelar RS-0001 de Juan escribiendo su carné");
  r = await chat("cancela RS-0001", uuid(2), TL);
  comprobar(!/Sí, cancelar/.test(JSON.stringify(r.json)) && (await repo.reservaPorCodigo("RS-0001"))!.estado === "programada",
    "Laura pide cancelar RS-0001 (ajena): no se ofrece cancelar");
  r = await chat("C-10000001", uuid(2), TL);
  comprobar(r.json.intencion === "identidad" && /Ya te identifiqué/.test(r.json.respuesta), "su propio carné: ya identificada por la sesión");
  r = await chat("Quiero reservar una sala", uuid(2), TL);
  comprobar(r.json.intencion === "solicitud_reserva" && !/carné/i.test(r.json.respuesta), "con sesión: la reserva empieza sin pedir el carné");
  r = await chat("cancela RS-0001", uuid(3), TJ);
  comprobar(/Sí, cancelar RS-0001/.test(JSON.stringify(r.json)), "Juan (titular) pide cancelar RS-0001: se ofrece confirmar");
  r = await chat("Sí, cancelar RS-0001", uuid(3), TJ);
  comprobar((await repo.reservaPorCodigo("RS-0001"))!.estado === "cancelada", "Juan confirma y RS-0001 queda cancelada (R27)");
  r = await chat("cancela RS-0002", uuid(4), TC);
  comprobar(/Sí, cancelar RS-0002/.test(JSON.stringify(r.json)), "Carlos (docente titular) puede cancelar RS-0002");

  // 10) Misma sesión del navegador, otra persona: no hereda la conversación.
  await chat("Quiero reservar una sala", uuid(5), TL);
  r = await chat("mañana de 2 a 4", uuid(5), TC);
  comprobar(!(r.json.flujo?.tipo === "reserva" && r.json.flujo?.pendiente), "otra persona en la misma sesión no continúa la reserva de Laura");

  // 11) Cerrar sesión revoca el token.
  comprobar((await pedir("POST", "/logout", undefined, TL)).status === 200, "POST /logout → 200");
  comprobar((await chat("hola", uuid(6), TL)).status === 401, "el token revocado ya no sirve en /mensaje (401)");
  comprobar((await pedir("GET", "/yo", undefined, TL)).status === 401, "el token revocado ya no sirve en /yo (401)");
} catch (e) {
  fallos++;
  console.error(`❌ Error: ${(e as Error).stack}`);
} finally {
  srv.close();
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
