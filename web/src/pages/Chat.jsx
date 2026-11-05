import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import TarjetaDecision from "../components/TarjetaDecision.jsx";
import TarjetaReserva from "../components/TarjetaReserva.jsx";
import Ilustracion from "../components/Ilustracion.jsx";

// Mensajes de ejemplo: reservas, disponibilidad, registro, ingreso, fuera de alcance y datos prohibidos.
const SUGERENCIAS = [
  "¿Qué puedes hacer?",
  "¿Qué disponibilidad hay en la sala 6 mañana?",
  "Quiero reservar una sala",
  "Soy nuevo en el sistema",
  "Soy D-20000001, necesito la sala 6 mañana de 2 a 4 pm para 20 estudiantes",
  "Soy E-001, ¿puede entrar?",
  "¿Cuál es mi nota de programación?",
  "Mi cédula es 1070612345, ¿puedo reservar?",
];

const MAX = 500;
const CLAVE_SESION = "gl-sesion";

const ETIQUETAS = {
  fuera_de_alcance: { texto: "Fuera de alcance", clase: "text-bg-secondary", icono: "bi-slash-circle" },
  datos_prohibidos: { texto: "Datos personales bloqueados", clase: "text-bg-danger", icono: "bi-incognito" },
  intento_eludir_reglas: { texto: "Intento de eludir reglas", clase: "text-bg-danger", icono: "bi-shield-exclamation" },
  aclaracion: { texto: "Necesito un dato", clase: "text-bg-primary", icono: "bi-question-circle" },
  ayuda: { texto: "Ayuda", clase: "text-bg-info", icono: "bi-info-circle" },
  error_modelo: { texto: "Modelo no disponible", clase: "text-bg-dark", icono: "bi-exclamation-octagon" },
  consulta_salas: { texto: "Estado de salas", clase: "text-bg-success", icono: "bi-grid-3x3-gap" },
  consulta_disponibilidad: { texto: "Disponibilidad", clase: "text-bg-success", icono: "bi-calendar3" },
  registro_usuario: { texto: "Registro", clase: "text-bg-info", icono: "bi-person-plus" },
  solicitud_reserva: { texto: "Reserva", clase: "text-bg-primary", icono: "bi-calendar-plus" },
};

// La sesión identifica la conversación del navegador. Si sessionStorage no está disponible, se usa una
// sesión nueva por carga de página.
function leerSesion() {
  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    if (guardada) return guardada;
    const nueva = crypto.randomUUID();
    sessionStorage.setItem(CLAVE_SESION, nueva);
    return nueva;
  } catch {
    return crypto.randomUUID();
  }
}

function guardarSesion(id) {
  try {
    sessionStorage.setItem(CLAVE_SESION, id);
  } catch {
    // Sin almacenamiento: la sesión solo dura lo que dure la página.
  }
}

function Chips({ opciones, onElegir, deshabilitado }) {
  return (
    <div className="d-flex flex-wrap gap-2 mt-2">
      {opciones.map((o) => (
        <button key={o} type="button" className="btn btn-sm btn-outline-secondary gl-sugerencia"
          disabled={deshabilitado} onClick={() => onElegir(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function RespuestaAgente({ r, opciones, onElegir, cargando }) {
  if (r.error) {
    return <div className="gl-burbuja gl-burbuja-agente text-danger"><i className="bi bi-wifi-off me-2" />{r.error}</div>;
  }
  if (r.reserva) {
    return (
      <div style={{ maxWidth: "92%" }}>
        <TarjetaReserva resultado={r} onUsar={onElegir} />
        {opciones.length > 0 && <Chips opciones={opciones} onElegir={onElegir} deshabilitado={cargando} />}
      </div>
    );
  }
  if (r.decision) {
    return <div style={{ maxWidth: "92%" }}><TarjetaDecision resultado={r} compacta /></div>;
  }
  const etiqueta = r.aclaracion ? ETIQUETAS.aclaracion : ETIQUETAS[r.intencion];
  return (
    <div className="gl-burbuja gl-burbuja-agente">
      {etiqueta && (
        <span className={`badge ${etiqueta.clase} mb-2`}><i className={`bi ${etiqueta.icono} me-1`} />{etiqueta.texto}</span>
      )}
      <div style={{ whiteSpace: "pre-line" }}>{r.respuesta ?? r.explicacion}</div>
      {opciones.length > 0 && <Chips opciones={opciones} onElegir={onElegir} deshabilitado={cargando} />}
    </div>
  );
}

export default function Chat() {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [sala, setSala] = useState("sala-1");
  const [sesion, setSesion] = useState(leerSesion);
  const [flujoActivo, setFlujoActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const fin = useRef(null);
  const entrada = useRef(null);

  // La caja crece con el texto (hasta un máximo) y vuelve a una línea al enviar.
  useEffect(() => {
    const el = entrada.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  // Las llamadas a la API salen de los manejadores (enviar), no de un efecto.
  async function enviar(t) {
    const limpio = t.trim();
    if (!limpio || cargando) return;
    setTexto("");
    setMensajes((m) => [...m, { id: crypto.randomUUID(), de: "yo", texto: limpio }]);
    setCargando(true);
    try {
      const r = await api.mensaje(limpio, sala, sesion);
      const opciones = r.flujo?.opciones ?? [];
      setFlujoActivo(Boolean(r.flujo?.pendiente) || r.flujo?.tipo === "reserva" || r.flujo?.tipo === "registro");
      setMensajes((m) => [...m, { id: crypto.randomUUID(), de: "agente", r, opciones }]);
    } catch (e) {
      setMensajes((m) => [...m, { id: crypto.randomUUID(), de: "agente", r: { error: e.message }, opciones: [] }]);
    } finally {
      setCargando(false);
    }
  }

  function nuevaConversacion() {
    const nueva = crypto.randomUUID();
    guardarSesion(nueva);
    setSesion(nueva);
    setMensajes([]);
    setFlujoActivo(false);
    setTexto("");
  }

  // Solo la última respuesta del agente muestra sus chips.
  const ultimo = mensajes.length - 1;

  return (
    <div className="row g-4">
      <div className="col-lg-8">
        <div className="card">
          <div className="card-header bg-white d-flex align-items-center justify-content-between flex-wrap gap-2 py-3">
            <div>
              <h5 className="mb-0"><i className="bi bi-robot me-2" />Asistente de los laboratorios</h5>
              <small className="gl-subtitulo">Escriba en lenguaje natural. Use solo ids sintéticos (E-001…) y carnés sintéticos.</small>
            </div>
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="sala-chat" className="small text-secondary">Laboratorio</label>
              <select id="sala-chat" className="form-select form-select-sm" style={{ width: 110 }} value={sala} onChange={(e) => setSala(e.target.value)}>
                <option value="sala-1">Sala 1</option>
                <option value="sala-2">Sala 2</option>
                <option value="sala-3">Sala 3</option>
              </select>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={nuevaConversacion} disabled={cargando}>
                <i className="bi bi-arrow-counterclockwise me-1" />Nueva conversación
              </button>
            </div>
          </div>

          <div className="card-body gl-chat" aria-live="polite">
            {mensajes.length === 0 && (
              <div className="text-center gl-vacio py-4">
                <Ilustracion nombre="chat" ancho={200} className="mb-3" />
                <h6>¿En qué le ayudo en los laboratorios?</h6>
                <p className="gl-subtitulo small mb-0">Pruebe una de las sugerencias de la derecha.</p>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={m.id} className={`d-flex mb-3 ${m.de === "yo" ? "justify-content-end" : "justify-content-start"}`}>
                {m.de === "yo"
                  ? <div className="gl-burbuja gl-burbuja-yo">{m.texto}</div>
                  : <RespuestaAgente r={m.r} opciones={i === ultimo ? m.opciones : []} onElegir={enviar} cargando={cargando} />}
              </div>
            ))}
            {cargando && (
              <div className="d-flex mb-3">
                <div className="gl-burbuja gl-burbuja-agente">
                  <span className="gl-escribiendo me-2"><span /><span /><span /></span>
                  <small className="text-secondary">Pensando…</small>
                </div>
              </div>
            )}
            <div ref={fin} />
          </div>

          <div className="card-footer bg-white py-3">
            {flujoActivo && (
              <div className="mb-2">
                <button type="button" className="btn btn-sm btn-outline-danger gl-sugerencia" disabled={cargando} onClick={() => enviar("cancelar")}>
                  <i className="bi bi-x-circle me-1" />Cancelar
                </button>
              </div>
            )}
            <form className="d-flex gap-2 align-items-end" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
              <div className="flex-grow-1">
                <textarea
                  ref={entrada}
                  rows={1}
                  className="form-control gl-entrada"
                  placeholder="Ej.: Quiero reservar una sala para mañana"
                  aria-label="Mensaje para el asistente"
                  value={texto}
                  maxLength={MAX}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter envía; Shift+Enter hace un salto de línea.
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      enviar(texto);
                    }
                  }}
                />
                <div className="d-flex justify-content-between small text-secondary mt-1 px-1">
                  <span className="d-none d-sm-inline">Enter para enviar · Shift+Enter para nueva línea</span>
                  <span className={texto.length > MAX * 0.9 ? "text-danger fw-semibold" : ""}>{texto.length}/{MAX}</span>
                </div>
              </div>
              <button className="btn btn-gl px-3 mb-4" disabled={cargando || !texto.trim()} aria-label="Enviar">
                <i className="bi bi-send-fill" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="col-lg-4">
        <div className="card mb-4">
          <div className="card-body">
            <h6 className="mb-3"><i className="bi bi-lightbulb me-2" />Sugerencias</h6>
            <div className="d-flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" className="btn btn-sm btn-outline-secondary gl-sugerencia" disabled={cargando} onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body small gl-subtitulo">
            <h6 className="text-body"><i className="bi bi-info-circle me-2" />Cómo funciona</h6>
            <ol className="ps-3 mb-0">
              <li>Se bloquean datos personales (cédula, correo, teléfono).</li>
              <li>Se reconoce la intención del mensaje.</li>
              <li>Se preguntan los datos que falten, uno a la vez.</li>
              <li>Las reglas deciden y la reserva se registra en la base de demostración.</li>
              <li>Los conflictos se escalan a una persona.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
