import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Cargando, ErrorApi } from "../components/Estado.jsx";
import { ilus } from "../assets/ilustraciones/index.js";

const ESTADOS = {
  disponible: { texto: "Disponible", icono: "bi-check-circle" },
  mantenimiento: { texto: "Mantenimiento", icono: "bi-tools" },
  diagnostico: { texto: "Diagnóstico", icono: "bi-activity" },
  conflicto: { texto: "Conflicto entre fuentes", icono: "bi-exclamation-triangle" },
  desconocido: { texto: "Desconocido", icono: "bi-question-lg" },
};

const colorAforo = (p) => (p >= 100 ? "bg-danger" : p >= 70 ? "bg-warning" : "bg-success");

function TarjetaSala({ s }) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h5 className="mb-1">{s.nombre}</h5>
            <span className="gl-chip"><i className="bi bi-clock" />{s.franja ?? "Sin franja activa"}</span>
          </div>
          {s.lleno ? (
            <span className="badge text-bg-danger">Llena</span>
          ) : s.franja ? (
            <span className="badge text-bg-success">Con cupo</span>
          ) : (
            <span className="badge text-bg-secondary">Libre</span>
          )}
        </div>

        <div className="d-flex justify-content-between small mt-3 mb-1">
          <span className="text-secondary">Aforo</span>
          <strong>{s.aforo_actual}/{s.capacidad}</strong>
        </div>
        <div className="progress mb-3" role="progressbar" aria-valuenow={s.ocupacion} aria-valuemin="0" aria-valuemax="100">
          <div className={`progress-bar ${colorAforo(s.ocupacion)}`} style={{ width: `${Math.min(s.ocupacion, 100)}%` }} />
        </div>

        <div className="small text-secondary mb-2">
          Equipos: {s.disponibles} de {s.equipos.length} disponibles
        </div>
        <div className="row row-cols-4 row-cols-sm-5 g-2">
          {s.equipos.map((q) => (
            <div key={q.id} className="col">
              <div
                className={`gl-equipo gl-eq-${q.estado}`}
                title={`${ESTADOS[q.estado].texto} · Inventario: ${q.inventario} · Mantenimiento: ${q.mantenimiento}${q.accesible ? " · Puesto accesible" : ""}`}
              >
                <i className={`bi ${ESTADOS[q.estado].icono}`} />
                {q.id}
                {q.accesible && <i className="bi bi-universal-access d-inline ms-1" style={{ fontSize: ".75rem" }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Salas() {
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [actualizado, setActualizado] = useState(null);

  const cargar = () =>
    api
      .salas()
      .then((s) => {
        setSalas(s);
        setError(null);
        setActualizado(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
  }, []);

  const recargar = () => {
    setCargando(true);
    cargar();
  };

  const equipos = salas.flatMap((s) => s.equipos);
  const resumen = [
    { valor: salas.length, texto: "Salas", icono: "bi-building" },
    { valor: equipos.filter((q) => q.estado === "disponible").length, texto: "Equipos disponibles", icono: "bi-pc-display" },
    { valor: equipos.filter((q) => q.estado === "conflicto").length, texto: "Conflictos entre fuentes", icono: "bi-exclamation-triangle" },
    { valor: salas.filter((s) => s.lleno).length, texto: "Salas llenas", icono: "bi-people" },
  ];

  return (
    <>
      <section className="gl-hero p-4 mb-4 d-flex align-items-center justify-content-between">
        <div>
          <h3 className="fw-bold mb-1">Estado de las salas</h3>
          <p className="mb-2 opacity-75">Aforo y equipos según inventario y mantenimiento.</p>
          <button type="button" className="btn btn-light btn-sm" onClick={recargar} disabled={cargando}>
            <i className="bi bi-arrow-clockwise me-1" />Actualizar
          </button>
          {actualizado && <small className="ms-2 opacity-75">Actualizado {actualizado.toLocaleTimeString()}</small>}
        </div>
        <img src={ilus.salas} alt="" className="d-none d-md-block" />
      </section>

      {cargando && <Cargando texto="Cargando salas…" />}
      {!cargando && error && <ErrorApi mensaje={error} />}
      {!cargando && !error && (
        <>
          <div className="row g-3 mb-4">
            {resumen.map((r) => (
              <div key={r.texto} className="col-6 col-lg-3">
                <div className="card h-100">
                  <div className="card-body d-flex align-items-center gap-3">
                    <span className="gl-logo"><i className={`bi ${r.icono}`} /></span>
                    <div>
                      <div className="gl-stat">{r.valor}</div>
                      <small className="text-secondary">{r.texto}</small>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-4 mb-4">
            {salas.map((s) => (
              <div key={s.id} className="col-md-6 col-xl-4"><TarjetaSala s={s} /></div>
            ))}
          </div>

          <div className="card">
            <div className="card-body d-flex flex-wrap gap-3 small">
              <strong className="me-2">Leyenda:</strong>
              {Object.entries(ESTADOS).map(([k, v]) => (
                <span key={k} className={`gl-equipo gl-eq-${k} px-2 py-1 d-inline-flex align-items-center gap-1`}>
                  <i className={`bi ${v.icono} d-inline`} style={{ fontSize: ".85rem" }} />{v.texto}
                </span>
              ))}
              <span className="d-inline-flex align-items-center gap-1 text-secondary">
                <i className="bi bi-universal-access" />Puesto accesible
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
