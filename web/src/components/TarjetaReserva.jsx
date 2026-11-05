// Tarjeta de una respuesta de reserva: decisión del motor, datos de la solicitud, conflictos,
// alternativas y la traza de reglas. Mismo esqueleto que TarjetaDecision.
const CLASE = {
  programar: "gl-decision-permitir",
  negar: "gl-decision-negar",
  escalar: "gl-decision-escalar",
  pedir_datos: "gl-decision-escalar",
  registrar: "gl-decision-permitir",
};

// Título con ícono y texto (el color nunca es la única señal).
function titulo(d, propuesta) {
  if (d.decision === "programar") {
    return propuesta
      ? { icono: "bi-calendar-event", texto: "Sala libre: falta confirmar" }
      : { icono: "bi-calendar-check", texto: "Sala separada" };
  }
  if (d.decision === "negar") return { icono: "bi-calendar-x", texto: "No se pudo separar" };
  if (d.decision === "escalar") {
    const solo = d.notificar.length === 1 && d.notificar[0] === "coordinacion";
    return solo
      ? { icono: "bi-building", texto: "Escalado a coordinación" }
      : { icono: "bi-people", texto: "Escalado al monitor" };
  }
  return { icono: "bi-question-circle", texto: "Faltan datos" };
}

const fechaLarga = (fecha) =>
  new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota",
  });

const etiquetaSala = (id) => `Sala ${id.replace("sala-", "")}`;

export default function TarjetaReserva({ resultado, onUsar }) {
  const d = resultado.reserva;
  const s = resultado.solicitud ?? {};
  const propuesta = resultado.flujo?.pendiente === "confirmar";
  const t = titulo(d, propuesta);
  // Una reserva confirmada ya no ofrece alternativas: solo una propuesta o una negativa las muestran.
  const confirmada = d.decision === "programar" && !propuesta;

  return (
    <div className={`card gl-decision ${CLASE[d.decision] ?? "gl-decision-escalar"}`}>
      <div className="card-body">
        <div className="small text-uppercase fw-semibold text-secondary">Reserva</div>
        <h5 className="gl-estado my-2">
          <i className={`bi ${t.icono} me-2`} />
          {t.texto}
        </h5>
        <p className="mb-3" style={{ whiteSpace: "pre-line" }}>{resultado.respuesta}</p>

        <dl className="row small mb-3">
          <dt className="col-5 text-secondary">Sala</dt>
          <dd className="col-7 mb-1">{s.sala_nombre ?? "Por asignar"}</dd>
          {s.fecha && (<>
            <dt className="col-5 text-secondary">Fecha</dt>
            <dd className="col-7 mb-1">{fechaLarga(s.fecha)}</dd>
          </>)}
          {s.inicio && (<>
            <dt className="col-5 text-secondary">Horario</dt>
            <dd className="col-7 mb-1">{s.inicio} a {s.fin}</dd>
          </>)}
          {s.personas != null && (<>
            <dt className="col-5 text-secondary">Personas</dt>
            <dd className="col-7 mb-1">{s.personas}</dd>
          </>)}
          {s.docente && (<>
            <dt className="col-5 text-secondary">Equipos</dt>
            <dd className="col-7 mb-1">{s.equipos}</dd>
            <dt className="col-5 text-secondary">Alto cómputo</dt>
            <dd className="col-7 mb-1">{s.computo_alto ? "Sí" : "No"}</dd>
          </>)}
          {s.materia && (<>
            <dt className="col-5 text-secondary">Materia</dt>
            <dd className="col-7 mb-1">{s.materia}</dd>
          </>)}
        </dl>

        {d.conflictos.length > 0 && (
          <div className="alert alert-warning py-2 small mb-3">
            <strong><i className="bi bi-exclamation-triangle me-1" />Conflicto:</strong>
            <ul className="mb-0 ps-3">
              {d.conflictos.map((c) => (
                <li key={c.codigo}>
                  {c.codigo}: {c.inicio}–{c.fin}, {c.tipo}, {c.personas} personas, carné {c.carne_enmascarado}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!confirmada && d.alternativas.length > 0 && (
          <div className="mb-3">
            <div className="small text-secondary mb-2">Salas libres en ese horario</div>
            <div className="d-flex flex-wrap gap-2">
              {d.alternativas.map((id) => (
                <button key={id} type="button" className="btn btn-sm btn-outline-secondary gl-sugerencia"
                  onClick={() => onUsar(etiquetaSala(id))}>
                  <i className="bi bi-arrow-right-short" />Usar {etiquetaSala(id)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="d-flex flex-wrap gap-2 mb-3">
          {d.reglas_aplicadas.map((r) => (
            <span key={r} className="gl-chip"><i className="bi bi-diagram-3" />{r}</span>
          ))}
          {d.notificar.map((n) => (
            <span key={n} className="gl-chip gl-chip-aviso"><i className="bi bi-bell" />Notificar: {n}</span>
          ))}
        </div>

        <details className="small">
          <summary className="text-secondary mb-2">Ver traza de reglas</summary>
          <ol className="text-secondary mt-2 mb-2">
            {d.traza.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
          <div className="text-secondary">
            Reglas v{d.version_reglas} · Fuentes: {d.fuentes.join("; ")}
          </div>
        </details>

        <hr />
        <div className="small text-secondary">
          <i className="bi bi-database me-1" />
          Reserva simulada en la base de demostración (datos sintéticos).
        </div>
      </div>
    </div>
  );
}
