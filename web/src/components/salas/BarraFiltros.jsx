import { FILTROS, etiquetaLibres } from "../../pages/salas/filtros.js";
import { HORAS } from "../../pages/salas/tiempo.js";

// Chips de estado con conteo, "Libre desde / hasta", búsqueda por número o nombre y "Limpiar filtros".
export default function BarraFiltros({
  filtro, onFiltro, conteos, esHoy, rango, desde, hasta, onDesde, onHasta, busca, onBusca, rangoInvalido, onLimpiar, hayFiltros,
}) {
  const etiquetas = { ...Object.fromEntries(FILTROS), libres: etiquetaLibres({ rango: Boolean(rango), esHoy }) };
  return (
    <section aria-label="Filtros" className="sa-filtros">
      <div role="group" aria-label="Estado de la sala" className="sa-chips">
        {FILTROS.map(([id]) => (
          <button key={id} type="button" className="sa-chip" aria-pressed={filtro === id} onClick={() => onFiltro(id)}>
            {etiquetas[id]}
            <span className="sa-cuenta">{conteos[id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="sa-campos">
        <label className="sa-campo">
          Libre desde
          <select className="sa-control" value={desde} onChange={(e) => onDesde(e.target.value)}>
            <option value="">—</option>
            {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <label className="sa-campo">
          hasta
          <select className="sa-control" value={hasta} onChange={(e) => onHasta(e.target.value)}>
            <option value="">—</option>
            {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
        <label className="sa-campo sa-campo-amplio">
          Buscar sala
          <input
            type="search"
            className="sa-control"
            name="buscar-sala"
            autoComplete="off"
            spellCheck={false}
            value={busca}
            placeholder="Número o nombre, ej. 13…"
            onChange={(e) => onBusca(e.target.value)}
          />
        </label>
        <button type="button" className="sa-btn" onClick={onLimpiar} disabled={!hayFiltros}>
          Limpiar filtros
        </button>
      </div>
      {rangoInvalido && (
        <p role="alert" className="sa-error-texto">La hora final debe ser posterior a la inicial.</p>
      )}
    </section>
  );
}
