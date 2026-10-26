import { solicitar } from "./orquestador.js";

const id = process.argv[2] ?? "E-001";

// Indicador de espera mientras el modelo local redacta.
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let i = 0;
const espera = setInterval(
  () => process.stdout.write(`\r${frames[i++ % frames.length]} Evaluando y redactando...`),
  100,
);

const r = await solicitar({
  id_sintetico: id,
  laboratorio: "sala-1",
  franja: "08:00–10:00",
  tipo_evento: "ingreso",
});

clearInterval(espera);
process.stdout.write("\r" + " ".repeat(40) + "\r");
console.log(JSON.stringify(r, null, 2));
