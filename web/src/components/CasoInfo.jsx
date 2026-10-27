import { useState } from "react";

// Nombre legible y formato de cada hecho del caso.
const ETIQUETAS = [
  ["rol", "Rol", (h) => h.rol],
  ["carne_vigente", "Carné vigente", (h) => h.carne_vigente],
  ["induccion_seguridad", "Inducción de seguridad", (h) => h.induccion_seguridad],
  ["reserva_valida", "Reserva válida", (h) => h.reserva_valida],
  ["reserva_creada_por_rol_autorizado", "Reserva hecha por rol autorizado", (h) => h.reserva_creada_por_rol_autorizado],
  ["aprobacion_coordinacion", "Aprobación de coordinación", (h) => h.aprobacion_coordinacion],
  ["aforo", "Aforo de la sala", (h) => `${h.aforo_actual ?? "?"}/${h.capacidad ?? "?"}`],
  ["equipo_id", "Equipo pedido", (h) => h.equipo_id],
  ["equipo_estado_inventario", "Estado en inventario", (h) => h.equipo_estado_inventario],
  ["equipo_estado_mantenimiento", "Estado en mantenimiento", (h) => h.equipo_estado_mantenimiento],
  ["necesidad_accesibilidad", "Necesita puesto accesible", (h) => (h.necesidad_accesibilidad ? "sí" : "no")],
  ["hora_llegada", "Hora de llegada", (h) => h.hora_llegada],
  ["entrada_registrada", "Entrada registrada", (h) => (h.entrada_registrada ? "sí" : "no")],
];

// Tarjeta "Qué se prueba": describe el caso elegido y resalta lo que cambia frente al caso base (E-001).
export default function CasoInfo({ caso, base }) {
  const [verHechos, setVerHechos] = useState(false);
  if (!caso) return null;

  const distinto = (clave, fmt) => base && caso.id !== base.id && fmt(caso.hechos) !== fmt(base.hechos);
  const cambios = ETIQUETAS.filter(([k, , fmt]) => distinto(k, fmt));

  return (
    <div className="card mb-4 border-start border-4" style={{ borderColor: "var(--gl-acento)" }}>
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
          <h6 className="mb-0"><i className="bi bi-search me-2" />Qué se prueba con {caso.id}</h6>
          <span className="gl-chip">{caso.prueba}</span>
        </div>
        <div className="fw-semibold mt-2">{caso.titulo}</div>
        <p className="small gl-subtitulo mb-2">{caso.detalle}</p>

        {cambios.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            {cambios.map(([k, nombre, fmt]) => (
              <span key={k} className="gl-chip gl-chip-aviso">
                <i className="bi bi-arrow-left-right" />{nombre}: {fmt(caso.hechos)}
              </span>
            ))}
          </div>
        )}

        <div className="small mb-2">
          <i className="bi bi-bullseye me-1 text-success" /><strong>Resultado esperado:</strong> {caso.esperado}
        </div>

        <button type="button" className="btn btn-link btn-sm px-0 text-decoration-none" onClick={() => setVerHechos((v) => !v)}>
          <i className={`bi ${verHechos ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />
          {verHechos ? "Ocultar" : "Ver"} todos los hechos del caso
        </button>
        {verHechos && (
          <table className="table table-sm small mt-2 mb-0">
            <tbody>
              {ETIQUETAS.map(([k, nombre, fmt]) => (
                <tr key={k} className={distinto(k, fmt) ? "table-warning" : ""}>
                  <td className="text-secondary">{nombre}</td>
                  <td className="fw-semibold">{fmt(caso.hechos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="small text-secondary mt-2">
          <i className="bi bi-info-circle me-1" />En amarillo: lo que cambia frente al caso base E-001.
        </div>
      </div>
    </div>
  );
}
