import { useState } from "react";
import { cuandoBogota, fechaLarga } from "../../pages/salas/tiempo.js";

const DESTINO = { monitor: "Monitor", mantenimiento: "Mantenimiento", coordinacion: "Coordinación" };

function Aviso({ aviso, pendiente, confirmando, enviando, errorId, onPedir, onNo, onSi }) {
  const donde = [
    aviso.sala ? `Sala ${aviso.sala.slice(5)}` : null,
    aviso.fecha ? fechaLarga(aviso.fecha) : null,
    aviso.horario ?? null,
  ].filter(Boolean).join(" · ") || "Sin sala ni horario";
  const quien = `${aviso.solicitante ? `${aviso.solicitante} · ` : ""}carné ${aviso.carne ?? "sin carné"}`;
  return (
    <article className="sa-aviso">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="sa-aviso-regla">{aviso.regla}</span>
        <span className="small text-secondary">Para {DESTINO[aviso.para] ?? aviso.para}</span>
      </div>
      <div className="sa-aviso-motivo">{aviso.motivo}</div>
      <div className="sa-aviso-dato">{donde}<br />{quien}</div>
      {pendiente && !confirmando && (
        <button type="button" className="sa-btn align-self-start" onClick={() => onPedir(aviso._id)}>
          Marcar atendido
        </button>
      )}
      {pendiente && confirmando && (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="small fw-semibold">¿Marcar como atendido?</span>
          <button type="button" className="sa-btn sa-btn-primario" disabled={enviando} onClick={() => onSi(aviso._id)}>
            {enviando ? "Marcando…" : "Sí"}
          </button>
          <button type="button" className="sa-btn" disabled={enviando} onClick={onNo}>No</button>
        </div>
      )}
      {pendiente && errorId === aviso._id && (
        <p role="alert" className="sa-error-texto">No se pudo marcar. Intenta de nuevo.</p>
      )}
      {!pendiente && aviso.atendida_en && (
        <div className="sa-atendido">Atendido {cuandoBogota(aviso.atendida_en)}</div>
      )}
    </article>
  );
}

// Avisos del monitor: pestañas Pendientes y Atendidos. "Marcar atendido" pide confirmación en la misma tarjeta.
export default function PanelAvisos({ pendientes, atendidos, estado, pestana, onPestana, onMarcar, onReintentar }) {
  const [confirmando, setConfirmando] = useState(null);
  const [enviando, setEnviando] = useState(null);
  const [errorId, setErrorId] = useState(null);
  const lista = pestana === "pendiente" ? pendientes : atendidos;

  const si = async (id) => {
    setEnviando(id);
    setErrorId(null);
    try {
      await onMarcar(id);
      setConfirmando(null);
    } catch {
      setErrorId(id);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <section aria-label="Avisos del monitor" className="sa-avisos sa-avisos-columna">
      <h2>Avisos del monitor</h2>
      <div role="tablist" aria-label="Estado de los avisos" className="sa-pestanas">
        {[["pendiente", "Pendientes", pendientes.length], ["atendida", "Atendidos", atendidos.length]].map(([id, texto, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            className="sa-pestana"
            onClick={() => { setConfirmando(null); onPestana(id); }}
          >
            {texto}
            <span className="sa-cuenta-pestana">{n}</span>
          </button>
        ))}
      </div>
      <div role="status" aria-live="polite" className="visually-hidden">
        {estado === "cargando" ? "Cargando avisos" : ""}
      </div>
      {estado === "error" && (
        <div role="alert" className="d-flex flex-column gap-2">
          <p className="mb-0">No pude cargar los avisos.</p>
          <button type="button" className="sa-btn align-self-start" onClick={onReintentar}>Reintentar</button>
        </div>
      )}
      {estado !== "error" && lista.length === 0 && (
        <p className="mb-0 text-secondary">
          {pestana === "pendiente" ? "No hay avisos pendientes." : "Todavía no hay avisos atendidos."}
        </p>
      )}
      {lista.map((a) => (
        <Aviso
          key={a._id}
          aviso={a}
          pendiente={pestana === "pendiente"}
          confirmando={confirmando === a._id}
          enviando={enviando === a._id}
          errorId={errorId}
          onPedir={setConfirmando}
          onNo={() => setConfirmando(null)}
          onSi={si}
        />
      ))}
    </section>
  );
}
