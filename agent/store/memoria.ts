import type {
  CarneDoc, Conversacion, DecisionReserva, EquipoDoc, NotificacionDoc, ReservaDoc, SalaDoc, UsuarioDoc,
} from "../tools/esquemas-reservas.js";
import {
  carnetizacionSemilla, equiposSemilla, reservasSemilla, salasSemilla, usuariosSemilla,
} from "../../data/semilla.js";
import type { Repositorio } from "./repositorio.js";

// Repositorio en memoria (pruebas y respaldo sin red), sembrado desde data/semilla.ts.
// Sin `await` dentro de crearReservaAtomica: en Node no hay intercalado entre sus pasos.
export function crearMemoria(hoy: string): Repositorio {
  const salas: SalaDoc[] = [...salasSemilla];
  const equipos: EquipoDoc[] = equiposSemilla();
  const carne = new Map<string, CarneDoc>(carnetizacionSemilla.map((c) => [c._id, c]));
  const usuarios = new Map<string, UsuarioDoc>(usuariosSemilla.map((u) => [u._id, u]));
  const reservas: ReservaDoc[] = reservasSemilla(hoy);
  const notificaciones: NotificacionDoc[] = [];
  const conversaciones = new Map<string, Conversacion>();
  let ultimo = 3; // las tres reservas de la semilla son RS-0001 … RS-0003

  const siguienteCodigo = () => `RS-${String(++ultimo).padStart(4, "0")}`;

  return {
    tipo: "memoria",

    async salas() {
      return salas.slice();
    },

    async equipos(sala) {
      return equipos.filter((q) => !sala || q.sala === sala);
    },

    async carne(id) {
      return carne.get(id) ?? null;
    },

    async usuario(id) {
      return usuarios.get(id) ?? null;
    },

    async registrarUsuario(u) {
      if (usuarios.has(u._id)) return "existente";
      usuarios.set(u._id, u);
      return "creado";
    },

    async reservasDelDia(fecha, sala) {
      return reservas.filter((r) =>
        r.fecha === fecha && r.estado === "programada" && (!sala || r.sala === sala));
    },

    async escaladasDelDia(fecha) {
      return reservas.filter((r) => r.fecha === fecha && r.estado === "escalada");
    },

    async crearReservaAtomica(fecha, sala, revalidar, construir) {
      const actuales = reservas.filter((r) => r.fecha === fecha && r.sala === sala && r.estado === "programada");
      const decision = revalidar(actuales);
      if (decision.decision !== "programar") return { decision, reserva: null };
      const reserva = construir(siguienteCodigo());
      reservas.push(reserva);
      return { decision, reserva };
    },

    async registrarEscalada(construirReserva, construirAvisos) {
      // Síncrono por dentro: el código, la reserva y los avisos no se intercalan con otra operación.
      const codigo = siguienteCodigo();
      const reserva = construirReserva(codigo);
      if (reserva.estado !== "escalada") throw new Error("registrarEscalada exige estado escalada");
      reservas.push(reserva);
      notificaciones.push(...construirAvisos(codigo));
      return codigo;
    },

    async notificar(n) {
      if (n.reserva_codigo !== null) throw new Error("notificar sin reserva exige reserva_codigo null");
      notificaciones.push(n);
    },

    async notificaciones(estado) {
      return notificaciones.filter((n) => !estado || n.estado === estado);
    },

    async leerConversacion(id) {
      return conversaciones.get(id) ?? null;
    },

    async guardarConversacion(c) {
      conversaciones.set(c._id, c);
    },

    async borrarConversacion(id) {
      conversaciones.delete(id);
    },

    async cerrar() {
      // Nada que liberar en memoria.
    },
  };
}
