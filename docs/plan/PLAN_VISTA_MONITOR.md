# Plan v4 — Vista "Salas" para el monitor (detallado para ejecutar)

Fecha: 2026-11-08 · Base: commit con matriz en verde, MongoDB local (rs0) · Página actual: `web/src/pages/Salas.jsx`.
Reglas fijas: no leer ni imprimir `.env`; no subir claves; sin commits (los hace Esteban); datos sintéticos;
el carné completo nunca sale de la API.

## 0. Antes de escribir código (obligatorio)
1. Carga y sigue las skills de diseño y buenas prácticas que tengas: **impeccable**, **frontend-design**, **web design**,
   y las de accesibilidad y React si existen. Aplica sus reglas de jerarquía, espaciado, estados y accesibilidad.
2. Abre los prototipos funcionales que acompañan este plan y úsalos como referencia exacta de layout, textos y lógica:
   - `docs/plan/diseno-salas/variante-a.dc.html` — **Variante A**: barra lateral azul marino + tabla (inspirada en `panel-salas-1.webp`).
   - `docs/plan/diseno-salas/variante-b.dc.html` — **Variante B**: rail oscuro + tarjetas y métricas con acento lima (inspirada en `panel-salas-2.webp`).
   Son archivos de prototipo (formato `.dc.html`); NO se copian tal cual. Su bloque `<script>` tiene la lógica de filtros,
   calendario, línea de tiempo, huecos y avisos que hay que portar a React (sección 4).
3. **Variante elegida: A** (barra lateral azul marino + tabla), **con los indicadores con gráficas** que ya están en
   `variante-a.dc.html`. `variante-b.dc.html` queda solo como referencia de las gráficas; no se implementa su estilo
   (rail oscuro, lima, tarjetas de sala ni tira de la semana). Ignora en este plan lo marcado "solo B".
4. Revisa la documentación oficial de `@daypicker/react` 10.0.2 (https://daypicker.dev/start y /localization/changing-locale)
   y de React Router 8 (`useSearchParams`) antes de usarlas. No te guíes por ejemplos de versiones viejas.

## 1. Decisiones ya tomadas (no preguntar de nuevo)
| Tema | Decisión |
|---|---|
| Datos de quien reserva | Nombre completo + carné enmascarado (C-****0001), rol, programa y jornada (estudiante) o espacio académico (docente), horario, personas, estado y reglas. |
| Selector de fechas | `@daypicker/react@10.0.2` en un popover, en español, con los días con reservas marcados. |
| Acciones | Solo "Marcar atendido" en avisos, con confirmación en línea (nada de `alert()`/`confirm()`). |
| Estilo | Bootstrap 5.3.8 para la rejilla, `offcanvas` y utilidades; los colores y tipografía de la variante elegida van como variables CSS en `web/src/styles/salas.css`. Iconos: bootstrap-icons. |

## 2. Tokens de diseño (`web/src/styles/salas.css`)
```css
/* Variante A */
.salas-a {
  --sa-fondo: #F4F6FB; --sa-superficie: #FFFFFF; --sa-borde: #E2E7F2; --sa-borde-control: #D5DBEA;
  --sa-texto: #0F172A; --sa-texto-2: #5B6478; --sa-primario: #1D4ED8; --sa-primario-suave: #EAF0FF;
  --sa-lateral: #0E1B4D; --sa-lateral-activo: #1F3A8A; --sa-bloque: #2563EB; --sa-ahora: #DC2626;
  --sa-ok-fondo: #E7F7EE; --sa-ok-texto: #136C3A; --sa-alerta-fondo: #FFF4DB; --sa-alerta-texto: #8A5300;
  --sa-escalada-fondo: #FDECDD; --sa-escalada-texto: #9A3412;
  --sa-radio: 14px; --sa-fuente: "Plus Jakarta Sans", system-ui, sans-serif;
}
/* Variante B — solo B, no implementar */
.salas-b {
  --sb-fondo: #E9EAE6; --sb-superficie: #F6F6F3; --sb-blanco: #FFFFFF; --sb-borde: #D3D3CC;
  --sb-texto: #121212; --sb-texto-2: #5E5E58; --sb-acento: #D9F36A; --sb-rail: #161616; --sb-rail-2: #2A2A2A;
  --sb-alerta-fondo: #FCE9A8; --sb-alerta-texto: #5C4400; --sb-ahora: #C2410C;
  --sb-radio: 20px; --sb-fuente: "Inter Tight", system-ui, sans-serif;
}
```
Fuentes: Google Fonts en `web/index.html` (`Plus Jakarta Sans` 400–800 o `Inter Tight` 400–700, según la variante).
Contraste: todos los pares texto/fondo de arriba pasan 4.5:1; no los cambies sin comprobarlo.
Foco visible: `:focus-visible { outline: 3px solid var(--sa-primario | --sb-texto); outline-offset: 2px; }`.
Objetivos táctiles de 44 px como mínimo en botones, chips y bloques de la línea de tiempo.

## 2.1 Indicadores con gráficas (variante A, ver `variante-a.dc.html`)
Cuatro tarjetas `<button>` (aria-pressed cuando su filtro está activo), en `repeat(auto-fit, minmax(220px, 1fr))`, alto mínimo 150 px.
Las gráficas son `div` con alturas en % (sin librería de gráficos) y `aria-hidden="true"`; el número y el texto llevan la información.
| Tarjeta | Número | Gráfica | Clic |
|---|---|---|---|
| Libres ahora (otro día: "Sin reservas") | salas libres / 16 | 16 barras, una por sala: alta verde `#10B981` = libre, baja gris `#CBD3E4` = ocupada | filtro `libres` |
| Reservas del día | reservas del día + etiqueta "N escaladas" | 15 barras, una por hora 07–22: altura = salas ocupadas en esa hora / máximo del día (mínimo 8 %); azul `#2563EB`, la hora actual `#1E3A8A`, vacías `#DCE3F2`; eje "07 · Salas ocupadas por hora · 22" | filtro `reservas` |
| Equipos en revisión | en revisión / total de equipos | barra apilada 12 px: operativos `#10B981`, en revisión `#F59E0B`, con leyenda | filtro `revision` |
| Avisos pendientes (fondo `#0E1B4D`, texto blanco) | pendientes | chips con la regla de cada aviso (R20, R19, R17…) | abre la pestaña Pendientes de avisos |
Los datos salen de `/salas?fecha=` (reservas y equipos por sala) y `/notificaciones`; se recalculan al cambiar la fecha.

## 3. API (agent/channels/http.ts) con pruebas
```ts
// a) Días del mes con reservas (marca el calendario)
app.get("/reservas/dias", async (req, res) => {
  const v = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(req.query);
  if (!v.success) return void res.status(400).json({ error: "Parámetro inválido: mes (aaaa-mm)." });
  const repo = await crearRepositorio();
  res.json(await repo.diasConReservas(v.data.mes)); // [{ fecha, programadas, escaladas }]
});
// b) Detalle de una reserva con el solicitante (nombre desde carnetización, carné enmascarado)
app.get("/reservas/:codigo", async (req, res) => {
  const v = z.string().regex(/^RS-\d{4}$/).safeParse(req.params.codigo);
  if (!v.success) return void res.status(400).json({ error: "Código inválido." });
  const repo = await crearRepositorio();
  const r = await repo.reservaPorCodigo(v.data);
  if (!r) return void res.status(404).json({ error: "Reserva no encontrada" });
  const c = await repo.carne(r.carne);
  res.json({ ...r, carne: enmascarar(r.carne), solicitante: c ? solicitanteDe(c) : null });
});
// c) Marcar aviso atendido (solo ese cambio)
app.patch("/notificaciones/:id", express.json(), async (req, res) => {
  const v = z.object({ estado: z.literal("atendida") }).strict().safeParse(req.body);
  if (!v.success) return void res.status(400).json({ error: "Solo se permite { estado: \"atendida\" }." });
  const repo = await crearRepositorio();
  const ok = await repo.marcarAtendida(req.params.id, new Date());
  if (!ok) return void res.status(404).json({ error: "Aviso no encontrado" });
  res.json({ ok: true });
});
// d) /salas acepta ?fecha=aaaa-mm-dd (hoy por defecto) y devuelve, por sala: id, nombre, capacidad, computo,
//    operativos, inciertos, en_revision, equipos [{_id, inventario, mantenimiento, accesible}], reservas del día con carné enmascarado.
```
- `solicitanteDe(c)`: `{ nombres, apellidos, rol, programa?, facultad, jornada?, espacios? }` — sin `_id` del carné.
- Repositorio (mongo y memoria): `diasConReservas(mes)`, `reservaPorCodigo(codigo)`, `marcarAtendida(id, cuando)`;
  `notificaciones()` devuelve también `_id` como texto y `atendida_en`. Validador `$jsonSchema` de `notificaciones` admite `atendida_en` (fecha, opcional).
- `/notificaciones` agrega a cada aviso `solicitante` (nombre) y `carne` enmascarado cuando el aviso tiene carné.
- **Semilla:** RS-0002 (D-20000001) dice materia "Redes" y RS-0003 (D-20000002) "Inteligencia Artificial", que no están entre sus
  espacios académicos. Cambiar a "Bases de Datos" y "Redes de Computadores" en `data/semilla.ts`.
- Pruebas nuevas en `evals/api-monitor.ts` (incluirlo en `npm run pruebas`), con repositorio en memoria:
  días del mes; detalle con solicitante y carné enmascarado; 404; 400 de código; PATCH correcto; PATCH con otro campo → 400;
  `/salas?fecha=` coincide con `/reservas?fecha=`. Y en `evals/mongo.ts`: marcar atendida contra la base del `.env`.

## 4. Interfaz (React) — estructura y lógica
```
web/src/pages/Salas.jsx                 // orquesta: estado en la URL, carga de datos, layout de la variante
web/src/pages/salas/useDatosSalas.js    // fetch de /salas, /reservas/dias y /notificaciones; AbortController; recarga al cambiar fecha
web/src/pages/salas/tiempo.js           // aMin, aHora, pct, huecos, fechaLarga (copiar de los prototipos)
web/src/pages/salas/filtros.js          // FILTROS y aplicarFiltros (copiar `pasa` de los prototipos)
web/src/components/salas/SelectorFecha.jsx  // botón + popover con DayPicker + "Hoy" / "Mañana"
web/src/components/salas/Indicadores.jsx    // 4 indicadores con gráficas (sección 2.1)
web/src/components/salas/BarraFiltros.jsx   // chips de estado con conteo, "Libre desde/hasta", búsqueda, "Limpiar"
web/src/components/salas/LineaTiempo.jsx    // 07–22, bloques <button>, línea "ahora", rango libre resaltado
web/src/components/salas/TablaSalas.jsx     // Variante A
web/src/components/salas/DetalleSala.jsx    // offcanvas derecho: pestañas Agenda / Equipos / Huecos libres
web/src/components/salas/PanelAvisos.jsx    // Pendientes / Atendidos + "Marcar atendido" con confirmación
```
Estado en la URL (React Router `useSearchParams`): `fecha`, `filtro`, `desde`, `hasta`, `q`, `sala` (detalle abierto), `res` (reserva resaltada).
Recargar o compartir la URL abre la misma vista.

Lógica que se porta tal cual de los prototipos (`docs/plan/diseno-salas/*.dc.html`, bloque `<script>`):
```js
// filtros.js
export const FILTROS = [
  ["todas", "Todas"], ["libres", null /* "Libres ahora" | "Sin reservas" | "Libres en el rango" */],
  ["reservas", "Con reservas"], ["escaladas", "Con escaladas"], ["revision", "Equipos en revisión"], ["alto", "Alto cómputo"],
];
export function predicados({ esHoy, ahoraMin, rango }) {
  return {
    todas: () => true,
    libres: (x) => (rango ? x.libreRango : (esHoy ? !x.actual : x.reservas.length === 0)),
    reservas: (x) => x.reservas.length > 0,
    escaladas: (x) => x.reservas.some((r) => r.estado === "escalada"),
    revision: (x) => x.en_revision > 0,
    alto: (x) => x.computo === "alto",
  };
}
// tiempo.js
export const ABRE = 420, CIERRA = 1320;
export const pct = (m) => `${((m - ABRE) / (CIERRA - ABRE)) * 100}%`;
export function huecos(reservas, minimo = 30) { /* igual al prototipo: recorre las reservas ordenadas y junta los rangos libres */ }
```
SelectorFecha con DayPicker (verificar la API de `modifiers`/`modifiersClassNames` en la versión instalada):
```jsx
import { DayPicker } from "@daypicker/react";
import { es } from "@daypicker/react/locale/es";
import "@daypicker/react/style.css";
<DayPicker mode="single" locale={es} weekStartsOn={1} selected={fecha} onSelect={elegir}
  month={mes} onMonthChange={setMes}
  modifiers={{ conReservas: diasConReservas }} modifiersClassNames={{ conReservas: "dia-con-reservas" }} />
```
El popover cierra con Esc (en el propio popover, no un listener global), al elegir un día y al hacer clic fuera; el foco vuelve al botón.

Detalle (offcanvas Bootstrap, `aria-modal`, foco inicial en el título, se cierra con Esc y con el botón ×):
- **Agenda**: por reserva → horario, estado (Programada/Escalada), nombre, rol, carné enmascarado, programa y jornada o espacio académico,
  personas, código y, si escaló, la regla y el motivo. La reserva del bloque clicado va resaltada.
- **Equipos**: tabla equipo / inventario / mantenimiento; resalta contradicciones (inventario disponible y mantenimiento en diagnóstico → R3/R9)
  y estados desconocidos, con texto, no solo color.
- **Huecos libres**: rangos de 30 min o más, con su duración.

Avisos: pestañas Pendientes/Atendidos con conteo; cada aviso → regla, destinatario, motivo, sala, fecha, horario, nombre y carné enmascarado;
"Marcar atendido" → "¿Marcar como atendido? Sí / No" en la misma tarjeta → PATCH → pasa a Atendidos con la hora.

Estados: esqueleto al cargar; vacío útil ("Ninguna sala cumple estos filtros" + Limpiar); error con "Reintentar"; "La hora final debe ser posterior a la inicial".
Responsive: la barra lateral pasa arriba en móvil; la tabla va dentro de `overflow-x: auto`; los indicadores bajan a una columna; probar en 375 px.
Datos: la "hora de referencia" del prototipo (10:30) no va en producción: usar la hora real de Bogotá.

## 5. Ajuste del chat
`agent/tools/ayuda.ts` — "¿Qué puedes hacer?": hablar de reservas, disponibilidad, ocupación por fecha, saludo con carné y aviso al monitor; quitar
"Me llamo Guardian Labs" y el enfoque solo en ingreso. Ajustar `evals/ayuda.ts` si cambia el texto esperado.

## 6. Verificación
- `npm run typecheck`, `npm --prefix web run lint`, `npm --prefix web run build`, `PROVEEDOR=ollama npm run pruebas`, `PROVEEDOR=ollama npm run matriz`.
- Revisión en el navegador (Playwright si está disponible) en 1440 px y 375 px: cambiar de fecha con el calendario, aplicar cada filtro,
  "Libre desde/hasta", clic en un bloque (abre el detalle con la reserva resaltada), las tres pestañas, marcar un aviso atendido,
  recargar con los parámetros en la URL. Capturas en `docs/capturas/` sin datos de la máquina.
- Teclado: todo se opera con Tab/Enter/Espacio/Esc y el foco se ve.

## 7. Documentación
`docs/cambios-reservas.md` sección 7.0.10 (vista del monitor) y nota en el README.

## Orden
3 (API + pruebas + semilla) → 5 (ayuda) → 4 (interfaz: tokens, indicadores con gráficas, filtros, tabla, línea de tiempo, detalle, avisos) → 6 → 7.
No avanzar con pruebas en rojo.
