import type {
  CarneDoc, Conversacion, DecisionReserva, EquipoDoc, NotificacionDoc, ReservaDoc, SalaDoc, SesionDoc, UsuarioDoc,
} from "../tools/esquemas-reservas.js";
import { crearMemoria } from "./memoria.js";
import { hoyBogota } from "../tools/reloj.js";
import { crearRepositorioMongo } from "./mongo.js";

// Días con reservas de un mes (calendario del monitor): programadas y escaladas por fecha.
export type DiaConReservas = { fecha: string; programadas: number; escaladas: number };

// Agrupa reservas (fecha y estado) por día, en orden de fecha. Lo usan los dos repositorios.
export function contarDias(filas: { fecha: string; estado: string }[]): DiaConReservas[] {
  const porDia = new Map<string, DiaConReservas>();
  for (const f of filas) {
    const d = porDia.get(f.fecha) ?? { fecha: f.fecha, programadas: 0, escaladas: 0 };
    if (f.estado === "escalada") d.escaladas++;
    else d.programadas++;
    porDia.set(f.fecha, d);
  }
  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface Repositorio {
  tipo: "mongo" | "memoria";
  salas(): Promise<SalaDoc[]>;
  equipos(sala?: string): Promise<EquipoDoc[]>;
  carne(id: string): Promise<CarneDoc | null>;            // carnetización simulada
  usuario(id: string): Promise<UsuarioDoc | null>;
  registrarUsuario(u: UsuarioDoc): Promise<"creado" | "existente">;
  reservasDelDia(fecha: string, sala?: string): Promise<ReservaDoc[]>; // solo estado "programada"
  escaladasDelDia(fecha: string): Promise<ReservaDoc[]>;             // solo estado "escalada" (para la API)
  // Re-evalúa las reglas DENTRO de la operación atómica y solo inserta si sigue siendo "programar".
  // `revalidar` recibe las reservas programadas de esa sala y ese día.
  crearReservaAtomica(
    fecha: string, sala: string,
    revalidar: (reservasActuales: ReservaDoc[]) => DecisionReserva,
    construir: (codigo: string) => ReservaDoc,
  ): Promise<{ decision: DecisionReserva; reserva: ReservaDoc | null }>;
  // Asigna el siguiente RS-NNNN (mismo contador), guarda la reserva "escalada" y sus avisos, y devuelve
  // el código. Todo en una sola transacción.
  registrarEscalada(
    construir: (codigo: string) => ReservaDoc,          // estado: "escalada"
    avisos: (codigo: string) => NotificacionDoc[],      // reserva_codigo = codigo (R19: monitor y mantenimiento)
  ): Promise<string>;
  // Aviso sin reserva (R17: identidad desconocida). reserva_codigo debe ser null.
  notificar(n: NotificacionDoc): Promise<void>;
  notificaciones(estado?: "pendiente" | "atendida"): Promise<NotificacionDoc[]>;
  // Marca un aviso pendiente como atendido. false si no existe o ya estaba atendido.
  marcarAtendida(id: string, cuando: Date): Promise<boolean>;
  // Calendario del monitor: días del mes (aaaa-mm) con reservas, y una reserva por código (cualquier estado).
  diasConReservas(mes: string): Promise<DiaConReservas[]>;
  reservaPorCodigo(codigo: string): Promise<ReservaDoc | null>;
  // R27: reservas programadas de un carné desde una fecha (las suyas, para cancelar desde el chat).
  reservasDeCarne(carne: string, desde: string): Promise<ReservaDoc[]>;
  // R27: cancela solo si la reserva está programada y es de ese carné (la condición va en la misma escritura).
  cancelarReserva(codigo: string, carne: string, cuando: Date): Promise<boolean>;
  leerConversacion(id: string): Promise<Conversacion | null>;
  guardarConversacion(c: Conversacion): Promise<void>;
  borrarConversacion(id: string): Promise<void>;
  // Sesión identificada (colección sesiones, TTL 1800 s sobre actualizado).
  leerSesion(id: string): Promise<SesionDoc | null>;
  guardarSesion(s: SesionDoc): Promise<void>;
  borrarSesion(id: string): Promise<void>;
  cerrar(): Promise<void>;
}

// Quita la cadena de conexión de cualquier mensaje antes de imprimirlo.
function sinUri(mensaje: string, uri: string): string {
  return mensaje.split(uri).join("[uri]").replace(/mongodb(\+srv)?:\/\/\S+/g, "[uri]");
}

// Tipo de base que se muestra en la interfaz. Solo el tipo, nunca la URI:
// "local" (127.0.0.1 o localhost), "atlas" (mongodb+srv), "remota" (otro host de mongodb) o "memoria".
export function tipoDeBase(tipo: Repositorio["tipo"], uri: string | undefined): "local" | "atlas" | "remota" | "memoria" {
  if (tipo !== "mongo" || !uri) return "memoria";
  if (uri.startsWith("mongodb+srv://")) return "atlas";
  return /^mongodb:\/\/(?:[^@/]*@)?(?:127\.0\.0\.1|localhost)(?::\d+)?(?:[/?]|$)/.test(uri) ? "local" : "remota";
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
