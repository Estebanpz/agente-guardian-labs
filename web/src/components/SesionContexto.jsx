import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { ContextoSesion, EVENTO_SESION, borrarSesion, guardarSesion, leerSesion } from "../sesion.js";

// Quién inició sesión. Al cargar, el token guardado se confirma con la API (/yo); si venció, se borra.
export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leerSesion);

  useEffect(() => {
    const sincronizar = () => setSesion(leerSesion());
    window.addEventListener(EVENTO_SESION, sincronizar);
    // Otra pestaña inició o cerró sesión.
    window.addEventListener("storage", sincronizar);
    return () => {
      window.removeEventListener(EVENTO_SESION, sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, []);

  useEffect(() => {
    if (leerSesion()) api.yo().catch(() => {});
  }, []);

  const entrar = useCallback(async (correo, clave) => {
    const r = await api.login(correo, clave);
    guardarSesion(r.token, r.usuario);
    return r.usuario;
  }, []);

  const salir = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Sin conexión: igual se borra la sesión de este navegador.
    }
    borrarSesion();
  }, []);

  return (
    <ContextoSesion.Provider value={{ usuario: sesion?.usuario ?? null, entrar, salir }}>
      {children}
    </ContextoSesion.Provider>
  );
}

