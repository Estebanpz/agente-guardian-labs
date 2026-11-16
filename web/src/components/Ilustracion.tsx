import { ilus, tam, type NombreIlustracion } from "../assets/ilustraciones";

type Props = { nombre: NombreIlustracion; ancho?: number; prioridad?: boolean; className?: string };

// Imagen con ancho y alto declarados (evita saltos de diseño), carga diferida
// salvo las del encabezado (prioridad), y decodificación asíncrona.
export default function Ilustracion({ nombre, ancho = 220, prioridad = false, className = "" }: Props) {
  const [w, h] = tam[nombre];
  return (
    <img
      src={ilus[nombre]}
      alt=""
      width={ancho}
      height={Math.round((ancho * h) / w)}
      loading={prioridad ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={prioridad ? "high" : "auto"}
      className={`gl-ilus ${className}`}
    />
  );
}
