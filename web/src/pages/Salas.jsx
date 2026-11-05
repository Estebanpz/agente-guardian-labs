import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Cargando, ErrorApi } from "../components/Estado.jsx";
import Ilustracion from "../components/Ilustracion.jsx";

const ESTADOS = {
  disponible: { texto: "Disponible", icono: "bi-check-circle", desc: "Inventario y mantenimiento coinciden: se puede usar y sugerir." },
  mantenimiento: { texto: "Mantenimiento", icono: "bi-tools", desc: "Las dos fuentes lo reportan en reparación: no se sugiere (R9)." },
  diagnostico: { texto: "Diagnóstico", icono: "bi-activity", desc: "Mantenimiento lo está revisando: no se sugiere hasta que termine (R9)." },
  conflicto: { texto: "Conflicto entre fuentes", icono: "bi-exclamation-triangle", desc: "Inventario y mantenimiento no coinciden: se excluye, se escala y se avisa a mantenimiento (R3)." },
  desconocido: { texto: "Desconocido", icono: "bi-question-lg", desc: "Falta el dato de una fuente: no se supone que funciona (R2)." },
};

// Línea de tiempo de 07:00 a 22:00 (900 minutos).
const INICIO_DIA = 420;
const DURACION_DIA = 900;
const MARCAS = ["07:00", "10:00", "13:00", "16:00", "19:00", "22:00"];

const aMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Fecha de hoy y de dentro de n días en Bogotá (aaaa-mm-dd).
const fechaBogota = (desplazamiento = 0) => {
  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  hoy.setDate(hoy.getDate() + desplazamiento);
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, "0");
  const d = String(hoy.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Fecha larga en español, como "jueves 5 de noviembre".
const fechaLarga = (fecha) =>
  new Date(`${fecha}T12:00:00-05:00`)
    .toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" })
    .replace(",", "");

const minutosAhora = () => {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date());
  return aMin(partes);
};

// Estado visible de un equipo, derivado de sus dos fuentes (inventario y mantenimiento).
function estadoEquipo(q) {
  if (q.inventario === "desconocido" || q.mantenimiento === "desconocido") return "desconocido";
  if (q.inventario !== q.mantenimiento) return "conflicto";
  return q.inventario;
}

function Linea({ reservas, sala }) {
  return (
    <div>
      <div className="gl-linea" role="img" aria-label={`Reservas de ${sala.nombre} entre 07:00 y 22:00`}>
        {reservas.map((r) => {
          const inicio = aMin(r.inicio);
          const duracion = aMin(r.fin) - inicio;
          const tipo = r.tipo === "clase" ? "clase" : "estudiantes";
          const etiqueta = `${r.inicio}–${r.fin} · ${tipo === "clase" ? "clase" : "estudiantes"} · ${r.personas} personas`;
          return (
            <span
              key={r.codigo}
              className={`gl-bloque gl-bloque-${tipo}`}
              style={{ left: `${((inicio - INICIO_DIA) / DURACION_DIA) * 100}%`, width: `${(duracion / DURACION_DIA) * 100}%` }}
              title={etiqueta}
            >
              <span className="visually-hidden">{etiqueta}</span>
            </span>
          );
        })}
      </div>
      <div className="gl-marcas small text-secondary" aria-hidden="true">
        {MARCAS.map((m) => (
          <span key={m} style={{ left: `${((aMin(m) - INICIO_DIA) / DURACION_DIA) * 100}%` }}>{m.slice(0, 2)}</span>
        ))}
      </div>
    </div>
  );
}

function TarjetaSala({ sala, reservas }) {
  const libreAhora = !reservas.some((r) => aMin(r.inicio) <= minutosAhora() && minutosAhora() < aMin(r.fin));
  return (
    <div className="card h-100" data-libre={libreAhora}>
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
          <div>
            <h5 className="mb-1 text-nowrap">Sala {sala.id.replace("sala-", "")}</h5>
            <div className="small text-secondary">
              {sala.capacidad} puestos · {sala.operativos} operativos
            </div>
          </div>
          {sala.computo === "alto" ? (
            <span className="gl-insignia-alto badge"><i className="bi bi-cpu me-1" />Alto cómputo</span>
          ) : (
            <span className="badge text-bg-secondary">Estándar</span>
          )}
        </div>

        <Linea reservas={reservas} sala={sala} />

        <details className="mt-3">
          <summary className="small text-secondary">Ver equipos</summary>
          <div className="row row-cols-4 row-cols-sm-5 g-2 mt-1">
            {sala.equipos.map((q) => {
              const estado = estadoEquipo(q);
              return (
                <div key={q._id} className="col">
                  <div
                    className={`gl-equipo gl-eq-${estado}`}
                    title={`${ESTADOS[estado].texto}: ${ESTADOS[estado].desc} · Inventario: ${q.inventario} · Mantenimiento: ${q.mantenimiento}${q.accesible ? " · Puesto accesible" : ""}`}
                  >
                    <i className={`bi ${ESTADOS[estado].icono}`} />
                    {q._id}
                    {q.accesible && <i className="bi bi-universal-access d-inline ms-1" style={{ fontSize: ".75rem" }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}

function PanelPendientes({ pendientes, cargando }) {
  return (
    <div className="card gl-pendientes">
      <div className="card-body">
        <h6 className="mb-3"><i className="bi bi-bell me-2" />Pendientes del monitor</h6>
        {cargando && <p className="small text-secondary mb-0">Cargando avisos…</p>}
        {!cargando && pendientes.length === 0 && (
          <div className="text-center gl-vacio py-3">
            <Ilustracion nombre="elegir" ancho={150} className="mb-2" />
            <p className="fw-semibold mb-0">No hay casos pendientes</p>
            <p className="gl-subtitulo small mb-0">Los avisos de escalada aparecen aquí.</p>
          </div>
        )}
        {!cargando && pendientes.length > 0 && (
          <ul className="list-unstyled mb-0">
            {pendientes.map((n, i) => (
              <li key={`${n.reserva_codigo ?? "sin"}-${n.para}-${i}`} className="border-bottom pb-2 mb-2 small">
                <div className="d-flex justify-content-between">
                  <span className="gl-chip"><i className="bi bi-diagram-3" />{n.regla} · {n.para}</span>
                  <span className="text-secondary">{new Date(n.creada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="mt-1">{n.motivo}</div>
                <div className="text-secondary">{n.reserva_codigo ? `Reserva ${n.reserva_codigo}` : "Sin reserva (identidad por revisar)"}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Salas() {
  const hoy = fechaBogota();
  const [fecha, setFecha] = useState(hoy);
  const [filtro, setFiltro] = useState("todas");
  const [version, setVersion] = useState(0);
  const [salas, setSalas] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoAvisos, setCargandoAvisos] = useState(true);
  const [error, setError] = useState(null);

  // Cargas al montar y al cambiar la fecha o pedir actualizar: con AbortController y limpieza.
  useEffect(() => {
    const control = new AbortController();
    Promise.all([api.salas(control.signal), api.reservas(fecha, control.signal)])
      .then(([s, r]) => {
        setSalas(s);
        setReservas(r);
        setError(null);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [fecha, version]);

  useEffect(() => {
    const control = new AbortController();
    api.notificaciones("pendiente", control.signal)
      .then(setPendientes)
      .catch((e) => {
        if (e.name !== "AbortError") setPendientes([]);
      })
      .finally(() => {
        if (!control.signal.aborted) setCargandoAvisos(false);
      });
    return () => control.abort();
  }, [version]);

  // Estado derivado: se calcula al renderizar a partir de los datos cargados.
  const programadas = reservas.filter((r) => r.estado === "programada");
  const reservasDe = (sala) => programadas.filter((r) => r.sala === sala.id);
  const libreAhora = (sala) => {
    const ahora = minutosAhora();
    return !reservasDe(sala).some((r) => aMin(r.inicio) <= ahora && ahora < aMin(r.fin));
  };
  const visibles = salas.filter((s) => {
    if (filtro === "alto") return s.computo === "alto";
    if (filtro === "cupo") return fecha === hoy ? libreAhora(s) : true;
    return true;
  });
  const conReservas = salas.filter((s) => reservasDe(s).length > 0).length;
  const altoComputo = salas.filter((s) => s.computo === "alto").length;

  const filtros = [
    { id: "todas", texto: "Todas" },
    { id: "alto", texto: "Alto cómputo" },
    { id: "cupo", texto: "Con cupo ahora" },
  ];

  return (
    <>
      <section className="gl-hero p-4 mb-4 d-flex align-items-center justify-content-between">
        <div>
          <h3 className="fw-bold mb-1">Estado de las salas</h3>
          <p className="mb-2 opacity-75">Línea de tiempo de reservas y equipos según inventario y mantenimiento.</p>
          <button type="button" className="btn btn-light btn-sm" disabled={cargando}
            onClick={() => { setCargando(true); setCargandoAvisos(true); setVersion((v) => v + 1); }}>
            <i className="bi bi-arrow-clockwise me-1" />Actualizar
          </button>
        </div>
        <Ilustracion nombre="salas" ancho={174} prioridad className="d-none d-md-block" />
      </section>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div className="small text-secondary">
          <strong className="text-body">{salas.length} salas</strong> · {altoComputo} alto cómputo · {conReservas} con reservas el {fechaLarga(fecha)}
        </div>
        <div className="d-flex align-items-center gap-2">
          <label htmlFor="fecha-salas" className="small text-secondary">Fecha</label>
          <input id="fecha-salas" type="date" className="form-control form-control-sm" style={{ width: 170 }}
            value={fecha} min={hoy} max={fechaBogota(30)}
            onChange={(e) => { if (e.target.value) { setCargando(true); setFecha(e.target.value); } }} />
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrar salas">
        {filtros.map((f) => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id}
            className={`btn btn-sm gl-sugerencia ${filtro === f.id ? "btn-gl" : "btn-outline-secondary"}`}
            onClick={() => setFiltro(f.id)}>
            {f.texto}
          </button>
        ))}
      </div>

      {cargando && <Cargando texto="Cargando salas…" />}
      {!cargando && error && <ErrorApi mensaje={error} />}
      {!cargando && !error && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="row g-3 mb-4">
              {visibles.map((s) => (
                <div key={s.id} className="col-md-6 col-xl-4"><TarjetaSala sala={s} reservas={reservasDe(s)} /></div>
              ))}
            </div>

            <div className="card">
              <div className="card-body">
                <h6 className="mb-3"><i className="bi bi-info-circle me-2" />Leyenda</h6>
                <div className="row g-3 small">
                  {Object.entries(ESTADOS).map(([k, v]) => (
                    <div key={k} className="col-md-6 d-flex align-items-start gap-2">
                      <span className={`gl-equipo gl-eq-${k} px-2 py-1 d-inline-flex align-items-center gap-1 flex-shrink-0`}>
                        <i className={`bi ${v.icono} d-inline`} style={{ fontSize: ".85rem" }} />{v.texto}
                      </span>
                      <span className="text-secondary">{v.desc}</span>
                    </div>
                  ))}
                  <div className="col-md-6 d-flex align-items-start gap-2">
                    <span className="gl-bloque-leyenda gl-bloque-estudiantes flex-shrink-0" aria-hidden="true" />
                    <span className="text-secondary">Reserva de estudiantes (bloque lila).</span>
                  </div>
                  <div className="col-md-6 d-flex align-items-start gap-2">
                    <span className="gl-bloque-leyenda gl-bloque-clase flex-shrink-0" aria-hidden="true" />
                    <span className="text-secondary">Clase de un docente (bloque violeta).</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="sticky-lg-top gl-pendientes-wrap">
              <PanelPendientes pendientes={pendientes} cargando={cargandoAvisos} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
