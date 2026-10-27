import { useState } from "react";
import Ilustracion from "./Ilustracion.jsx";

const META = {
  permitir: { titulo: "Permitir ingreso", icono: "bi-check-circle-fill", img: "permitir" },
  negar: { titulo: "Negar", icono: "bi-x-octagon-fill", img: "negado" },
  escalar: { titulo: "Escalar a una persona", icono: "bi-exclamation-triangle-fill", img: "escalar" },
};

const ASISTENCIA = { presente: "Presente", tardia: "Tardía", sin_registro: "Sin registro", no_aplica: "No aplica" };

// Muestra la recomendación del motor: decisión, explicación, reglas, versión y traza.
export default function TarjetaDecision({ resultado, compacta = false }) {
  const [verTraza, setVerTraza] = useState(false);
  const d = resultado?.decision;

  if (!d) {
    return (
      <div className="alert alert-warning mb-0">
        <i className="bi bi-question-circle me-2" />
        {resultado?.explicacion ?? "Sin resultado."}
      </div>
    );
  }

  const m = META[d.decision];

  return (
    <div className={`card gl-decision gl-decision-${d.decision}`}>
      <div className="card-body">
        <div className="d-flex align-items-start gap-3">
          <div className="flex-grow-1">
            <div className="small text-uppercase fw-semibold text-secondary">Recomendación del agente</div>
            <h4 className="gl-estado my-2">
              <i className={`bi ${m.icono} me-2`} />
              {m.titulo}
            </h4>
            <p className="mb-3">{resultado.explicacion}</p>
          </div>
          {!compacta && <Ilustracion nombre={m.img} ancho={130} className="d-none d-md-block" />}
        </div>

        {resultado.alerta && (
          <div className="alert alert-danger py-2 small">
            <i className="bi bi-shield-exclamation me-1" />
            {resultado.alerta}
          </div>
        )}

        <div className="d-flex flex-wrap gap-2 mb-3">
          {d.reglas_aplicadas.map((r) => (
            <span key={r} className="gl-chip"><i className="bi bi-diagram-3" />{r}</span>
          ))}
          {d.equipo_sugerido && (
            <span className="gl-chip gl-chip-ok"><i className="bi bi-pc-display" />Sugerido: {d.equipo_sugerido}</span>
          )}
          {d.estado_asistencia !== "no_aplica" && (
            <span className="gl-chip"><i className="bi bi-clock" />Asistencia: {ASISTENCIA[d.estado_asistencia]}</span>
          )}
          {d.notificar.map((n) => (
            <span key={n} className="gl-chip gl-chip-aviso"><i className="bi bi-bell" />Notificar: {n}</span>
          ))}
        </div>

        {d.hechos_desconocidos.length > 0 && (
          <div className="alert alert-warning py-2 small mb-2">
            <strong>Datos desconocidos:</strong> {d.hechos_desconocidos.join(", ").replaceAll("_", " ")}
          </div>
        )}
        {d.contradicciones.length > 0 && (
          <div className="alert alert-warning py-2 small mb-2">
            <strong>Fuentes en conflicto:</strong> {d.contradicciones.join("; ")}
          </div>
        )}

        <button type="button" className="btn btn-link btn-sm px-0 text-decoration-none" onClick={() => setVerTraza((v) => !v)}>
          <i className={`bi ${verTraza ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />
          {verTraza ? "Ocultar" : "Ver"} traza de reglas
        </button>
        {verTraza && (
          <ol className="small text-secondary mt-2 mb-0">
            {d.traza.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
        )}

        <hr />
        <div className="d-flex justify-content-between flex-wrap gap-2 aviso-recomendacion text-secondary">
          <span><i className="bi bi-person-check me-1" />Es una recomendación: la decisión final la toma el monitor.</span>
          <span><i className="bi bi-tag me-1" />Reglas v{d.version_reglas}</span>
        </div>
      </div>
    </div>
  );
}
