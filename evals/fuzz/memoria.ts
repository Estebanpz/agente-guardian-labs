// Memoria y fuerza bruta: crecimiento del heap con miles de mensajes en sesiones distintas, tope del mapa de
// intentos fallidos con 12 000 correos distintos, y bloqueo de login que no se esquiva con mayúsculas o Unicode.
// Correr con --expose-gc (index.ts lo hace) para medir después de recolectar basura.
process.env.REPOSITORIO = "memoria";
const { SEMILLA, cuantas, azar, tamLog, restaurarLog, informe, textoAleatorio, uuidDe } = await import("./base.js");
const { mensaje, configurarParaPruebas } = await import("../../agent/orquestador.js");
const { crearMemoria } = await import("../../agent/store/memoria.js");
const { modeloSimulado } = await import("../modelo-simulado.js");
const { fijarReloj } = await import("../../agent/tools/reloj.js");
const { iniciarSesion, intentosRegistrados, reiniciarIntentos } = await import("../../agent/tools/acceso.js");
import type { Repositorio } from "../../agent/store/repositorio.js";

const inf = informe("Memoria y fuerza bruta");
const tam0 = tamLog();
console.log(`Semilla: ${SEMILLA}`);
const a = azar(SEMILLA);
const gc = (globalThis as { gc?: () => void }).gc;
const heap = () => { gc?.(); gc?.(); return process.memoryUsage().heapUsed; };
fijarReloj("2026-11-09", "10:00");
const repo = crearMemoria("2026-11-09");
configurarParaPruebas({ repo, interpretar: modeloSimulado });

try {
  // 1) Heap: 500 mensajes de calentamiento y luego N en sesiones distintas.
  for (let i = 0; i < 500; i++) await mensaje(textoAleatorio(a), { sesion: uuidDe(i), autenticado: a.si() ? null : "C-10000001" });
  const N = cuantas(5000);
  const antes = heap();
  for (let i = 0; i < N; i++) await mensaje(textoAleatorio(a), { sesion: uuidDe(10_000 + i), autenticado: a.si() ? null : "C-10000001" });
  const despues = heap();
  const porMensaje = (despues - antes) / N;
  console.log(`   heap: ${(antes / 1e6).toFixed(1)} MB → ${(despues / 1e6).toFixed(1)} MB (${porMensaje.toFixed(0)} B por mensaje${gc ? "" : ", sin --expose-gc"})`);
  inf.objetivo(`${N} mensajes en sesiones distintas: crecimiento ${porMensaje.toFixed(0)} B/mensaje (límite 4096; incluye sesiones vigentes)`, porMensaje < 4096);

  // 2) Mapa de intentos fallidos: un repositorio falso con hash mal formado evita el costo de scrypt.
  reiniciarIntentos();
  const falso = { cuenta: async (c: string) => ({ _id: c, rol: "estudiante", carne: null, nombres: "x", apellidos: "y", hash: "x" }) } as unknown as Repositorio;
  for (let i = 0; i < 12_000; i++) await iniciarSesion(`fuzz${i}@uniespinal.test`, "mala", falso);
  inf.objetivo(`12 000 correos distintos con clave errada: el mapa queda en ${intentosRegistrados()} entradas (tope 10 000)`, intentosRegistrados() <= 10_000);

  // 3) Bloqueo: 5 fallos bloquean; mayúsculas, espacios y formas Unicode equivalentes del correo no lo esquivan;
  //    otro correo no queda bloqueado.
  reiniciarIntentos();
  const real = crearMemoria("2026-11-09");
  for (let i = 0; i < 5; i++) await iniciarSesion("laura.gomez@estudiantes.uniespinal.test", "mala", real);
  const variantes = ["laura.gomez@estudiantes.uniespinal.test", "  LAURA.GOMEZ@estudiantes.uniespinal.test ", "ｌａｕｒａ.gomez@estudiantes.uniespinal.test"];
  for (const v of variantes) {
    const r = await iniciarSesion(v, "Estudiante2026!", real);
    inf.objetivo(`bloqueada con «${v.trim()}» aun con la clave correcta (${r.ok ? 200 : r.status})`, !r.ok && r.status === 429);
  }
  const otro = await iniciarSesion("juan.torres@estudiantes.uniespinal.test", "Estudiante2026!", real);
  inf.objetivo("el bloqueo de Laura no afecta a Juan", otro.ok);
} catch (e) {
  inf.objetivo(`el fuzzer terminó sin excepción: ${(e as Error).message}`, false);
} finally {
  reiniciarIntentos();
  restaurarLog(tam0);
}
inf.terminar();
