import type {
  CarneDoc, Conversacion, DecisionReserva, EquipoDoc, NotificacionDoc, ReservaDoc, SalaDoc, UsuarioDoc,
} from "../tools/esquemas-reservas.js";
import { crearMemoria } from "./memoria.js";
import { hoyBogota } from "../tools/reloj.js";
import { crearRepositorioMongo } from "./mongo.js";

export interface Repositorio {
  tipo: "mongo" | "memoria";
  salas(): Promise<SalaDoc[]>;
  equipos(sala?: string): Promise<EquipoDoc[]>;
  carne(id: string): Promise<CarneDoc | null>;            // carnetización simulada
  usuario(id: string): Promise<UsuarioDoc | null>;
  registrarUsuario(u: UsuarioDoc): Promise<"creado" | "existente">;
  reservasDelDia(fecha: string, sala?: string): Promise<ReservaDoc[]>; // solo estado "programada"
  // Re-evalúa las reglas DENTRO de la operación atómica y solo inserta si sigue siendo "programar".
  // `revalidar` recibe las reservas programadas de esa sala y ese día.
  crearReservaAtomica(
    fecha: string, sala: string,
    revalidar: (reservasActuales: ReservaDoc[]) => DecisionReserva,
    construir: (codigo: string) => ReservaDoc,
  ): Promise<{ decision: DecisionReserva; reserva: ReservaDoc | null }>;
  registrarEscalada(r: ReservaDoc, n: NotificacionDoc): Promise<void>; // reserva "escalada" + aviso
  notificaciones(estado?: "pendiente" | "atendida"): Promise<NotificacionDoc[]>;
  leerConversacion(id: string): Promise<Conversacion | null>;
  guardarConversacion(c: Conversacion): Promise<void>;
  borrarConversacion(id: string): Promise<void>;
  cerrar(): Promise<void>;
}

// Quita la cadena de conexión de cualquier mensaje antes de imprimirlo.
function sinUri(mensaje: string, uri: string): string {
  return mensaje.split(uri).join("[uri]").replace(/mongodb(\+srv)?:\/\/\S+/g, "[uri]");
}

let instancia: Promise<Repositorio> | null = null;

// Un único repositorio por proceso. Si Mongo falla, usa memoria y lo avisa (sin la URI).
export function crearRepositorio(): Promise<Repositorio> {
  instancia ??= construir();
  return instancia;
}

async function construir(): Promise<Repositorio> {
  const tipo = process.env.REPOSITORIO ?? "memoria";
  const uri = process.env.MONGODB_URI;
  if (tipo !== "mongo") return crearMemoria(hoyBogota());
  if (!uri) {
    console.error("[repositorio] REPOSITORIO=mongo pero falta MONGODB_URI: usando memoria");
    return crearMemoria(hoyBogota());
  }
  try {
    return await crearRepositorioMongo(uri, process.env.MONGODB_DB ?? "guardian_labs");
  } catch (e) {
    console.error(`[mongo] sin conexión: ${sinUri((e as Error).message, uri)}`);
    return crearMemoria(hoyBogota());
  }
}
