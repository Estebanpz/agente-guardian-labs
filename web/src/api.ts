// Cliente de la API del agente (Express detrás del proxy /api). Con sesión, cada petición lleva el token.
// Los tipos de cada respuesta son el contrato del servidor (agent/api-tipos.ts): si el servidor cambia una
// respuesta, este archivo deja de compilar (hallazgo 10 de la auditoría, 16-11-2026).
import type {
  Aviso, CasoDemo, DiaConReservas, DisponibilidadSala, EntradaEvaluar, Json, RespuestaLogin, RespuestaMensaje,
  RespuestaSalud, RespuestaYo, ResultadoEvaluar, ReservaMonitor, SalaDelDia, SalaLaboratorio,
} from "../../agent/api-tipos";
import { borrarSesion, leerSesion } from "./sesion";

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const sesion = leerSesion();
  const res = await fetch(`/api${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
    },
  });
  const datos: unknown = await res.json().catch(() => ({}));
  // Token vencido o revocado: se olvida la sesión y la interfaz vuelve a pedir el inicio de sesión.
  if (res.status === 401 && sesion && ruta !== "/login") borrarSesion();
  if (!res.ok) {
    const error = (datos as { error?: unknown }).error;
    throw new Error(typeof error === "string" ? error : `Error ${res.status}`);
  }
  return datos as T;
}

const consulta = (params: Record<string, string | null | undefined>): string => {
  const q = new URLSearchParams(
    Object.entries(params).filter((par): par is [string, string] => par[1] != null && par[1] !== ""),
  );
  const s = q.toString();
  return s ? `?${s}` : "";
};

export type EstadoAviso = "pendiente" | "atendida";

export const api = {
  salud: () => pedir<RespuestaSalud>("/salud"),
  // Inicio y cierre de sesión por rol (estudiante, docente, monitor).
  login: (correo: string, clave: string) =>
    pedir<RespuestaLogin>("/login", { method: "POST", body: JSON.stringify({ correo, clave }) }),
  logout: () => pedir<{ ok: true }>("/logout", { method: "POST" }),
  yo: () => pedir<RespuestaYo>("/yo"),
  // Vista Laboratorios (ingreso, sala-1 a sala-3). Solo el monitor.
  laboratorios: () => pedir<SalaLaboratorio[]>("/salas/laboratorios"),
  // Reservas: 16 salas con equipos y reservas del día. Las cargas aceptan una señal para cancelarse.
  salas: (signal?: AbortSignal) => pedir<SalaDelDia[]>("/salas", { signal }),
  casos: () => pedir<CasoDemo[]>("/casos"),
  evaluar: (entrada: EntradaEvaluar) =>
    pedir<ResultadoEvaluar>("/evaluar", { method: "POST", body: JSON.stringify(entrada) }),
  // El chat ya no envía laboratorio: la sala la dice el mensaje (la pestaña Laboratorios usa su propio flujo).
  mensaje: (texto: string, sesion: string) =>
    pedir<RespuestaMensaje>("/mensaje", { method: "POST", body: JSON.stringify({ texto, sesion }) }),
  disponibilidad: (sala: string, fecha?: string, signal?: AbortSignal) =>
    pedir<DisponibilidadSala>(`/disponibilidad${consulta({ sala, fecha })}`, { signal }),
  reservas: (fecha?: string, signal?: AbortSignal) =>
    pedir<Json<ReservaMonitor>[]>(`/reservas${consulta({ fecha })}`, { signal }),
  notificaciones: (estado: EstadoAviso = "pendiente", signal?: AbortSignal) =>
    pedir<Json<Aviso>[]>(`/notificaciones${consulta({ estado })}`, { signal }),
  // Vista Salas del monitor (plan de la vista): estado de un día, días del mes con reservas y avisos.
  salasDia: (fecha: string, signal?: AbortSignal) => pedir<SalaDelDia[]>(`/salas${consulta({ fecha })}`, { signal }),
  diasMes: (mes: string, signal?: AbortSignal) => pedir<DiaConReservas[]>(`/reservas/dias${consulta({ mes })}`, { signal }),
  avisos: (estado: EstadoAviso, signal?: AbortSignal) =>
    pedir<Json<Aviso>[]>(`/notificaciones${consulta({ estado })}`, { signal }),
  marcarAtendida: (id: string) =>
    pedir<{ ok: true }>(`/notificaciones/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ estado: "atendida" }) }),
};
