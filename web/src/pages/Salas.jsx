import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import SelectorFecha from "../components/salas/SelectorFecha.jsx";
import Indicadores from "../components/salas/Indicadores.jsx";
import BarraFiltros from "../components/salas/BarraFiltros.jsx";
import TablaSalas from "../components/salas/TablaSalas.jsx";
import DetalleSala from "../components/salas/DetalleSala.jsx";
import PanelAvisos from "../components/salas/PanelAvisos.jsx";
import { FILTRO_IDS, datosDeSala, estadoDeSala, pasa, rangoDe } from "./salas/filtros.js";
import { HORAS, fechaLarga, hoyBogota, minutosAhora } from "./salas/tiempo.js";
import { useDatosSalas } from "./salas/useDatosSalas.js";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Vista Salas del monitor (variante A). El estado de los filtros y del detalle vive en la URL:
// fecha, filtro, desde, hasta, q, sala (detalle abierto) y res (reserva resaltada).
export default function Salas() {
  const hoy = hoyBogota();
  const [params, setParams] = useSearchParams();
  const fecha = FECHA_RE.test(params.get("fecha") ?? "") ? params.get("fecha") : hoy;
  const filtro = FILTRO_IDS.includes(params.get("filtro")) ? params.get("filtro") : "todas";
  const desde = HORAS.includes(params.get("desde")) ? params.get("desde") : "";
  const hasta = HORAS.includes(params.get("hasta")) ? params.get("hasta") : "";
  const q = params.get("q") ?? "";
  const salaId = params.get("sala");
  const resaltada = params.get("res");

  const [mes, setMes] = useState(fecha.slice(0, 7));
  const [ahoraMin, setAhoraMin] = useState(minutosAhora);
  const [pestanaAvisos, setPestanaAvisos] = useState("pendiente");

  useEffect(() => {
    const id = setInterval(() => setAhoraMin(minutosAhora()), 60000);
    return () => clearInterval(id);
  }, []);

  const { salas, estadoSalas, dias, avisos, estadoAvisos, reintentar, marcarAtendida } = useDatosSalas(fecha, mes);

  // Cambia parámetros de la URL; un valor vacío quita el parámetro.
  const actualizar = (cambios) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };

  const esHoy = fecha === hoy;
  const rango = rangoDe(desde, hasta);
  const rangoInvalido = Boolean(desde && hasta && !rango);
  const qn = q.trim().toLowerCase();
  const hayFiltros = filtro !== "todas" || Boolean(desde || hasta || q);

  const todas = salas ?? [];
  const info_ = todas.map((s) => datosDeSala(s, { esHoy, ahoraMin, rango }));
  const base = info_.filter((x) =>
    (!qn || x.sala.nombre.toLowerCase().includes(qn) || x.sala.id.replace("sala-", "") === qn) && (!rango || x.libreRango));
  const visibles = base.filter((x) => pasa(filtro, x, { esHoy, rango }));
  const conteos = Object.fromEntries(FILTRO_IDS.map((id) => [id, base.filter((x) => pasa(id, x, { esHoy, rango })).length]));
  const filas = visibles.map((x) => ({ x, estado: estadoDeSala(x, { esHoy, ahoraMin }) }));
  const detalle = salaId ? todas.find((s) => s.id === salaId) ?? null : null;

  const subtitulo = esHoy
    ? "Agenda de hoy, equipos y avisos."
    : "Agenda del día elegido, equipos y avisos.";
  const fechaTexto = fechaLarga(fecha).replace(/^./, (c) => c.toUpperCase());

  const elegirFecha = (f) => {
    setMes(f.slice(0, 7));
    actualizar({ fecha: f, sala: null, res: null });
  };


  return (
    <>
        <div className="sa-vista">
          <header className="sa-cabecera">
            <div>
              <nav aria-label="Ruta" className="sa-migas">Guardian Labs › <span>Salas</span></nav>
              <h1 className="sa-titulo">Estado de las salas</h1>
              <p className="sa-subtitulo">{subtitulo}</p>
            </div>
            <SelectorFecha
              fecha={fecha}
              onElegir={elegirFecha}
              diasConReservas={dias.map((d) => d.fecha)}
              mes={mes}
              onMesCambio={setMes}
            />
          </header>

          {salas === null ? (
            <div className="sa-indicadores" aria-busy="true" aria-label="Cargando indicadores">
              {[0, 1, 2, 3].map((i) => <div key={i} className="sa-esqueleto" />)}
            </div>
          ) : (
            <Indicadores
              salas={todas}
              esHoy={esHoy}
              ahoraMin={ahoraMin}
              avisosPendientes={avisos.pendientes}
              filtro={filtro}
              onFiltro={(id) => actualizar({ filtro: id === "todas" ? null : id })}
              onVerAvisos={() => { setPestanaAvisos("pendiente"); document.getElementById("sa-avisos")?.scrollIntoView({ block: "start" }); }}
            />
          )}

          <BarraFiltros
            filtro={filtro}
            onFiltro={(id) => actualizar({ filtro: id === "todas" ? null : id })}
            conteos={conteos}
            esHoy={esHoy}
            rango={rango}
            desde={desde}
            hasta={hasta}
            onDesde={(v) => actualizar({ desde: v })}
            onHasta={(v) => actualizar({ hasta: v })}
            busca={q}
            onBusca={(v) => actualizar({ q: v })}
            rangoInvalido={rangoInvalido}
            onLimpiar={() => actualizar({ filtro: null, desde: null, hasta: null, q: null })}
            hayFiltros={hayFiltros}
          />

          <div className="d-flex flex-wrap gap-3 align-items-start">
            <section aria-label="Salas" className="sa-tarjeta sa-tabla-seccion">
              <div className="sa-tarjeta-cabecera">
                <strong aria-live="polite">{salas ? `${filas.length} de ${todas.length} salas · ${fechaLarga(fecha)}` : "Cargando salas…"}</strong>
                <span className="sa-leyenda-agenda">
                  <span className="d-inline-flex align-items-center gap-1"><i className="sa-muestra" style={{ background: "#2563EB" }} />Programada</span>
                  <span className="d-inline-flex align-items-center gap-1">
                    <i className="sa-muestra" style={{ background: "repeating-linear-gradient(135deg,#9A3412 0 3px,#B45309 3px 6px)" }} />Escalada
                  </span>
                  {esHoy && <span className="d-inline-flex align-items-center gap-1"><i className="sa-muestra" style={{ background: "#DC2626", width: 2 }} />Ahora</span>}
                </span>
              </div>

              {estadoSalas === "error" && (
                <div role="alert" className="d-flex flex-wrap align-items-center gap-2 p-3">
                  <span>No pude cargar las salas.</span>
                  <button type="button" className="sa-btn" onClick={reintentar}>Reintentar</button>
                </div>
              )}

              {salas === null && estadoSalas !== "error" && (
                <div className="p-3 d-flex flex-column gap-2" aria-busy="true">
                  {[0, 1, 2].map((i) => <div key={i} className="sa-esqueleto" />)}
                </div>
              )}

              {salas !== null && (
                <TablaSalas
                  filas={filas}
                  esHoy={esHoy}
                  ahoraMin={ahoraMin}
                  rango={rango}
                  resaltada={detalle ? null : resaltada}
                  onAbrir={(id) => actualizar({ sala: id, res: null })}
                  onPick={(id, codigo) => actualizar({ sala: id, res: codigo })}
                  hayFiltros={hayFiltros}
                  onLimpiar={() => actualizar({ filtro: null, desde: null, hasta: null, q: null })}
                />
              )}
            </section>

            <div id="sa-avisos" className="d-contents sa-avisos-zona">
              <PanelAvisos
                pendientes={avisos.pendientes}
                atendidos={avisos.atendidos}
                estado={estadoAvisos}
                pestana={pestanaAvisos}
                onPestana={setPestanaAvisos}
                onMarcar={marcarAtendida}
                onReintentar={reintentar}
              />
            </div>
          </div>
        </div>

      {detalle && (
        <DetalleSala
          sala={detalle}
          fechaTexto={fechaTexto}
          resaltada={resaltada}
          onCerrar={() => actualizar({ sala: null, res: null })}
        />
      )}
    </>
  );
}
