// Arranque del servidor de la API. Solo en 127.0.0.1; las rutas del monitor exigen su inicio de sesión (agent/tools/acceso.ts).
import { app } from "./http.js";
import { proveedorActivo } from "../llm/proveedor.js";

const PUERTO = Number(process.env.PORT ?? 3000);
app.listen(PUERTO, "127.0.0.1", () =>
  console.log(`Guardian Labs en http://127.0.0.1:${PUERTO} (${proveedorActivo()})`),
);
