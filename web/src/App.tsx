import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { api } from "./api";
import type { TipoBase } from "../../agent/api-tipos";
import "./styles/salas.css";
import "./styles/login.css";
import { SesionProvider } from "./components/SesionContexto";
import { useSesion } from "./sesion";
import SoloRol from "./components/SoloRol";
import Ingresar from "./pages/Ingresar";
import NavegacionLateral from "./components/NavegacionLateral";
import Monitor from "./pages/Monitor";
import Chat from "./pages/Chat";
import Salas from "./pages/Salas";

// Etiqueta de la base según el tipo que informa la API (sin URI).
const ETIQUETA_BASE: Record<TipoBase, string> = { local: "MongoDB local", atlas: "MongoDB Atlas", remota: "MongoDB remoto", memoria: "Memoria" };

export default function App() {
  return (
    <SesionProvider>
      <Aplicacion />
    </SesionProvider>
  );
}

// Inicio: el monitor ve Laboratorios; estudiantes, docentes y visitantes van al chat.
function Inicio() {
  const { usuario } = useSesion();
  if (usuario?.rol === "monitor") return <SoloRol rol="monitor"><Monitor /></SoloRol>;
  return <Navigate to="/chat" replace />;
}

function Aplicacion() {
  // null mientras se consulta; false si la API no responde.
  const [proveedor, setProveedor] = useState<string | false | null>(null);
  const [base, setBase] = useState<TipoBase | null>(null);

  useEffect(() => {
    api.salud()
      .then((s) => { setProveedor(s.proveedor); setBase(s.base); })
      .catch(() => setProveedor(false));
  }, []);

  return (
    <div className="salas-a">
      <div className="sa-shell">
        <NavegacionLateral etiquetaBase={base ? ETIQUETA_BASE[base] : "Memoria"} proveedor={proveedor} />
        <main className="sa-principal">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/ingresar" element={<Ingresar />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/salas" element={<SoloRol rol="monitor"><Salas /></SoloRol>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="small text-secondary">
            Prototipo académico · Inteligencia Artificial · UniEspinal 2026 · Datos sintéticos
          </footer>
        </main>
      </div>
    </div>
  );
}
