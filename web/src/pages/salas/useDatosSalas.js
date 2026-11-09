// Carga de datos de la vista Salas: salas del día, días del mes con reservas y avisos.
// Cada cambio de fecha o de mes cancela la carga anterior (AbortController).
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.js";

export function useDatosSalas(fecha, mes) {
  const [salas, setSalas] = useState(null);
  const [estadoSalas, setEstadoSalas] = useState("cargando");
  const [dias, setDias] = useState([]);
  const [avisos, setAvisos] = useState({ pendientes: [], atendidos: [] });
  const [estadoAvisos, setEstadoAvisos] = useState("cargando");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    api.salasDia(fecha, ctl.signal)
      .then((s) => { setSalas(s); setEstadoSalas("ok"); })
      .catch((e) => { if (e.name !== "AbortError") setEstadoSalas("error"); });
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
      .catch((e) => { if (e.name !== "AbortError") setEstadoAvisos("error"); });
    return () => ctl.abort();
  }, [version]);

  const reintentar = useCallback(() => setVersion((v) => v + 1), []);

  // Marca un aviso como atendido y recarga los avisos. Si falla, el error llega al llamador.
  const marcarAtendida = useCallback(async (id) => {
    await api.marcarAtendida(id);
    setVersion((v) => v + 1);
  }, []);

  return { salas, estadoSalas, dias, avisos, estadoAvisos, reintentar, marcarAtendida };
}
