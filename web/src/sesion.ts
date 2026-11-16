// Sesión del navegador (entorno de pruebas): token y datos públicos de quien inició sesión, en localStorage.
// Una sola clave; su valor cambia con la persona que inicia sesión y se borra al cerrar sesión o si el token vence.
// El token lo firma la API: editar este valor a mano no da otro rol, la API lo rechaza.
import { createContext, useContext } from "react";
import type { UsuarioSesion } from "../../agent/api-tipos";

const CLAVE = "guardian.sesion";

export type SesionGuardada = { token: string; usuario: UsuarioSesion };
export type ValorSesion = {
  usuario: UsuarioSesion | null;
  entrar: (correo: string, clave: string) => Promise<UsuarioSesion>;
  salir: () => Promise<void>;
};

// Contexto de React con { usuario, entrar, salir }; lo llena SesionProvider (components/SesionContexto.tsx).
export const ContextoSesion = createContext<ValorSesion | null>(null);
export const useSesion = (): ValorSesion => {
  const valor = useContext(ContextoSesion);
  if (!valor) throw new Error("useSesion se usa dentro de SesionProvider.");
  return valor;
};
export const EVENTO_SESION = "guardian:sesion";

export function leerSesion(): SesionGuardada | null {
  try {
    const s: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (s && typeof s === "object" && typeof (s as SesionGuardada).token === "string" && (s as SesionGuardada).usuario) {
      return s as SesionGuardada;
    }
    return null;
  } catch {
    return null;
  }
}

function avisar(): void {
  window.dispatchEvent(new Event(EVENTO_SESION));
}

export function guardarSesion(token: string, usuario: UsuarioSesion): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ token, usuario }));
  } catch {
    // Sin almacenamiento la sesión dura lo que dure la página (queda en memoria del proveedor).
  }
  avisar();
}

export function borrarSesion(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
  avisar();
}
