import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api.js";
import { useSesion } from "../sesion.js";
import TarjetaDecision from "../components/TarjetaDecision.jsx";
import TarjetaReserva from "../components/TarjetaReserva.jsx";
import "../styles/chat.css";

// Ejemplos para probar el chat (se muestran plegados en la columna de historial).
const SUGERENCIAS = [
  "¿Qué puedes hacer?",
  "Cancela mi reserva RS-0001",
  "Quiero reservar un almuerzo",
  "¿Qué disponibilidad hay en la sala 6 mañana?",
  "¿Qué salas están ocupadas el jueves y viernes?",
  "Quiero la sala 1 mañana de 11AM hasta la 1PM",
  "Necesito la sala 6 mañana de 2 a 4 pm",
  "¿Cuál es mi nota de programación?",
  "Mi cédula es 1070612345, ¿puedo reservar?",
];

// Accesos rápidos de la pantalla. "Mis reservas" aún no tiene función: se muestra deshabilitado.
const ACCESOS = [
  { texto: "Reservar sala", ayuda: "Crear solicitud", envia: "Quiero reservar una sala", icono: "bi-calendar-check" },
  { texto: "Ver disponibilidad", ayuda: "Horarios libres", envia: "Ver disponibilidad", icono: "bi-calendar3" },
  { texto: "Estado de salas", ayuda: "Equipos y cupos", envia: "¿Cuál es el estado de las salas?", icono: "bi-grid-3x3-gap" },
  { texto: "Mis reservas", ayuda: "Próximamente", envia: null, icono: "bi-bookmark" },
];

const MAX = 500;

// El indicador de espera dice qué se está revisando: una sala o un horario, o cualquier otra solicitud.
const NOMBRA_SALA_U_HORARIO = /\b(sala|salas|laboratorio)\b|\b\d{1,2}(:\d{2}|\.\d{2})?\s*(am|pm|a\.?\s?m\.?|p\.?\s?m\.?)(?!\w)|\bde\s+\d{1,2}\b|\b\d{1,2}:\d{2}\b|\b(hasta|a) las?\s+\d/i;
const textoEspera = (t) => (NOMBRA_SALA_U_HORARIO.test(t)
  ? "Un momento, estoy revisando la disponibilidad…"
  : "Estoy trabajando en tu solicitud…");

// Insignia de intención: icono y texto (nunca solo color).
const ETIQUETAS = {
  fuera_de_alcance: { texto: "Fuera de alcance", icono: "bi-slash-circle" },
  datos_prohibidos: { texto: "Datos personales bloqueados", icono: "bi-incognito" },
  intento_eludir_reglas: { texto: "Intento de eludir reglas", icono: "bi-shield-exclamation" },
  aclaracion: { texto: "Necesito un dato", icono: "bi-question-circle" },
  ayuda: { texto: "Ayuda", icono: "bi-info-circle" },
  error_modelo: { texto: "Modelo no disponible", icono: "bi-exclamation-octagon" },
  consulta_salas: { texto: "Estado de salas", icono: "bi-grid-3x3-gap" },
  consulta_disponibilidad: { texto: "Disponibilidad", icono: "bi-calendar3" },
  registro_usuario: { texto: "Registro", icono: "bi-person-plus" },
  solicitud_reserva: { texto: "Reserva", icono: "bi-calendar-plus" },
  identidad: { texto: "Identidad", icono: "bi-person-badge" },
  saludo: { texto: "Saludo", icono: "bi-person-check" },
  requiere_login: { texto: "Requiere iniciar sesión", icono: "bi-box-arrow-in-right" },
  cancelar_reserva: { texto: "Cancelar reserva", icono: "bi-calendar-x" },
};

// Primer mensaje del agente. La identidad viene del inicio de sesión (14-11-2026), no de un carné escrito.
const puedeReservar = (u) => u?.rol === "estudiante" || u?.rol === "docente";
const mensajeInicial = (usuario) => ({
  id: "bienvenida",
  de: "agente",
  r: puedeReservar(usuario)
    ? { intencion: "saludo", respuesta: `¡Hola, ${usuario.nombres.split(" ")[0]}! Soy Guardian Labs. Puedo reservar una sala, mostrarte la disponibilidad o cancelar una reserva tuya.` }
    : { intencion: "ayuda", respuesta: "¡Hola! Soy Guardian Labs. Sin iniciar sesión te informo la disponibilidad, la ocupación y el estado de las salas. Para reservar o cancelar, inicia sesión con tu cuenta de estudiante o docente." },
  opciones: puedeReservar(usuario) ? ["Reservar una sala", "Ver disponibilidad", "Ayuda"] : ["Ver disponibilidad", "Estado de salas", "Ayuda"],
});

// Cada carga de la página empieza una sesión nueva: la pantalla arranca vacía, así que el servidor no debe
// recordar una conversación que la persona ya no ve (7.0.9). Dentro de la página, la sesión recuerda el carné.
const nuevaSesion = () => crypto.randomUUID();

// Nombre visible: primer nombre y primer apellido ("Laura Gómez").
const nombreVisible = (id) => `${id.nombres.split(" ")[0]} ${id.apellidos.split(" ")[0]}`;

const horaCorta = (fecha) => fecha.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

function Chips({ opciones, onElegir, deshabilitado }) {
  return (
    <div className="ch-chips" role="group" aria-label="Sugerencias de respuesta">
      {opciones.map((o) => (
        <button key={o} type="button" className="ch-chip" disabled={deshabilitado} onClick={() => onElegir(o)}>
          <span className="ch-punto" aria-hidden="true" />
          {o}
        </button>
      ))}
    </div>
  );
}

function RespuestaAgente({ r, opciones, onElegir, cargando }) {
  if (r.error) {
    return <div className="ch-burbuja ch-burbuja-agente ch-error"><i className="bi bi-wifi-off me-2" aria-hidden="true" />{r.error}</div>;
  }
  if (r.reserva) {
    return (
      <div className="ch-fila-tarjeta">
        <TarjetaReserva resultado={r} onUsar={onElegir} />
        {opciones.length > 0 && <Chips opciones={opciones} onElegir={onElegir} deshabilitado={cargando} />}
      </div>
    );
  }
  if (r.decision) {
    return <div className="ch-fila-tarjeta"><TarjetaDecision resultado={r} compacta /></div>;
  }
  const etiqueta = r.aclaracion ? ETIQUETAS.aclaracion : ETIQUETAS[r.intencion];
  return (
    <div className="ch-burbuja ch-burbuja-agente">
      {etiqueta && (
        <span className="ch-insignia"><i className={`bi ${etiqueta.icono}`} aria-hidden="true" />{etiqueta.texto}</span>
      )}
      <div>{r.respuesta ?? r.explicacion}</div>
      {r.intencion === "requiere_login" && (
        <Link to="/ingresar" className="ch-boton ch-boton-primario mt-2 text-decoration-none align-self-start">
          <i className="bi bi-box-arrow-in-right" aria-hidden="true" />Iniciar sesión
        </Link>
      )}
      {opciones.length > 0 && <Chips opciones={opciones} onElegir={onElegir} deshabilitado={cargando} />}
    </div>
  );
}

export default function Chat() {
  const { usuario, salir } = useSesion();
  const navegar = useNavigate();
  const [mensajes, setMensajes] = useState(() => [mensajeInicial(usuario)]);
  const [texto, setTexto] = useState("");
  const [sesion, setSesion] = useState(nuevaSesion);
  const [flujoActivo, setFlujoActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera] = useState("");
  const [inicio, setInicio] = useState(() => new Date());
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

  // Otra persona inició o cerró sesión: la conversación empieza de nuevo (no se mezcla con la anterior).
  const correo = usuario?.correo ?? null;
  const [correoPrevio, setCorreoPrevio] = useState(correo);
  if (correo !== correoPrevio) {
    setCorreoPrevio(correo);
    setSesion(nuevaSesion());
    setMensajes([mensajeInicial(usuario)]);
    setFlujoActivo(false);
    setInicio(new Date());
  }

  async function cerrarSesion() {
    await salir();
    navegar("/ingresar", { replace: true });
  }

  // Las llamadas a la API salen de los manejadores (enviar), no de un efecto.
  async function enviar(t) {
    const limpio = t.trim();
    if (!limpio || cargando) return;
    setTexto("");
    setMensajes((m) => [...m, { id: crypto.randomUUID(), de: "yo", texto: limpio }]);
    setCargando(true);
    setEspera(textoEspera(limpio));
    // El modelo local interpreta cada mensaje: si tarda, se avisa que sigue trabajando.
    const aviso = setTimeout(() => setEspera("Sigo pensando tu mensaje; con el modelo local puede tardar hasta un minuto…"), 8000);
    try {
      // El indicador de espera se ve al menos 600 ms, aunque la respuesta llegue antes.
      const [r] = await Promise.all([api.mensaje(limpio, sesion), new Promise((ok) => setTimeout(ok, 600))]);
      const opciones = r.flujo?.opciones ?? [];
      setFlujoActivo(Boolean(r.flujo?.pendiente) || r.flujo?.tipo === "reserva" || r.flujo?.tipo === "registro");
      setMensajes((m) => [...m, { id: crypto.randomUUID(), de: "agente", r, opciones }]);
      // "salir" escrito en el chat cierra también la sesión de la cuenta.
      if (r.intencion === "cerrar_sesion" && usuario) await cerrarSesion();
    } catch (e) {
      setMensajes((m) => [...m, { id: crypto.randomUUID(), de: "agente", r: { error: e.message }, opciones: [] }]);
    } finally {
      clearTimeout(aviso);
      setCargando(false);
    }
  }

  function nuevaConversacion() {
    setSesion(nuevaSesion());
    setMensajes([mensajeInicial(usuario)]);
    setFlujoActivo(false);
    setInicio(new Date());
    setTexto("");
  }

  // Solo la última respuesta del agente muestra sus chips.
  const ultimo = mensajes.length - 1;
  const primeraPregunta = mensajes.find((m) => m.de === "yo")?.texto ?? "Conversación nueva";

  const titulo = usuario ? `Hola, ${nombreVisible(usuario)}. ¿Qué necesitas hoy?` : "Hola. ¿Qué necesitas hoy?";
  let subtitulo = "Sin sesión: te informo la disponibilidad y el estado de las salas.";
  if (puedeReservar(usuario)) subtitulo = `Carné ${usuario.carne} · ${usuario.programa ?? "Docente"}`;
  else if (usuario) subtitulo = "Monitor de salas · en el chat solo consultas; las reservas se gestionan en Salas.";

  return (
    <div className="ch-layout">
      <aside className="ch-historial" aria-label="Historial de hoy">
        <button type="button" className="ch-boton ch-boton-primario" onClick={nuevaConversacion} disabled={cargando}>
          <i className="bi bi-plus-lg" aria-hidden="true" />Nueva conversación
        </button>
        <h2>Hoy</h2>
        <div className="ch-entrada-historial" aria-current="true">
          <span className="ch-hora">{horaCorta(inicio)}</span>
          <p>{primeraPregunta}</p>
        </div>

        <details className="ch-desplegable">
          <summary>Ejemplos para probar</summary>
          <div className="ch-chips">
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" className="ch-chip" disabled={cargando} onClick={() => enviar(s)}>
                {s}
              </button>
            ))}
          </div>
        </details>

        <details className="ch-desplegable">
          <summary>Cómo funciona</summary>
          <ol className="ps-3 mb-0 small text-secondary">
            <li>Inicia sesión y te saludo por tu nombre.</li>
            <li>Bloqueo datos personales (cédula, correo, teléfono).</li>
            <li>Entiendo lo que necesitas.</li>
            <li>Reviso la sala apenas me das fecha y hora.</li>
            <li>Pido los datos que falten, uno a la vez.</li>
            <li>Las reglas deciden y queda registrado.</li>
            <li>Si hay un conflicto, se lo paso al monitor.</li>
          </ol>
        </details>

        {usuario ? (
          <button type="button" className="ch-boton" onClick={cerrarSesion} disabled={cargando}>
            <i className="bi bi-box-arrow-right" aria-hidden="true" />Cerrar sesión
          </button>
        ) : (
          <Link to="/ingresar" className="ch-boton text-decoration-none">
            <i className="bi bi-box-arrow-in-right" aria-hidden="true" />Iniciar sesión
          </Link>
        )}
      </aside>

      <div className="ch-principal">
        <header className="ch-cabecera">
          <h1 className="ch-saludo">{titulo}</h1>
          <p className="ch-subsaludo">{subtitulo}</p>
          <button type="button" className="ch-boton ch-solo-movil align-self-start" onClick={nuevaConversacion} disabled={cargando}>
            <i className="bi bi-plus-lg" aria-hidden="true" />Nueva conversación
          </button>
        </header>

        <section className="ch-accesos" aria-label="Accesos rápidos">
          {ACCESOS.map((a) => (
            <button
              key={a.texto}
              type="button"
              className="ch-acceso"
              disabled={cargando || a.envia === null}
              aria-disabled={a.envia === null}
              onClick={() => a.envia && enviar(a.envia)}
            >
              <span className="ch-acceso-icono"><i className={`bi ${a.icono}`} aria-hidden="true" /></span>
              <span className="ch-acceso-texto">
                <strong>{a.texto}</strong>
                <small>{a.ayuda}</small>
              </span>
            </button>
          ))}
        </section>

        <section className="ch-hilo" aria-live="polite" aria-label="Conversación">
          {mensajes.map((m, i) => (m.de === "yo" ? (
            <div key={m.id} className="ch-fila ch-fila-yo">
              <div className="ch-burbuja ch-burbuja-yo">{m.texto}</div>
            </div>
          ) : (
            <div key={m.id} className="ch-agente">
              <span className="ch-avatar" aria-hidden="true"><i className="bi bi-robot" /></span>
              <div className="ch-agente-cuerpo">
                <RespuestaAgente r={m.r} opciones={i === ultimo ? m.opciones : []} onElegir={enviar} cargando={cargando} />
                {m.r.cierre && <div className="ch-burbuja ch-burbuja-agente ch-cierre">{m.r.cierre}</div>}
              </div>
            </div>
          )))}
          {cargando && (
            <div className="ch-agente">
              <span className="ch-avatar" aria-hidden="true"><i className="bi bi-robot" /></span>
              <div className="ch-agente-cuerpo">
                <div className="ch-burbuja ch-burbuja-agente d-flex align-items-center gap-2">
                  <span className="gl-escribiendo" aria-hidden="true"><span /><span /><span /></span>
                  <small>{espera}</small>
                </div>
              </div>
            </div>
          )}
          <div ref={fin} />
        </section>

        <div className="ch-entrada-zona">
          {flujoActivo && (
            <button type="button" className="ch-cancelar" disabled={cargando} onClick={() => enviar("cancelar")}>
              <i className="bi bi-x-circle me-1" aria-hidden="true" />Cancelar
            </button>
          )}
          <form className="ch-entrada" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
            <textarea
              ref={entrada}
              rows={1}
              placeholder="Escribe tu mensaje…"
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
            <button type="submit" className="ch-enviar" disabled={cargando || !texto.trim()} aria-label="Enviar">
              <i className="bi bi-send-fill" aria-hidden="true" />
            </button>
          </form>
          <div className="ch-pie">
            <span className="d-none d-sm-inline">Enter para enviar · Shift+Enter para nueva línea</span>
            <span className={texto.length > MAX * 0.9 ? "fw-semibold" : ""}>{texto.length}/{MAX}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
