import { mensaje, solicitar } from "./orquestador.js";

const arg = process.argv.slice(2).join(" ") || "E-001";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let i = 0;
const espera = setInterval(
  () => process.stdout.write(`\r${frames[i++ % frames.length]} Evaluando y redactando...`),
  100,
);

// Un id solo (E-006) va directo al motor; cualquier otra cosa es texto libre.
const r = /^E-\d{3}$/.test(arg)
  ? await solicitar({ id_sintetico: arg, laboratorio: "sala-1", franja: "08:00–10:00", tipo_evento: "ingreso" })
  : await mensaje(arg);

clearInterval(espera);
process.stdout.write("\r" + " ".repeat(40) + "\r");
console.log(JSON.stringify(r, null, 2));
