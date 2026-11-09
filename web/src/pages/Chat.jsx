import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import TarjetaDecision from "../components/TarjetaDecision.jsx";
import TarjetaReserva from "../components/TarjetaReserva.jsx";

// Mensajes de ejemplo: reservas, disponibilidad, registro, ingreso, fuera de alcance y datos prohibidos.
// Sugerencias en orden de uso: primero el carné (la conversación empieza con la identidad).
const SUGERENCIAS = [
  "C-10000001",
  "D-20000001",
  "Soy nuevo en el sistema",
  "¿Qué puedes hacer?",
  "¿Qué disponibilidad hay en la sala 6 mañana?",
  "¿Qué salas están ocupadas el jueves y viernes?",
  "Quiero la sala 1 mañana de 11AM hasta la 1PM",
  "Necesito la sala 6 mañana de 2 a 4 pm",
  "¿Cuál es mi nota de programación?",
  "Mi cédula es 1070612345, ¿puedo reservar?",
];

const MAX = 500;

// El indicador de espera dice qué se está revisando: una sala o un horario, o cualquier otra solicitud.
const NOMBRA_SALA_U_HORARIO = /\b(sala|salas|laboratorio)\b|\b\d{1,2}(:\d{2}|\.\d{2})?\s*(am|pm|a\.?\s?m\.?|p\.?\s?m\.?)(?!\w)|\bde\s+\d{1,2}\b|\b\d{1,2}:\d{2}\b|\b(hasta|a) las?\s+\d/i;
const textoEspera = (t) => (NOMBRA_SALA_U_HORARIO.test(t)
  ? "Un momento, estoy revisando la disponibilidad…"
  : "Estoy trabajando en tu solicitud…");
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
  identidad: { texto: "Identidad", clase: "text-bg-info", icono: "bi-person-badge" },
};

// Primer mensaje del agente: la conversación empieza con el carné (plan de identidad, sección 5).
const mensajeInicial = () => ({
  id: "bienvenida",
  de: "agente",
  r: { intencion: "identidad", respuesta: "¡Hola! Soy Guardian Labs. Para empezar, escríbeme tu carné." },
  opciones: ["Soy nuevo"],
});

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
  const [mensajes, setMensajes] = useState(() => [mensajeInicial()]);
  const [texto, setTexto] = useState("");
  const [sesion, setSesion] = useState(leerSesion);
  const [flujoActivo, setFlujoActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera] = useState("");
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
    setEspera(textoEspera(limpio));
    try {
      const r = await api.mensaje(limpio, sesion);
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
    setMensajes([mensajeInicial()]);
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
              <small className="gl-subtitulo">Escribe en lenguaje natural. Empieza con tu carné (C- o D- y 8 dígitos).</small>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={nuevaConversacion} disabled={cargando}>
                <i className="bi bi-arrow-counterclockwise me-1" />Nueva conversación
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => enviar("salir")} disabled={cargando}>
                <i className="bi bi-box-arrow-right me-1" />Cerrar sesión
              </button>
            </div>
          </div>

          <div className="card-body gl-chat" aria-live="polite">
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
                  <small className="text-secondary">{espera}</small>
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
              <li>Escribe tu carné y te saludo.</li>
              <li>Bloqueo datos personales (cédula, correo, teléfono).</li>
              <li>Entiendo lo que necesitas.</li>
              <li>Reviso la sala apenas me das fecha y hora.</li>
              <li>Pido los datos que falten, uno a la vez.</li>
              <li>Las reglas deciden y queda registrado.</li>
              <li>Si hay un conflicto, se lo paso al monitor.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
