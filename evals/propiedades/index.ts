// Ejecutor de todas las pruebas basadas en propiedades (fast-check). Uso: npm run propiedades
// Reproducir una corrida: SEMILLA=<número> npm run propiedades (la semilla se imprime al final).
process.env.REPOSITORIO = "memoria";
import { SEMILLA, terminar } from "./comun.js";
import { correr as privacidad } from "./privacidad.js";
import { correr as extraer } from "./extraer.js";
import { correr as acceso } from "./acceso.js";
import { correr as reservas } from "./reservas.js";
import { correr as interprete } from "./interprete.js";
import { correr as flujo } from "./flujo.js";

const t0 = Date.now();
console.log(`Pruebas basadas en propiedades · semilla ${SEMILLA}`);
for (const g of [privacidad, extraer, reservas, interprete, flujo, acceso]) await g();
terminar(t0);
