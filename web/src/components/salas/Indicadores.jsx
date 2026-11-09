import { datosDeSala, enRevisionDe } from "../../pages/salas/filtros.js";

// Cuatro indicadores con gráficas (plan de la vista, sección 2.1). Las gráficas son divs con alturas en %;
// el número y el texto llevan la información, así que las gráficas van ocultas para lectores de pantalla.
const COLOR = {
  libre: "#10B981",
  ocupadaBarra: "#CBD3E4",
  hora: "#2563EB",
  horaActual: "#1E3A8A",
  horaVacia: "#DCE3F2",
  revision: "#F59E0B",
  operativo: "#10B981",
};
const HORAS = Array.from({ length: 15 }, (_, i) => 7 + i); // 07 a 21: cada franja de una hora

export default function Indicadores({ salas, esHoy, ahoraMin, avisosPendientes, filtro, onFiltro, onVerAvisos }) {
  const info = salas.map((s) => datosDeSala(s, { esHoy, ahoraMin, rango: null }));

  // Libres: salas libres ahora (hoy) o sin reservas (otro día). Una barra por sala.
  const libres = info.filter((x) => (esHoy ? !x.actual : x.reservas.length === 0));
  const libresSet = new Set(libres.map((x) => x.sala.id));

  // Reservas del día: únicas, y cuántas salas ocupa cada hora.
  const codigos = new Set(salas.flatMap((s) => s.reservas.map((r) => r.codigo)));
  const escaladas = salas.flatMap((s) => s.reservas).filter((r) => r.estado === "escalada").length;
  const porHora = HORAS.map((h) => salas.filter((s) =>
    s.reservas.some((r) => r.inicio_min < (h + 1) * 60 && r.fin_min > h * 60)).length);
  const maxHora = Math.max(1, ...porHora);
  const horaActual = Math.floor(ahoraMin / 60);

  // Equipos en revisión: no operativos (inventario o mantenimiento distintos de "disponible").
  const totalEquipos = salas.reduce((n, s) => n + s.equipos.length, 0);
  const enRevision = salas.reduce((n, s) => n + enRevisionDe(s), 0);
  const operativos = totalEquipos - enRevision;
  const salasRevision = salas.filter((s) => enRevisionDe(s) > 0).length;

  const reglas = [...new Set(avisosPendientes.map((a) => a.regla))].slice(0, 5);

  const tarjeta = (id, titulo, valor, nota, grafica) => (
    <button
      type="button"
      className="sa-kpi"
      aria-pressed={filtro === id}
      onClick={() => onFiltro(id)}
    >
      <span className="sa-kpi-titulo">{titulo}</span>
      <span className="sa-kpi-valor">{valor}</span>
      <span className="sa-kpi-nota">{nota}</span>
      {grafica}
    </button>
  );

  return (
    <section aria-label="Indicadores" className="sa-indicadores">
      {tarjeta(
        "libres",
        esHoy ? "Salas libres ahora" : "Salas sin reservas",
        `${libres.length} / ${salas.length}`,
        `de ${salas.length} salas`,
        <div className="sa-barras" aria-hidden="true">
          {salas.map((s) => (
            <div
              key={s.id}
              className="sa-barra"
              style={{
                height: libresSet.has(s.id) ? "100%" : "30%",
                background: libresSet.has(s.id) ? COLOR.libre : COLOR.ocupadaBarra,
              }}
            />
          ))}
        </div>,
      )}

      {tarjeta(
        "reservas",
        "Reservas del día",
        codigos.size,
        `${escaladas} ${escaladas === 1 ? "escalada" : "escaladas"}`,
        <>
          <div className="sa-barras" aria-hidden="true">
            {porHora.map((n, i) => {
              const h = HORAS[i];
              const color = n === 0 ? COLOR.horaVacia : esHoy && h === horaActual ? COLOR.horaActual : COLOR.hora;
              return (
                <div
                  key={h}
                  className="sa-barra"
                  style={{ height: `${Math.max(8, (n / maxHora) * 100)}%`, background: color }}
                />
              );
            })}
          </div>
          <div className="sa-eje" aria-hidden="true">
            <span>07</span>
            <span>Salas ocupadas por hora</span>
            <span>22</span>
          </div>
        </>,
      )}

      {tarjeta(
        "revision",
        "Equipos en revisión",
        `${enRevision} / ${totalEquipos}`,
        `en ${salasRevision} ${salasRevision === 1 ? "sala" : "salas"}`,
        <div aria-hidden="true">
          <div className="sa-apilada">
            <div style={{ width: `${(operativos / Math.max(totalEquipos, 1)) * 100}%`, background: COLOR.operativo }} />
            <div style={{ width: `${(enRevision / Math.max(totalEquipos, 1)) * 100}%`, background: COLOR.revision }} />
          </div>
          <div className="sa-leyenda mt-2">
            <span><i className="sa-muestra" style={{ background: COLOR.operativo }} />Operativos {operativos}</span>
            <span><i className="sa-muestra" style={{ background: COLOR.revision }} />En revisión {enRevision}</span>
          </div>
        </div>,
      )}

      <button type="button" className="sa-kpi sa-kpi-avisos" onClick={onVerAvisos}>
        <span className="sa-kpi-titulo">Avisos pendientes</span>
        <span className="sa-kpi-valor">{avisosPendientes.length}</span>
        <span className="sa-kpi-nota">Abre la pestaña Pendientes</span>
        <span className="sa-chips-aviso mt-auto" aria-hidden="true">
          {reglas.map((r) => <span key={r} className="sa-chip-regla">{r}</span>)}
        </span>
      </button>
    </section>
  );
}
