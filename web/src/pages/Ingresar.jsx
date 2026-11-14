import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useSesion } from "../sesion.js";
import Ilustracion from "../components/Ilustracion.jsx";

// Destino por rol: el monitor a su vista Salas; estudiantes y docentes al chat.
const inicioDe = (rol) => (rol === "monitor" ? "/salas" : "/chat");

export default function Ingresar() {
  const { usuario, entrar } = useSesion();
  const navegar = useNavigate();
  const desde = useLocation().state?.desde;
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={inicioDe(usuario.rol)} replace />;

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      const u = await entrar(correo, clave);
      setClave("");
      navegar(desde && u.rol === "monitor" ? desde : inicioDe(u.rol), { replace: true });
    } catch (err) {
      setError(err.message);
      setClave("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="gl-ingreso" aria-labelledby="titulo-ingreso">
      <div className="gl-ingreso-arte" aria-hidden="true">
        <Ilustracion nombre="autenticacion" ancho={300} prioridad />
      </div>
      <form className="gl-ingreso-form" onSubmit={enviar} noValidate>
        <h1 id="titulo-ingreso" className="sa-titulo">Inicia sesión</h1>
        <p className="sa-subtitulo">
          Estudiantes y docentes reservan y cancelan sus salas desde el chat. El monitor entra a la vista Salas.
        </p>

        <label htmlFor="correo" className="gl-etiqueta">Correo institucional</label>
        <input
          id="correo"
          type="email"
          className="form-control gl-campo"
          autoComplete="username"
          inputMode="email"
          placeholder="nombre.apellido@…uniespinal.test"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
          maxLength={120}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "error-ingreso" : undefined}
        />

        <label htmlFor="clave" className="gl-etiqueta">Contraseña</label>
        <div className="gl-clave">
          <input
            id="clave"
            type={verClave ? "text" : "password"}
            className="form-control gl-campo"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            maxLength={128}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "error-ingreso" : undefined}
          />
          <button
            type="button"
            className="gl-ver-clave"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={verClave}
          >
            <i className={`bi ${verClave ? "bi-eye-slash" : "bi-eye"}`} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p id="error-ingreso" className="gl-error" role="alert">
            <i className="bi bi-exclamation-circle me-2" aria-hidden="true" />{error}
          </p>
        )}

        <button type="submit" className="sa-btn sa-btn-primario gl-entrar" disabled={enviando || !correo.trim() || !clave}>
          {enviando ? "Verificando…" : "Iniciar sesión"}
        </button>
        <p className="gl-nota">
          Sin iniciar sesión, el chat te informa la disponibilidad y el estado de las salas. Cuentas de prueba: docs/cuentas-de-prueba.md.
        </p>
      </form>
    </section>
  );
}
