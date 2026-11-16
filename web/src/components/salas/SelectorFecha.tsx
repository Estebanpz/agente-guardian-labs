import { useEffect, useRef, useState } from "react";
import { DayPicker } from "@daypicker/react";
import { es } from "@daypicker/react/locale/es";
import "@daypicker/react/style.css";
import { fechaLarga, hoyBogota, sumarDias } from "../../pages/salas/tiempo";

// "2026-11-09" → Date local (medianoche) y de vuelta sin pasar por UTC.
const aDate = (fecha: string): Date => {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const aTexto = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Botón con la fecha elegida, Hoy y Mañana, y un popover con el calendario (DayPicker, en español).
// El popover se cierra con Esc, al elegir un día y al hacer clic fuera. El foco vuelve al botón.
type Props = {
  fecha: string; onElegir: (f: string) => void; diasConReservas: string[]; mes: string; onMesCambio: (mes: string) => void;
};

export default function SelectorFecha({ fecha, onElegir, diasConReservas, mes, onMesCambio }: Props) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const hoy = hoyBogota();
  const manana = sumarDias(hoy, 1);

  useEffect(() => {
    if (!abierto) return undefined;
    popover.current?.focus();
    const alPulsar = (e: MouseEvent) => {
      const destino = e.target instanceof Node ? e.target : null;
      if (!popover.current?.contains(destino) && !boton.current?.contains(destino)) setAbierto(false);
    };
    document.addEventListener("mousedown", alPulsar);
    return () => document.removeEventListener("mousedown", alPulsar);
  }, [abierto]);

  const cerrar = () => {
    setAbierto(false);
    boton.current?.focus();
  };

  const elegir = (f: string) => {
    onElegir(f);
    cerrar();
  };

  const marcados = diasConReservas.map((f) => aDate(f));

  return (
    <div className="sa-controles">
      <button
        ref={boton}
        type="button"
        className="sa-btn"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <i className="bi bi-calendar3 text-primary" aria-hidden="true" />
        {fechaLarga(fecha).replace(/^./, (c) => c.toUpperCase())}
      </button>
      <button type="button" className="sa-btn" onClick={() => elegir(hoy)}>Hoy</button>
      <button type="button" className="sa-btn" onClick={() => elegir(manana)}>Mañana</button>

      {abierto && (
        <div
          ref={popover}
          role="dialog"
          aria-label="Elegir fecha"
          tabIndex={-1}
          className="sa-popover"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cerrar();
            }
          }}
        >
          <DayPicker
            className="sa-calendario"
            mode="single"
            locale={es}
            weekStartsOn={1}
            selected={aDate(fecha)}
            onSelect={(date) => date && elegir(aTexto(date))}
            month={aDate(mes ? `${mes}-01` : fecha)}
            onMonthChange={(d) => onMesCambio(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)}
            modifiers={{ conReservas: marcados }}
            modifiersClassNames={{ conReservas: "dia-con-reservas" }}
          />
          <p className="small text-secondary mb-0 mt-2">Los días con punto tienen reservas.</p>
        </div>
      )}
    </div>
  );
}
