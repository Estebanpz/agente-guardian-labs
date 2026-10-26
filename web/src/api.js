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

export const api = {
  salud: () => pedir("/salud"),
  salas: () => pedir("/salas"),
  evaluar: (entrada) => pedir("/evaluar", { method: "POST", body: JSON.stringify(entrada) }),
  mensaje: (texto, laboratorio) =>
    pedir("/mensaje", { method: "POST", body: JSON.stringify({ texto, laboratorio }) }),
};
