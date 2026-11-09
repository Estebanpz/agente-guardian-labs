import { useEffect, useState } from "react";
import { Route, Routes } from "react-router";
import { api } from "./api.js";
import "./styles/salas.css";
import NavegacionLateral from "./components/NavegacionLateral.jsx";
import Monitor from "./pages/Monitor.jsx";
import Chat from "./pages/Chat.jsx";
import Salas from "./pages/Salas.jsx";

// Etiqueta de la base según el tipo que informa la API (sin URI).
const ETIQUETA_BASE = { local: "MongoDB local", atlas: "MongoDB Atlas", remota: "MongoDB remoto", memoria: "Memoria" };

export default function App() {
  const [proveedor, setProveedor] = useState(null);
  const [base, setBase] = useState(null);

  useEffect(() => {
    api.salud()
      .then((s) => { setProveedor(s.proveedor); setBase(s.base); })
      .catch(() => setProveedor(false));
  }, []);

  return (
    <div className="salas-a">
      <div className="sa-shell">
        <NavegacionLateral etiquetaBase={ETIQUETA_BASE[base] ?? "Memoria"} proveedor={proveedor} />
        <main className="sa-principal">
          <Routes>
            <Route path="/" element={<Monitor />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/salas" element={<Salas />} />
          </Routes>
          <footer className="small text-secondary">
            Prototipo académico · Inteligencia Artificial · UniEspinal 2026 · Datos sintéticos
          </footer>
        </main>
      </div>
    </div>
  );
}
