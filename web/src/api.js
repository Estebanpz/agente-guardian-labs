// Cliente de la API del agente (Express detrás del proxy /api).
async function pedir(ruta, opciones = {}) {
  const res = await fetch(`/api${ruta}`, {
    headers: { "Content-Type": "application/json" },
    ...opciones,
  });
  const datos = await res.json().catch(() => ({}));
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
  // Vista Laboratorios (ingreso, sala-1 a sala-3).
  laboratorios: () => pedir("/salas/laboratorios"),
  // Reservas: 16 salas con equipos y reservas del día. Las cargas aceptan una señal para cancelarse.
  salas: (signal) => pedir("/salas", { signal }),
  casos: () => pedir("/casos"),
  evaluar: (entrada) => pedir("/evaluar", { method: "POST", body: JSON.stringify(entrada) }),
  mensaje: (texto, laboratorio, sesion) =>
    pedir("/mensaje", { method: "POST", body: JSON.stringify({ texto, laboratorio, sesion }) }),
  disponibilidad: (sala, fecha, signal) => pedir(`/disponibilidad${consulta({ sala, fecha })}`, { signal }),
  reservas: (fecha, signal) => pedir(`/reservas${consulta({ fecha })}`, { signal }),
  notificaciones: (estado = "pendiente", signal) => pedir(`/notificaciones${consulta({ estado })}`, { signal }),
};
