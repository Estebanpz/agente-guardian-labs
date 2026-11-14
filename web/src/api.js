// Cliente de la API del agente (Express detrás del proxy /api). Con sesión, cada petición lleva el token.
import { borrarSesion, leerSesion } from "./sesion.js";

async function pedir(ruta, opciones = {}) {
  const sesion = leerSesion();
  const res = await fetch(`/api${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
    },
  });
  const datos = await res.json().catch(() => ({}));
  // Token vencido o revocado: se olvida la sesión y la interfaz vuelve a pedir el inicio de sesión.
  if (res.status === 401 && sesion && ruta !== "/login") borrarSesion();
  if (!res.ok) throw new Error(datos.error ?? `Error ${res.status}`);
  return datos;
}

const consulta = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ""));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const api = {
  salud: () => pedir("/salud"),
  // Inicio y cierre de sesión por rol (estudiante, docente, monitor).
  login: (correo, clave) => pedir("/login", { method: "POST", body: JSON.stringify({ correo, clave }) }),
  logout: () => pedir("/logout", { method: "POST" }),
  yo: () => pedir("/yo"),
  // Vista Laboratorios (ingreso, sala-1 a sala-3). Solo el monitor.
  laboratorios: () => pedir("/salas/laboratorios"),
  // Reservas: 16 salas con equipos y reservas del día. Las cargas aceptan una señal para cancelarse.
  salas: (signal) => pedir("/salas", { signal }),
  casos: () => pedir("/casos"),
  evaluar: (entrada) => pedir("/evaluar", { method: "POST", body: JSON.stringify(entrada) }),
  // El chat ya no envía laboratorio: la sala la dice el mensaje (la pestaña Laboratorios usa su propio flujo).
  mensaje: (texto, sesion) =>
    pedir("/mensaje", { method: "POST", body: JSON.stringify({ texto, sesion }) }),
  disponibilidad: (sala, fecha, signal) => pedir(`/disponibilidad${consulta({ sala, fecha })}`, { signal }),
  reservas: (fecha, signal) => pedir(`/reservas${consulta({ fecha })}`, { signal }),
  notificaciones: (estado = "pendiente", signal) => pedir(`/notificaciones${consulta({ estado })}`, { signal }),
  // Vista Salas del monitor (plan de la vista): estado de un día, días del mes con reservas y avisos.
  salasDia: (fecha, signal) => pedir(`/salas${consulta({ fecha })}`, { signal }),
  diasMes: (mes, signal) => pedir(`/reservas/dias${consulta({ mes })}`, { signal }),
  avisos: (estado, signal) => pedir(`/notificaciones${consulta({ estado })}`, { signal }),
  marcarAtendida: (id) =>
    pedir(`/notificaciones/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ estado: "atendida" }) }),
};
