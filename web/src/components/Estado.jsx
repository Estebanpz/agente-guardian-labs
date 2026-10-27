import Ilustracion from "./Ilustracion.jsx";

// Estados vacíos, de carga y de error con ilustración.
export function Vacio({ nombre, titulo, texto }) {
  return (
    <div className="card">
      <div className="card-body d-flex flex-column align-items-center text-center gl-vacio py-5">
        <Ilustracion nombre={nombre} ancho={220} className="mb-4" />
        <h5 className="mb-1">{titulo}</h5>
        <p className="gl-subtitulo mb-0">{texto}</p>
      </div>
    </div>
  );
}

export function Cargando({ texto = "Evaluando reglas y redactando…" }) {
  return (
    <Vacio
      nombre="pensando"
      titulo={<><span className="spinner-border spinner-border-sm me-2 text-primary" />{texto}</>}
      texto="El motor decide; el modelo local solo redacta la explicación."
    />
  );
}

export function ErrorApi({ mensaje }) {
  return (
    <Vacio
      nombre="sinConexion"
      titulo="No se pudo contactar al agente"
      texto={`${mensaje}. ¿Está corriendo "npm run serve" en la raíz del proyecto?`}
    />
  );
}
