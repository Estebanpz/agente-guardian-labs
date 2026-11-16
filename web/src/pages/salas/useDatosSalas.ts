// Carga de datos de la vista Salas: salas del día, días del mes con reservas y avisos.
// Cada cambio de fecha o de mes cancela la carga anterior (AbortController).
import { useCallback, useEffect, useState } from "react";
import type { Aviso, DiaConReservas, Json, SalaDelDia } from "../../../../agent/api-tipos";
import { api } from "../../api";

export type EstadoCarga = "cargando" | "ok" | "error";
export type AvisoVista = Json<Aviso>;
export type Avisos = { pendientes: AvisoVista[]; atendidos: AvisoVista[] };

const esAborto = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

export function useDatosSalas(fecha: string, mes: string) {
  const [salas, setSalas] = useState<SalaDelDia[] | null>(null);
  const [estadoSalas, setEstadoSalas] = useState<EstadoCarga>("cargando");
  const [dias, setDias] = useState<DiaConReservas[]>([]);
  const [avisos, setAvisos] = useState<Avisos>({ pendientes: [], atendidos: [] });
  const [estadoAvisos, setEstadoAvisos] = useState<EstadoCarga>("cargando");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    api.salasDia(fecha, ctl.signal)
      .then((s) => { setSalas(s); setEstadoSalas("ok"); })
      .catch((e: unknown) => { if (!esAborto(e)) setEstadoSalas("error"); });
    return () => ctl.abort();
  }, [fecha, version]);

  useEffect(() => {
    const ctl = new AbortController();
    api.diasMes(mes, ctl.signal).then(setDias).catch(() => {});
    return () => ctl.abort();
  }, [mes, version]);

  useEffect(() => {
    const ctl = new AbortController();
    Promise.all([api.avisos("pendiente", ctl.signal), api.avisos("atendida", ctl.signal)])
      .then(([pendientes, atendidos]) => { setAvisos({ pendientes, atendidos }); setEstadoAvisos("ok"); })
      .catch((e: unknown) => { if (!esAborto(e)) setEstadoAvisos("error"); });
    return () => ctl.abort();
  }, [version]);

  const reintentar = useCallback(() => setVersion((v) => v + 1), []);

  // Marca un aviso como atendido y recarga los avisos. Si falla, el error llega al llamador.
  const marcarAtendida = useCallback(async (id: string) => {
    await api.marcarAtendida(id);
    setVersion((v) => v + 1);
  }, []);

  return { salas, estadoSalas, dias, avisos, estadoAvisos, reintentar, marcarAtendida };
}
