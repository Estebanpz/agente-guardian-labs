// Fuzzing de la API HTTP: métodos, rutas, cuerpos JSON aleatorios o corruptos, cabeceras y tokens alterados.
// Invariantes: nunca 5xx, sin fugas (carnés completos, trazas, URI de Mongo, hashes), rutas del monitor solo con
// su token, /login nunca acepta credenciales aleatorias y el prototipo de Object no se contamina.
import type { AddressInfo } from "node:net";
process.env.REPOSITORIO = "memoria";
process.env.PROVEEDOR = "ollama";
process.env.MODELO_TIEMPO_MS = "2000";
process.env.OLLAMA_HOST = "http://127.0.0.1:9"; // sin modelo real: /evaluar falla rápido y redacta sin modelo
const { SEMILLA, cuantas, azar, cadenaRara, fugas, tamLog, restaurarLog, informe, conLimite } = await import("./base.js");
const { app, reiniciarLimiteLogin } = await import("../../agent/channels/http.js");
const { configurarParaPruebas } = await import("../../agent/orquestador.js");
const { modeloSimulado } = await import("../modelo-simulado.js");
const { fijarReloj } = await import("../../agent/tools/reloj.js");

const inf = informe("Fuzzing API");
const tam0 = tamLog();
configurarParaPruebas({ interpretar: modeloSimulado });
fijarReloj("2026-11-09", "10:00");
const srv = app.listen(0, "127.0.0.1");
await new Promise<void>((ok) => srv.once("listening", () => ok()));
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
console.log(`Semilla: ${SEMILLA}`);
const a = azar(SEMILLA);

async function login(correo: string, clave: string): Promise<string> {
  const r = await fetch(base + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo, clave }) });
  return ((await r.json()) as { token: string }).token;
}
const TOK = {
  estudiante: await login("laura.gomez@estudiantes.uniespinal.test", "Estudiante2026!"),
  docente: await login("carlos.medina@docentes.uniespinal.test", "Docente2026!"),
  monitor: await login("monitor.salas@uniespinal.test", "Monitor2026!"),
};
const MONITOR = ["/salas", "/reservas", "/reservas/dias", "/reservas/RS-0001", "/notificaciones", "/casos", "/salas/laboratorios", "/evaluar"];
const RUTAS = ["/salud", "/login", "/logout", "/yo", "/mensaje", "/disponibilidad", ...MONITOR, "/notificaciones/1", "/reservas/RS-9999", "/", "/admin", "/../.env", "/%2e%2e/.env", "/salas/../.env"];
const CLAVES = ["texto", "sesion", "correo", "clave", "estado", "laboratorio", "id_sintetico", "franja", "tipo_evento", "__proto__", "constructor", "prototype", "rol", "autenticado"];

function valor(prof: number): unknown {
  const r = a.n();
  if (prof > 3 || r < 0.35) {
    return a.uno([null, true, false, 0, -1, 1e308, a.entero(-1e6, 1e6), cadenaRara(a, a.entero(0, 40)), "hola", "C-10000002", "RS-0001", "atendida", "sala-1"]);
  }
  if (r < 0.55) return Array.from({ length: a.entero(0, 4) }, () => valor(prof + 1));
  const o: Record<string, unknown> = {};
  for (let i = 0; i < a.entero(0, 5); i++) o[a.si(0.8) ? a.uno(CLAVES) : cadenaRara(a, 6)] = valor(prof + 1);
  return o;
}
// encodeURIComponent falla con surrogates sueltos: se codifican los bytes UTF-8 a mano.
const codificar = (t: string) => [...Buffer.from(t)].map((b) => `%${b.toString(16).padStart(2, "0")}`).join("");
function tokenAlterado(t: string): string {
  const i = a.entero(0, t.length - 1);
  return t.slice(0, i) + a.uno(["A", "x", "_", "-", "."]) + t.slice(i + 1);
}
function autorizacion(): [string, string | null] {
  const r = a.n();
  if (r < 0.25) return ["ninguna", null];
  // Las cabeceras HTTP solo admiten bytes (0–255): la basura Unicode se manda como sus bytes UTF-8 en latin1.
  if (r < 0.4) return ["basura", `Bearer ${Buffer.from(cadenaRara(a, a.entero(1, 60))).toString("latin1").replace(/[\r\n\0]/g, "")}`];
  if (r < 0.5) return ["alterado", `Bearer ${tokenAlterado(a.uno([TOK.monitor, TOK.estudiante]))}`];
  if (r < 0.65) return ["estudiante", `Bearer ${TOK.estudiante}`];
  if (r < 0.75) return ["docente", `Bearer ${TOK.docente}`];
  if (r < 0.9) return ["monitor", `Bearer ${TOK.monitor}`];
  return ["formato raro", a.uno(["Basic YWRtaW46YWRtaW4=", "Bearer", "bearer " + TOK.monitor, `Bearer ${TOK.monitor} extra`, "Bearer a.b.c"])];
}

const N = cuantas(1500);
const t0 = Date.now();
const contaminacion = () => Object.keys(Object.prototype).length > 0 || ({} as Record<string, unknown>).polluted !== undefined;
let noEnviadas = 0, cincos = 0, conFuga = 0, monitorSinToken = 0, loginAleatorio = 0, colgados = 0;
try {
  for (let i = 0; i < N; i++) {
    if (i % 15 === 0) reiniciarLimiteLogin();
    const metodo = a.uno(["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"]);
    let ruta = a.uno(RUTAS);
    if (a.si(0.2)) ruta += `?${a.uno(["fecha", "sala", "mes", "estado", "x"])}=${codificar(cadenaRara(a, a.entero(0, 20)))}`;
    if (a.si(0.05)) ruta += a.uno(["%E0%A4%A", "%", "%zz", "/%00"]);
    const [tipoAuth, auth] = autorizacion();
    const headers: Record<string, string> = {};
    if (auth) headers.Authorization = auth;
    let body: string | undefined;
    if (metodo !== "GET" && metodo !== "HEAD") {
      const r = a.n();
      if (r < 0.55) body = JSON.stringify(valor(0));
      else if (r < 0.7) body = cadenaRara(a, a.entero(0, 200));
      else if (r < 0.8) body = JSON.stringify({ texto: cadenaRara(a, a.entero(1, 600)), sesion: a.uno(["00000000-0000-4000-8000-000000000001", "no-uuid", undefined]) });
      else if (r < 0.9) body = `{"__proto__":{"polluted":true},"texto":"hola","constructor":{"prototype":{"polluted":true}}}`;
      else body = "x".repeat(a.entero(9_000, 12_000));
      headers["Content-Type"] = a.uno(["application/json", "application/json", "text/plain", "application/json; charset=latin9", "application/x-www-form-urlencoded", "application/json; charset=utf-8"]);
    }
    const entrada = { metodo, ruta, auth: tipoAuth, body: body?.slice(0, 200) };
    let res: Response | "colgado";
    try {
      res = await conLimite(fetch(base + ruta, { method: metodo, headers, body }), 8000);
    } catch (e) {
      // El propio cliente rechaza algunas peticiones (cabecera inválida, cuerpo en HEAD): no llegan al servidor.
      noEnviadas++;
      if (noEnviadas <= 3) console.log(`   (no enviada por el cliente: ${(e as Error).message.slice(0, 80)})`);
      continue;
    }
    if (res === "colgado") { colgados++; inf.hallazgo("colgado", "sin respuesta en 8 s", entrada); continue; }
    const texto = await res.text();
    if (res.status >= 500) { cincos++; inf.hallazgo("5xx", `status ${res.status}: ${texto.slice(0, 120)}`, entrada); }
    const f = fugas(texto);
    if (f.length) { conFuga++; inf.hallazgo("fuga", f.join(" | "), entrada); }
    const rutaBase = ruta.split("?")[0];
    if (MONITOR.includes(rutaBase) && res.status === 200 && tipoAuth !== "monitor" && metodo !== "OPTIONS") {
      monitorSinToken++; inf.hallazgo("autorizacion", `${metodo} ${rutaBase} → 200 con auth ${tipoAuth}`, entrada);
    }
    if (rutaBase === "/login" && metodo === "POST" && res.status === 200) {
      loginAleatorio++; inf.hallazgo("login", "credenciales aleatorias aceptadas", entrada);
    }
    if (contaminacion()) inf.hallazgo("prototipo", "Object.prototype contaminado", entrada);
  }
  const ms = Date.now() - t0;
  console.log(`${N - noEnviadas} peticiones enviadas (${noEnviadas} rechazadas por el cliente) en ${(ms / 1000).toFixed(1)} s`);
  inf.objetivo(`ninguna respuesta 5xx (${cincos})`, cincos === 0);
  inf.objetivo(`ninguna petición colgada (${colgados})`, colgados === 0);
  inf.objetivo(`sin fugas de carnés, trazas, URI ni hashes (${conFuga})`, conFuga === 0);
  inf.objetivo(`rutas del monitor nunca 200 sin su token (${monitorSinToken})`, monitorSinToken === 0);
  inf.objetivo(`/login nunca acepta credenciales aleatorias (${loginAleatorio})`, loginAleatorio === 0);
  inf.objetivo("Object.prototype sin contaminar", !contaminacion() && inf.cuenta("prototipo") === 0);
} catch (e) {
  inf.objetivo(`el fuzzer terminó sin excepción: ${(e as Error).message}`, false);
} finally {
  srv.close();
  restaurarLog(tam0);
}
inf.terminar();
