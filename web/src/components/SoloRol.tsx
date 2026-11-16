import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import type { Rol } from "../../../agent/api-tipos";
import { useSesion } from "../sesion";
import Ilustracion from "./Ilustracion";

// Vista restringida a un rol. Sin sesión lleva al inicio de sesión (y vuelve después); con otro rol lo explica.
export default function SoloRol({ rol, children }: { rol: Rol; children: ReactNode }) {
  const { usuario } = useSesion();
  const ubicacion = useLocation();
  if (!usuario) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (usuario.rol !== rol) {
    return (
      <section className="gl-acceso" aria-labelledby="sin-permiso">
        <Ilustracion nombre="negado" ancho={200} />
        <h1 id="sin-permiso" className="sa-titulo">Esta vista es del monitor de salas</h1>
        <p className="sa-subtitulo">
          Iniciaste sesión como {usuario.rol}. Desde el chat puedes reservar, consultar disponibilidad y cancelar tus reservas.
        </p>
        <Link to="/chat" className="sa-btn sa-btn-primario text-decoration-none">Ir al chat</Link>
      </section>
    );
  }
  return children;
}
