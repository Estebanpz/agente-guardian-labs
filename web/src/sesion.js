// Sesión del navegador (entorno de pruebas): token y datos públicos de quien inició sesión, en localStorage.
// Una sola clave; su valor cambia con la persona que inicia sesión y se borra al cerrar sesión o si el token vence.
// El token lo firma la API: editar este valor a mano no da otro rol, la API lo rechaza.
import { createContext, useContext } from "react";

const CLAVE = "guardian.sesion";

// Contexto de React con { usuario, entrar, salir }; lo llena SesionProvider (components/SesionContexto.jsx).
export const ContextoSesion = createContext(null);
export const useSesion = () => useContext(ContextoSesion);
export const EVENTO_SESION = "guardian:sesion";

export function leerSesion() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    return s && typeof s.token === "string" && s.usuario ? s : null;
  } catch {
    return null;
  }
}

function avisar() {
  window.dispatchEvent(new Event(EVENTO_SESION));
}

export function guardarSesion(token, usuario) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ token, usuario }));
  } catch {
    // Sin almacenamiento la sesión dura lo que dure la página (queda en memoria del proveedor).
  }
  avisar();
}

export function borrarSesion() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
  avisar();
}
