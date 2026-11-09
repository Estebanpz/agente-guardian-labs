import { NavLink } from "react-router";

// Barra lateral de navegación, igual en todas las vistas (Laboratorios, Chat y Salas).
export default function NavegacionLateral({ etiquetaBase, proveedor }) {
  const conexion = proveedor === false ? "Sin conexión con la API" : proveedor || "Conectando…";
  return (
    <aside className="sa-lateral" aria-label="Secciones y estado">
      <div className="sa-marca">
        <span className="sa-marca-icono"><i className="bi bi-shield-check text-white" aria-hidden="true" /></span>
        Guardian Labs
      </div>
      <nav aria-label="Secciones" className="sa-nav">
        <NavLink to="/"><i className="bi bi-pc-display" aria-hidden="true" />Laboratorios</NavLink>
        <NavLink to="/chat"><i className="bi bi-chat-dots" aria-hidden="true" />Chat</NavLink>
        <NavLink to="/salas"><i className="bi bi-grid-3x3-gap" aria-hidden="true" />Salas</NavLink>
      </nav>
      <div className="sa-estado-base">
        <strong>
          <span className={`sa-punto${proveedor === false ? " sa-punto-error" : ""}`} aria-hidden="true" />
          {etiquetaBase ?? "Base de datos"}
        </strong>
        <div>{conexion}</div>
        <div>Datos sintéticos de demostración</div>
      </div>
    </aside>
  );
}
