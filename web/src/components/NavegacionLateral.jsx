import { useState } from "react";
import { NavLink } from "react-router";

// Preferencia de la barra (expandida o contraída), recordada en este navegador. Si el almacenamiento no
// está disponible, la barra arranca expandida.
const CLAVE = "gl-barra-contraida";
const leerContraida = () => {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
};
const guardarContraida = (v) => {
  try {
    localStorage.setItem(CLAVE, v ? "1" : "0");
  } catch {
    // Sin almacenamiento: la preferencia dura lo que dure la página.
  }
};

// Barra lateral de navegación, igual en todas las vistas (Laboratorios, Chat y Salas).
// El botón la contrae a iconos para dar más ancho al contenido, y la vuelve a expandir.
export default function NavegacionLateral({ etiquetaBase, proveedor }) {
  const [contraida, setContraida] = useState(leerContraida);
  const conexion = proveedor === false ? "Sin conexión con la API" : proveedor || "Conectando…";

  const alternar = () => {
    setContraida((v) => {
      guardarContraida(!v);
      return !v;
    });
  };

  return (
    <aside className={`sa-lateral${contraida ? " sa-contraida" : ""}`} aria-label="Secciones y estado">
      <div className="sa-cabecera-lateral">
        <div className="sa-marca" title="Guardian Labs">
          <span className="sa-marca-icono"><i className="bi bi-shield-check text-white" aria-hidden="true" /></span>
          <span className="sa-texto">Guardian Labs</span>
        </div>
        <button
          type="button"
          className="sa-alternar"
          aria-expanded={!contraida}
          aria-controls="sa-navegacion"
          aria-label={contraida ? "Expandir la barra lateral" : "Contraer la barra lateral"}
          title={contraida ? "Expandir la barra lateral" : "Contraer la barra lateral"}
          onClick={alternar}
        >
          <i className={`bi ${contraida ? "bi-chevron-double-right" : "bi-chevron-double-left"}`} aria-hidden="true" />
        </button>
      </div>
      <nav id="sa-navegacion" aria-label="Secciones" className="sa-nav">
        <NavLink to="/" aria-label="Laboratorios" title="Laboratorios">
          <i className="bi bi-pc-display" aria-hidden="true" /><span className="sa-texto">Laboratorios</span>
        </NavLink>
        <NavLink to="/chat" aria-label="Chat" title="Chat">
          <i className="bi bi-chat-dots" aria-hidden="true" /><span className="sa-texto">Chat</span>
        </NavLink>
        <NavLink to="/salas" aria-label="Salas" title="Salas">
          <i className="bi bi-grid-3x3-gap" aria-hidden="true" /><span className="sa-texto">Salas</span>
        </NavLink>
      </nav>
      <div className="sa-estado-base">
        <strong title={etiquetaBase}>
          <span className={`sa-punto${proveedor === false ? " sa-punto-error" : ""}`} aria-hidden="true" />
          <span className="sa-texto">{etiquetaBase ?? "Base de datos"}</span>
        </strong>
        <div className="sa-texto">{conexion}</div>
        <div className="sa-texto">Datos sintéticos de demostración</div>
      </div>
    </aside>
  );
}
