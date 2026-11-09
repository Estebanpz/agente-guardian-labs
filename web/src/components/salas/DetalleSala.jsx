import { useEffect, useRef, useState } from "react";
import { aHora, duracion, huecos, ABRE, CIERRA } from "../../pages/salas/tiempo.js";
import { enRevisionDe } from "../../pages/salas/filtros.js";

const ESTADO_EQUIPO = {
  disponible: "Disponible",
  mantenimiento: "En mantenimiento",
  diagnostico: "En diagnóstico",
  desconocido: "Desconocido",
};
// Explicación corta de cada regla que puede escalar una reserva (texto de la interfaz, sin códigos técnicos).
const POR_REGLA = {
  R17: "el carné no se puede verificar",
  R19: "equipos con estado desconocido o en conflicto",
  R20: "la sala la tiene un grupo de estudiantes",
  R21: "la sala la tiene otro docente",
  R22: "la sala ya está separada en ese horario",
};

const PESTANAS = [["agenda", "Agenda"], ["equipos", "Equipos"], ["huecos", "Huecos libres"]];

// Panel lateral de una sala (offcanvas a la derecha). Diálogo modal: foco al título, Esc y × lo cierran,
// y el foco vuelve a quien lo abrió.
export default function DetalleSala({ sala, fechaTexto, resaltada, onCerrar }) {
  const [tab, setTab] = useState("agenda");
  const titulo = useRef(null);
  const dialogo = useRef(null);

  useEffect(() => {
    const previo = document.activeElement;
    titulo.current?.focus();
    const bloqueo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bloqueo;
      previo?.focus?.();
    };
  }, []);

  const teclas = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key === "Tab" && dialogo.current) {
      const enfocables = [...dialogo.current.querySelectorAll("button, [href], select, input, [tabindex]:not([tabindex='-1'])")]
        .filter((el) => !el.disabled);
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
  };

  const reservas = sala.reservas;
  const libres = huecos(reservas, 30);
  const total = sala.equipos.length;

  return (
    <div className="sa-velo">
      <button type="button" className="sa-velo-cerrar" aria-label="Cerrar detalle" tabIndex={-1} onClick={onCerrar} />
      <aside
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sa-detalle-titulo"
        className="sa-detalle"
        onKeyDown={teclas}
      >
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div className="sa-migas">{fechaTexto}</div>
            <h2 id="sa-detalle-titulo" ref={titulo} tabIndex={-1} className="mt-1 mb-0 fw-bold fs-4">
              {sala.computo === "alto" ? `${sala.nombre} · alto cómputo` : sala.nombre}
            </h2>
            <div className="sa-subtitulo small mt-1">
              {sala.capacidad} puestos · {sala.operativos} de {total} equipos operativos
            </div>
          </div>
          <button type="button" className="sa-btn px-3" aria-label="Cerrar" onClick={onCerrar}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>

        <div role="tablist" aria-label="Detalle de la sala" className="sa-pestanas sa-pestanas-detalle">
          {PESTANAS.map(([id, texto]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`sa-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="sa-panel-detalle"
              className="sa-pestana"
              onClick={() => setTab(id)}
            >
              {texto}
              {id === "agenda" && <span className="sa-cuenta-pestana">{reservas.length}</span>}
              {id === "equipos" && <span className="sa-cuenta-pestana">{total}</span>}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="sa-panel-detalle" aria-labelledby={`sa-tab-${tab}`} className="d-flex flex-column gap-3">
          {tab === "agenda" && (
            reservas.length === 0
              ? <p className="mb-0 text-secondary">Sin reservas este día. La sala está libre de 07:00 a 22:00.</p>
              : reservas.map((r) => {
                const p = r.perfil;
                const docente = p?.rol === "docente";
                const escalada = r.estado === "escalada";
                const motivo = (r.reglas_aplicadas ?? []).map((c) => POR_REGLA[c]).filter(Boolean)[0];
                return (
                  <article key={r.codigo} className="sa-agenda-caja" data-resaltada={resaltada === r.codigo ? "true" : "false"}>
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <strong>{r.inicio} – {r.fin}</strong>
                      <span className={`sa-pastilla sa-pastilla-${escalada ? "escalada" : "ocupada"}`}>
                        {escalada ? "Escalada" : "Programada"}
                      </span>
                    </div>
                    <div className="fw-semibold">{r.solicitante ?? "Persona sin registro"}</div>
                    <div className="small text-secondary">
                      {docente ? "Docente" : "Estudiante"} · carné {r.carne}
                      <br />
                      {docente
                        ? `Espacio académico: ${r.materia ?? "sin indicar"}`
                        : `${p?.programa ?? "Programa sin registro"}${p?.jornada ? ` · jornada de la ${p.jornada === "Mañana" ? "mañana" : "noche"}` : ""}`}
                      <br />
                      {r.personas} personas · {r.codigo}
                    </div>
                    {escalada && (
                      <div className="sa-equipo-nota">
                        Escaló por {(r.reglas_aplicadas ?? []).join(", ") || "revisión"}{motivo ? `: ${motivo}` : ""}.
                      </div>
                    )}
                  </article>
                );
              })
          )}

          {tab === "equipos" && (
            <>
              <p className="mb-0 small text-secondary">
                {sala.operativos} operativos, {enRevisionDe(sala)} en revisión. Las filas resaltadas no coinciden entre inventario y mantenimiento, o tienen un estado desconocido.
              </p>
              <div className="border rounded-3 overflow-hidden">
                <table className="sa-tabla-equipos">
                  <caption className="visually-hidden">Equipos de {sala.nombre}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Equipo</th>
                      <th scope="col">Inventario</th>
                      <th scope="col">Mantenimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sala.equipos.map((e) => {
                      const contra = e.inventario === "disponible" && e.mantenimiento !== "disponible" && e.mantenimiento !== "desconocido";
                      const incierto = e.inventario === "desconocido" || e.mantenimiento === "desconocido";
                      const alerta = contra || incierto;
                      return (
                        <tr key={e._id} className={alerta ? "sa-equipo-alerta" : undefined}>
                          <td className="fw-semibold">{e._id}</td>
                          <td>{ESTADO_EQUIPO[e.inventario]}</td>
                          <td>
                            {ESTADO_EQUIPO[e.mantenimiento]}
                            {alerta && (
                              <div className="sa-equipo-nota">
                                {contra ? "Contradicción entre inventario y mantenimiento (R3/R9)" : "Estado desconocido en inventario o mantenimiento"}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "huecos" && (
            <>
              <p className="mb-0 small text-secondary">Rangos sin reserva de 30 minutos o más.</p>
              {libres.length === 0 && <p className="mb-0 text-secondary">No hay un hueco de 30 minutos o más.</p>}
              {libres.map((h) => (
                <div key={h.inicio} className="sa-hueco">
                  <strong>{aHora(h.inicio)} – {aHora(h.fin)}</strong>
                  <span className="text-secondary">{duracion(h.inicio, h.fin)}</span>
                </div>
              ))}
              <p className="small text-secondary mb-0">Entre {aHora(ABRE)} y {aHora(CIERRA)}.</p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
