import { ilus } from "../assets/ilustraciones/index.js";

// Estados vacíos, de carga y de error con ilustración.
export function Vacio({ img, titulo, texto }) {
  return (
    <div className="card h-100">
      <div className="card-body d-flex flex-column align-items-center justify-content-center text-center gl-vacio py-5">
        <img src={img} alt="" className="mb-4" />
        <h5 className="mb-1">{titulo}</h5>
        <p className="gl-subtitulo mb-0">{texto}</p>
      </div>
    </div>
  );
}

export function Cargando({ texto = "Evaluando reglas y redactando…" }) {
  return (
    <Vacio
      img={ilus.pensando}
      titulo={<><span className="spinner-border spinner-border-sm me-2 text-primary" />{texto}</>}
      texto="El motor decide; el modelo local solo redacta la explicación."
    />
  );
}

export function ErrorApi({ mensaje }) {
  return (
    <Vacio
      img={ilus.sinConexion}
      titulo="No se pudo contactar al agente"
      texto={`${mensaje}. ¿Está corriendo "npm run serve" en la raíz del proyecto?`}
    />
  );
}
