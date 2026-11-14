// Pruebas de la API de la vista Salas del monitor (plan de la vista, sección 3). Repositorio en memoria.
// Uso: npm run pruebas (incluida). No abre el puerto 3000: usa un servidor efímero en 127.0.0.1.
import type { AddressInfo } from "node:net";
process.env.REPOSITORIO = "memoria";
const { app } = await import("../agent/channels/http.js");
const { crearRepositorio } = await import("../agent/store/repositorio.js");

const srv = app.listen(0, "127.0.0.1");
await new Promise<void>((listo) => srv.once("listening", () => listo()));
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
let fallos = 0;
const comprobar = (ok: boolean, texto: string) => {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${texto}`);
};
// Las rutas del monitor exigen su sesión (login por rol): se inicia con la cuenta sintética del monitor.
const login = await fetch(base + "/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ correo: "monitor.salas@uniespinal.test", clave: "Monitor2026!" }),
});
const TOKEN = ((await login.json()) as { token: string }).token;
const pedir = async (ruta: string, init?: RequestInit) => {
  const res = await fetch(base + ruta, { ...init, headers: { ...(init?.headers as Record<string, string>), Authorization: `Bearer ${TOKEN}` } });
  const texto = await res.text();
  return { status: res.status, texto, json: () => JSON.parse(texto) as any };
};
// Ningún carné completo puede salir de la API.
const CARNE_COMPLETO = /\b[CD]-\d{8}\b/;

try {
  const repo = await crearRepositorio();
  // Las reservas de la semilla son relativas a hoy: el día de prueba sale de RS-0001.
  const FECHA = (await repo.reservaPorCodigo("RS-0001"))!.fecha;
  const MES = FECHA.slice(0, 7);

  // 1) Días del mes con reservas: el día de la semilla coincide con la base.
  const dias = await pedir(`/reservas/dias?mes=${MES}`);
  const dia = dias.json().find((d: { fecha: string }) => d.fecha === FECHA);
  const programadasBase = (await repo.reservasDelDia(FECHA)).length;
  comprobar(dias.status === 200 && dia?.programadas === programadasBase && dia.escaladas === 0,
    `días del mes con reservas (${FECHA}: ${dia?.programadas ?? 0} programadas, base ${programadasBase})`);
  comprobar((await pedir("/reservas/dias?mes=2026-13")).status === 400, "mes inválido → 400");

  // 2) Detalle con solicitante y carné enmascarado (RS-0001 es de C-10000002, Juan Camilo Torres Díaz).
  const detalle = await pedir("/reservas/RS-0001");
  const r1 = detalle.json();
  comprobar(detalle.status === 200 && r1.carne === "C-****0002" && r1.solicitante?.nombres === "Juan Camilo"
    && r1.solicitante?.rol === "estudiante" && r1.solicitante?.programa !== undefined && !("_id" in r1.solicitante),
    "detalle con solicitante (nombre, programa, jornada) y carné enmascarado");
  comprobar(!CARNE_COMPLETO.test(detalle.texto), "el detalle no contiene el carné completo");
  comprobar((await pedir("/reservas/RS-9999")).status === 404, "código inexistente → 404");
  comprobar((await pedir("/reservas/XX-1")).status === 400, "código con formato inválido → 400");

  // 3) Avisos: uno nuevo, marcar como atendido, y los cambios no permitidos.
  await repo.notificar({
    para: "monitor", motivo: "R17: prueba de aviso", regla: "R17", reserva_codigo: null,
    carne: "C-10000002", estado: "pendiente", creada: new Date(),
  });
  const pend = (await pedir("/notificaciones?estado=pendiente")).json();
  const aviso = pend.find((a: { motivo: string }) => a.motivo === "R17: prueba de aviso");
  comprobar(!!aviso && aviso.carne === "C-****0002" && aviso.solicitante === "Juan Camilo Torres Díaz" && typeof aviso._id === "string",
    "aviso con carné enmascarado, nombre del solicitante e id de texto");
  comprobar(!CARNE_COMPLETO.test(JSON.stringify(pend)), "/notificaciones no contiene el carné completo");
  const patch = (cuerpo: unknown) => pedir(`/notificaciones/${aviso._id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
  });
  comprobar((await patch({ estado: "pendiente" })).status === 400, "PATCH con otro estado → 400");
  comprobar((await patch({ estado: "atendida", motivo: "otro" })).status === 400, "PATCH con otro campo → 400");
  const ok = await patch({ estado: "atendida" });
  comprobar(ok.status === 200 && ok.json().ok === true, "PATCH { estado: atendida } → 200");
  const atendidos = (await pedir("/notificaciones?estado=atendida")).json();
  const marcado = atendidos.find((a: { _id: string }) => a._id === aviso._id);
  comprobar(!!marcado?.atendida_en, "el aviso pasa a atendidos con la hora");
  comprobar((await patch({ estado: "atendida" })).status === 404, "volver a marcarlo → 404");
  comprobar((await pedir("/notificaciones/no-existe", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "atendida" }),
  })).status === 404, "aviso inexistente → 404");

  // 4) /salas?fecha= coincide con /reservas?fecha= (programadas y escaladas).
  const salas = (await pedir(`/salas?fecha=${FECHA}`)).json();
  const lista = (await pedir(`/reservas?fecha=${FECHA}`)).json();
  const delSalas = salas.flatMap((s: { reservas: { codigo: string }[] }) => s.reservas.map((r) => r.codigo)).sort();
  const delReservas = lista.map((r: { codigo: string }) => r.codigo).sort();
  comprobar(JSON.stringify(delSalas) === JSON.stringify(delReservas) && delSalas.length > 0,
    `/salas?fecha= tiene las mismas reservas que /reservas?fecha= (${delSalas.length})`);
  const primera = salas.find((s: { reservas: unknown[] }) => s.reservas.length > 0);
  comprobar(primera && typeof primera.en_revision === "number" && Array.isArray(primera.equipos)
    && primera.reservas.every((r: { carne: string }) => !CARNE_COMPLETO.test(r.carne)),
    "/salas trae equipos, equipos en revisión y reservas con carné enmascarado");
  comprobar(!CARNE_COMPLETO.test(JSON.stringify(salas)), "/salas no contiene el carné completo");
} catch (e) {
  fallos++;
  console.error(`❌ Error: ${(e as Error).message}`);
} finally {
  srv.close();
}
console.log(fallos === 0 ? "\nTodas pasaron" : `\n${fallos} fallaron`);
process.exit(fallos === 0 ? 0 : 1);
