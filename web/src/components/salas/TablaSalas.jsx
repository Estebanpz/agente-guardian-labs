import LineaTiempo from "./LineaTiempo.jsx";
import { enRevisionDe } from "../../pages/salas/filtros.js";

// Tabla de salas (variante A): sala, equipos, agenda en la línea de tiempo, estado y detalle.
// En pantallas estrechas la tabla se desplaza dentro de su contenedor, no la página.
export default function TablaSalas({ filas, esHoy, ahoraMin, rango, resaltada, onAbrir, onPick, hayFiltros, onLimpiar }) {
  return (
    <div className="sa-tabla-scroll">
      <table className="sa-tabla">
        <caption className="visually-hidden">Salas, equipos, agenda del día y estado</caption>
        <thead>
          <tr>
            <th scope="col">Sala</th>
            <th scope="col">Equipos</th>
            <th scope="col">Agenda 07:00 – 22:00</th>
            <th scope="col">Estado</th>
            <th scope="col"><span className="visually-hidden">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-5">
                <p className="mb-2 text-secondary">Ninguna sala cumple estos filtros.</p>
                {hayFiltros && (
                  <button type="button" className="sa-btn-texto" onClick={onLimpiar}>Limpiar filtros</button>
                )}
              </td>
            </tr>
          )}
          {filas.map(({ x, estado }) => {
            const s = x.sala;
            const total = s.equipos.length;
            return (
              <tr key={s.id}>
                <th scope="row">
                  <div className="sa-sala-nombre">{s.nombre}</div>
                  <div className="sa-sala-tipo">
                    {s.computo === "alto" ? "Alto cómputo" : "Estándar"} · {s.capacidad} puestos
                  </div>
                </th>
                <td style={{ minWidth: 140 }}>
                  <div className="sa-operativos">{s.operativos}/{total} operativos</div>
                  <div className="sa-barra-fondo" aria-hidden="true">
                    <div className="sa-barra-relleno" style={{ width: `${total ? (s.operativos / total) * 100 : 0}%` }} />
                  </div>
                  {enRevisionDe(s) > 0 && <div className="sa-revision">{enRevisionDe(s)} en revisión</div>}
                </td>
                <td style={{ minWidth: 260 }}>
                  <LineaTiempo
                    reservas={x.reservas}
                    esHoy={esHoy}
                    ahoraMin={ahoraMin}
                    rango={rango}
                    resaltada={resaltada}
                    onPick={(codigo) => onPick(s.id, codigo)}
                    nombreSala={s.nombre}
                  />
                </td>
                <td>
                  <span className={`sa-pastilla sa-pastilla-${estado.tono}`}>{estado.texto}</span>
                </td>
                <td className="text-end">
                  <button type="button" className="sa-btn" onClick={() => onAbrir(s.id)} aria-label={`Ver detalle de ${s.nombre}`}>
                    Ver detalle
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
