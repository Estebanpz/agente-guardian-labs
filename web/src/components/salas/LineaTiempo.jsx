import { posicion, posicionAhora } from "../../pages/salas/tiempo.js";

// Línea de tiempo 07:00–22:00 de una sala. Cada reserva es un botón (teclado y pantalla táctil).
// El rango "libre desde / hasta" se marca en verde; la línea roja es la hora actual (solo hoy).
export default function LineaTiempo({ reservas, esHoy, ahoraMin, rango, resaltada, onPick, nombreSala }) {
  return (
    <div>
      <div className="sa-linea">
        {rango && (
          <div className="sa-linea-rango" aria-hidden="true" style={posicion(rango.desde, rango.hasta)} />
        )}
        {reservas.map((r) => {
          const quien = r.solicitante ?? "persona sin registro";
          const escalada = r.estado === "escalada";
          return (
            <button
              key={r.codigo}
              type="button"
              className={`sa-bloque${escalada ? " sa-bloque-escalada" : ""}`}
              style={posicion(r.inicio_min, r.fin_min)}
              aria-label={`${nombreSala}: reserva ${r.codigo}, ${r.inicio} a ${r.fin}, ${quien}${escalada ? ", escalada" : ""}`}
              aria-current={resaltada === r.codigo ? "true" : undefined}
              title={`${r.inicio}–${r.fin} · ${quien}`}
              onClick={() => onPick(r.codigo)}
            >
              {`${r.inicio}–${r.fin}`}
            </button>
          );
        })}
        {esHoy && <div className="sa-ahora" aria-hidden="true" style={posicionAhora(ahoraMin)} />}
      </div>
      <div className="sa-eje-horas" aria-hidden="true">
        <span>07</span><span>10</span><span>13</span><span>16</span><span>19</span><span>22</span>
      </div>
    </div>
  );
}
