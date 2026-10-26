import { useEffect, useState } from "react";
import { api } from "../api.js";
import TarjetaDecision from "../components/TarjetaDecision.jsx";
import { Cargando, ErrorApi, Vacio } from "../components/Estado.jsx";
import { ilus } from "../assets/ilustraciones/index.js";

// Ids sintéticos de data/casos.ts (no corresponden a personas reales).
const CASOS = Array.from({ length: 11 }, (_, i) => `E-${String(i + 1).padStart(3, "0")}`);

// Casos que exige la demostración del taller (el de "fuera de alcance" está en el Chat).
const DEMOS = [
  { etiqueta: "Caso normal", id: "E-001", icono: "bi-check2-circle" },
  { etiqueta: "Dato desconocido", id: "E-005", icono: "bi-question-circle" },
  { etiqueta: "Contradicción entre fuentes", id: "E-008", icono: "bi-arrow-left-right" },
  { etiqueta: "Desconocido + contradicción", id: "E-006", icono: "bi-exclamation-diamond" },
];

const INICIAL = { id_sintetico: "E-001", laboratorio: "sala-1", franja: "08:00–10:00", tipo_evento: "ingreso" };

export default function Monitor() {
  const [salas, setSalas] = useState([]);
  const [form, setForm] = useState(INICIAL);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.salas().then(setSalas).catch(() => {});
  }, []);

  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    setForm((f) => {
      const nuevo = { ...f, [campo]: valor };
      if (campo === "laboratorio") {
        const sala = salas.find((s) => s.id === valor);
        if (sala?.franja) nuevo.franja = sala.franja;
      }
      return nuevo;
    });
  };

  async function evaluar(entrada) {
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      setResultado(await api.evaluar(entrada));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  const enviar = (e) => {
    e.preventDefault();
    evaluar(form);
  };

  const probarDemo = (id) => {
    const entrada = { ...INICIAL, id_sintetico: id };
    setForm(entrada);
    evaluar(entrada);
  };

  return (
    <>
      <section className="gl-hero p-4 mb-4 d-flex align-items-center justify-content-between">
        <div>
          <h3 className="fw-bold mb-1">Control en la puerta</h3>
          <p className="mb-0 opacity-75">
            Evalúa el ingreso con las reglas R1–R13. El agente recomienda; usted decide.
          </p>
        </div>
        <img src={ilus.autenticacion} alt="" className="d-none d-md-block" />
      </section>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card mb-4">
            <div className="card-body">
              <h5 className="mb-3"><i className="bi bi-person-badge me-2" />Solicitud</h5>
              <form onSubmit={enviar} className="row g-3">
                <div className="col-6">
                  <label className="form-label" htmlFor="id">Identificador</label>
                  <select id="id" className="form-select" value={form.id_sintetico} onChange={cambiar("id_sintetico")}>
                    {CASOS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label" htmlFor="sala">Sala</label>
                  <select id="sala" className="form-select" value={form.laboratorio} onChange={cambiar("laboratorio")}>
                    <option value="sala-1">Sala 1</option>
                    <option value="sala-2">Sala 2</option>
                    <option value="sala-3">Sala 3</option>
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label" htmlFor="franja">Franja</label>
                  <input id="franja" className="form-control" value={form.franja} onChange={cambiar("franja")} placeholder="08:00–10:00" />
                </div>
                <div className="col-6">
                  <label className="form-label" htmlFor="evento">Evento</label>
                  <select id="evento" className="form-select" value={form.tipo_evento} onChange={cambiar("tipo_evento")}>
                    <option value="ingreso">Ingreso</option>
                    <option value="salida">Salida</option>
                    <option value="cierre">Cierre de franja</option>
                  </select>
                </div>
                <div className="col-12">
                  <button className="btn btn-gl w-100" disabled={cargando}>
                    {cargando ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-shield-check me-2" />}
                    Evaluar ingreso
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h6 className="mb-3"><i className="bi bi-play-circle me-2" />Casos para la demostración</h6>
              <div className="d-grid gap-2">
                {DEMOS.map((d) => (
                  <button key={d.id} type="button" className="btn btn-demo" disabled={cargando} onClick={() => probarDemo(d.id)}>
                    <i className={`bi ${d.icono} me-2`} />
                    {d.etiqueta} <span className="text-secondary small ms-1">({d.id})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          {cargando && <Cargando />}
          {!cargando && error && <ErrorApi mensaje={error} />}
          {!cargando && !error && resultado && <TarjetaDecision resultado={resultado} />}
          {!cargando && !error && !resultado && (
            <Vacio
              img={ilus.autenticacion}
              titulo="Sin solicitudes todavía"
              texto="Llene la solicitud o elija un caso de demostración para ver la recomendación."
            />
          )}
        </div>
      </div>
    </>
  );
}
