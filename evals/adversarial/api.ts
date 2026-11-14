// Ataques a la API Express (agent/channels/http.ts). Levanta la app en memoria en un puerto efímero.
import { restaurarLog } from "./comun.js";
import { fijarReloj, liberarReloj } from "../../agent/tools/reloj.js";

process.env.REPOSITORIO = "memoria";
fijarReloj("2026-11-09", "10:00");
const { app } = await import("../../agent/channels/http.js");

const srv = app.listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const port = (srv.address() as any).port;
const base = `http://127.0.0.1:${port}`;

type R = { status: number; body: any };
async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<R> {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: cuerpo !== undefined ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const txt = await res.text();
  let body: any;
  try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: res.status, body };
}

const filas: { id: string; cat: string; entrada: string; esperado: string; observado: string; falla: boolean }[] = [];
const A = (id: string, cat: string, entrada: string, esperado: string, observado: string, falla: boolean) =>
  filas.push({ id, cat, entrada, esperado, observado: String(observado).slice(0, 220), falla });

const ajeno = (s: string) => /RS-000[123]|Bases de Datos|Redes de Computadores|Juan Camilo|Carlos Eduardo|Patricia Elena|D-10000|[CD]-\d{8}/.test(s);

try {
  // A-01: /mensaje sin texto.
  let r = await pedir("POST", "/mensaje", {});
  A("A-01", "api/validacion", "POST /mensaje {}", "400", `${r.status}`, r.status !== 400);

  // A-02: /mensaje texto tipo número.
  r = await pedir("POST", "/mensaje", { texto: 123 });
  A("A-02", "api/validacion", "POST /mensaje {texto:123}", "400", `${r.status}`, r.status !== 400);

  // A-03: sesión no UUID.
  r = await pedir("POST", "/mensaje", { texto: "hola", sesion: "no-es-uuid" });
  A("A-03", "api/validacion", "sesion:'no-es-uuid'", "400", `${r.status}`, r.status !== 400);

  // A-04: campos extra no declarados (no hay .strict()).
  r = await pedir("POST", "/mensaje", { texto: "hola", laboratorio: "sala-1", admin: true, rol: "monitor" });
  A("A-04", "api/validacion", "POST /mensaje con campos extra {admin,rol}", "400 o campos ignorados sin efecto", `${r.status}; ${JSON.stringify(r.body).slice(0,80)}`, false);

  // A-05: laboratorio fuera de sala-1..3.
  r = await pedir("POST", "/mensaje", { texto: "hola", laboratorio: "sala-9" });
  A("A-05", "api/validacion", "laboratorio:'sala-9'", "400", `${r.status}`, r.status !== 400);

  // A-06: /mensaje texto > 500.
  r = await pedir("POST", "/mensaje", { texto: "a".repeat(501) });
  A("A-06", "api/validacion", "texto de 501 caracteres", "400", `${r.status}`, r.status !== 400);

  // A-07: cuerpo JSON malformado.
  r = await pedir("POST", "/mensaje", "{texto:");
  A("A-07", "api/validacion", "JSON malformado", "400", `${r.status}`, r.status >= 500);

  // A-08: PATCH /notificaciones/:id sin autorización (no hay ninguna) — ¿marca como atendida sin permisos?
  //   Primero generamos un aviso: R17 por carné desconocido.
  await pedir("POST", "/mensaje", { texto: "C-10000012", sesion: "00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  const avisos = await pedir("GET", "/notificaciones?estado=pendiente");
  const id = Array.isArray(avisos.body) && avisos.body[0]?._id;
  r = await pedir("PATCH", `/notificaciones/${id}`, { estado: "atendida" });
  A("A-08", "api/autorizacion", `PATCH /notificaciones/${id} {estado:atendida} sin auth`, "sin autenticación: cualquiera marca avisos como atendidos",
    `${r.status}; ${JSON.stringify(r.body)}`, r.status === 200);

  // A-09: PATCH con estado distinto.
  r = await pedir("PATCH", `/notificaciones/abc`, { estado: "pendiente" });
  A("A-09", "api/validacion", "PATCH estado:'pendiente'", "400", `${r.status}`, r.status !== 400);

  // A-10: /reservas/:codigo — ¿expone datos de la reserva ajena?
  r = await pedir("GET", "/reservas/RS-0002");
  A("A-10", "api/exposicion", "GET /reservas/RS-0002 (ajena, sin auth)", "carné enmascarado; evaluar si expone nombre/materia a cualquiera",
    `${r.status}; carne=${r.body?.carne}; solicitante=${JSON.stringify(r.body?.solicitante)}; materia=${r.body?.materia}`,
    typeof r.body?.carne === "string" && /\d{8}/.test(r.body.carne));

  // A-11: /reservas/:codigo con id inválido.
  r = await pedir("GET", "/reservas/RS-99999");
  A("A-11", "api/validacion", "GET /reservas/RS-99999", "400", `${r.status}`, r.status !== 400 && r.status !== 404);

  // A-12: /disponibilidad expone ocupadas con carné enmascarado y materia.
  r = await pedir("GET", "/disponibilidad?sala=sala-5&fecha=2026-11-10");
  A("A-12", "api/exposicion", "GET /disponibilidad?sala=sala-5", "¿expone materia/carné de la reserva ajena?",
    `ocupadas=${JSON.stringify(r.body?.ocupadas)}`, Array.isArray(r.body?.ocupadas) && r.body.ocupadas.some((o: any) => o.materia || o.carne_enmascarado));

  // A-13: /salas expone carné enmascarado completo.
  r = await pedir("GET", "/salas?fecha=2026-11-10");
  const salaConReserva = Array.isArray(r.body) ? r.body.find((s: any) => s.reservas?.length) : null;
  A("A-13", "api/exposicion", "GET /salas (vista monitor, sin auth)", "la vista monitor no debería ser pública sin auth",
    `ejemplo reserva: ${JSON.stringify(salaConReserva?.reservas?.[0])?.slice(0,160)}`, false);

  // A-14: /notificaciones expone nombre del solicitante sin auth.
  r = await pedir("GET", "/notificaciones?estado=pendiente");
  A("A-14", "api/exposicion", "GET /notificaciones (sin auth)", "expone solicitante (nombre) de avisos",
    `${JSON.stringify(r.body).slice(0,200)}`, Array.isArray(r.body) && r.body.some((a: any) => a.solicitante));

  // A-15: método no permitido / ruta inexistente.
  r = await pedir("DELETE", "/reservas/RS-0001");
  A("A-15", "api/metodo", "DELETE /reservas/RS-0001", "404/405, no borra", `${r.status}`, r.status === 200);
} finally {
  srv.close();
  liberarReloj();
  restaurarLog();
}

console.log("\n== API ==");
for (const f of filas) console.log(`${f.falla ? "FALLA " : "RESISTE"} ${f.id} [${f.cat}] ${f.entrada}\n   esperado: ${f.esperado}\n   observado: ${f.observado}`);
console.log(`Total ${filas.length}, fallas ${filas.filter((f) => f.falla).length}`);
