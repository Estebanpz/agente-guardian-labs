// Arranque del servidor de la API. Solo en 127.0.0.1; las rutas del monitor exigen su inicio de sesión (agent/tools/acceso.ts).
import { app } from "./http.js";
import { proveedorActivo } from "../llm/proveedor.js";
import { precalentar } from "../llm/interprete.js";

const PUERTO = Number(process.env.PORT ?? 3000);
app.listen(PUERTO, "127.0.0.1", () => {
  console.log(`Guardian Labs en http://127.0.0.1:${PUERTO} (${proveedorActivo()})`);
  // Con el modelo local, la primera lectura del prompt es la más lenta (sin GPU, decenas de segundos): se hace
  // ahora, en segundo plano, para que el primer mensaje del chat ya encuentre el modelo y su caché calientes.
  if (proveedorActivo().startsWith("ollama") && process.env.MODELO_PRECALENTAR !== "0") precalentar();
});
