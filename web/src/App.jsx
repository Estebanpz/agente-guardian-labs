import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router";
import { api } from "./api.js";
import Monitor from "./pages/Monitor.jsx";
import Chat from "./pages/Chat.jsx";
import Salas from "./pages/Salas.jsx";

export default function App() {
  const [proveedor, setProveedor] = useState(null);
  const [repositorio, setRepositorio] = useState(null);

  useEffect(() => {
    api.salud()
      .then((s) => { setProveedor(s.proveedor); setRepositorio(s.repositorio); })
      .catch(() => setProveedor(false));
  }, []);

  const enlace = ({ isActive }) => "nav-link" + (isActive ? " active" : "");
  const colorPunto = proveedor === null ? "#d1d5db" : proveedor ? "var(--gl-permitir)" : "var(--gl-negar)";

  return (
    <>
      <nav className="navbar navbar-expand gl-nav sticky-top">
        <div className="container flex-wrap gap-2">
          <span className="navbar-brand d-flex align-items-center gap-2 fw-bold">
            <span className="gl-logo"><i className="bi bi-shield-check" /></span>
            Guardian Labs
          </span>
          <div className="navbar-nav gl-tabs gap-1">
            <NavLink to="/" end className={enlace}><i className="bi bi-pc-display me-1" />Laboratorios</NavLink>
            <NavLink to="/chat" className={enlace}><i className="bi bi-chat-dots me-1" />Chat</NavLink>
            <NavLink to="/salas" className={enlace}><i className="bi bi-grid-3x3-gap me-1" />Salas</NavLink>
          </div>
          <span className="gl-estado-api d-none d-md-flex align-items-center gap-2">
            <span className="gl-punto" style={{ background: colorPunto }} />
            {proveedor === null ? "Conectando…" : proveedor ? proveedor : "API sin conexión"}
            {repositorio && (
              <span className="d-inline-flex align-items-center gap-1" title="Base de datos de demostración">
                <i className="bi bi-database" />{repositorio === "mongo" ? "Atlas" : "Memoria"}
              </span>
            )}
          </span>
        </div>
      </nav>

      <main className="container py-4">
        <Routes>
          <Route path="/" element={<Monitor />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/salas" element={<Salas />} />
        </Routes>
      </main>

      <footer className="container pb-4 text-center">
        Prototipo académico · Inteligencia Artificial · UniEspinal 2026 · Datos sintéticos
      </footer>
    </>
  );
}
