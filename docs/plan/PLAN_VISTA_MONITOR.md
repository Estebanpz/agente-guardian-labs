# Plan v4 — Vista "Salas" para el monitor

Fecha: 2026-11-08 · Base: matriz 74/74, MongoDB local (rs0) · Página: `web/src/pages/Salas.jsx` (306 líneas hoy).
Reglas fijas: no leer ni imprimir `.env`; no subir claves; sin commits (los hace Esteban); datos sintéticos.

## Decisiones ya tomadas (no preguntar de nuevo)
| Tema | Decisión |
|---|---|
| Datos de quien reserva | El monitor ve **nombre completo + carné enmascarado** (C-****0001), rol, programa y jornada (estudiante) o espacio académico (docente), horario, personas, equipos, estado y reglas. Nunca el carné completo. |
| Selector de fechas | **`@daypicker/react` 10.0.2** (paquete nuevo; `react-day-picker` es el nombre viejo). Trae `date-fns` 4 como dependencia. Docs: https://daypicker.dev/start |
| Acciones del monitor | Puede **marcar avisos como atendidos**. Nada más (no cancela ni edita reservas). |
| Estilo | Bootstrap 5.3.8 + bootstrap-icons (ya instalados). Usar las skills de diseño web y buenas prácticas disponibles (por ejemplo *impeccable* y *frontend-design*) antes de escribir la interfaz. |

Uso de DayPicker (de la documentación oficial):
```js
import { DayPicker } from "@daypicker/react";
import { es } from "@daypicker/react/locale/es";
import "@daypicker/react/style.css";
// <DayPicker mode="single" locale={es} selected={dia} onSelect={setDia} modifiers={{ conReservas: diasConReservas }} />
```
Instalar con `npm --prefix web install @daypicker/react@10.0.2`. Verificar la API de `modifiers` y `modifiersClassNames` en la documentación de la versión instalada antes de usarla.

## 1. API (agent/channels/http.ts) — solo lectura salvo el punto c
a) `GET /reservas/dias?mes=AAAA-MM` → `[{ fecha, programadas, escaladas }]` de los días del mes con reservas (para marcar el calendario).
b) `GET /reservas/:codigo` → detalle de una reserva para el monitor: sala, fecha, inicio, fin, tipo, rol, personas, equipos,
   computo_alto, materia, jornada, estado, reglas_aplicadas, `carne` **enmascarado** y `solicitante: { nombres, apellidos, programa?,
   facultad, jornada? }` tomado de carnetización. 404 si no existe.
c) `PATCH /notificaciones/:id` con `{ estado: "atendida" }` → marca el aviso y guarda `atendida_en`. Solo acepta ese cambio (Zod).
   Agregar el método al repositorio (mongo y memoria) y al validador `$jsonSchema` si aplica.
d) `GET /salas?fecha=AAAA-MM-DD` → que acepte la fecha (hoy siempre usa hoy) para que el estado de equipos y las reservas coincidan con el día elegido.
e) `GET /notificaciones?estado=atendida` ya existe: usarlo para la pestaña "Atendidos".
La API sigue escuchando solo en 127.0.0.1 (sin autenticación; es un prototipo local). Ningún endpoint devuelve el carné completo ni la URI.

## 2. Diseño de la página
Arriba, una **barra de filtros siempre visible** (fija al hacer scroll en escritorio):
- **Fecha**: botón con la fecha en español ("lunes 9 de noviembre") que abre DayPicker en un popover; días con reservas marcados
  con un punto; atajos "Hoy" y "Mañana". Navegar de mes pide `/reservas/dias` de ese mes.
- **Estado de la sala** (chips de selección única, con conteo): Todas · Libres ahora · Ocupadas en el día · Con escaladas ·
  Con equipos en mantenimiento o inciertos · Alto cómputo.
- **Libre entre** (dos `<input type="time">` de 07:00 a 22:00, pasos de 30 min): muestra solo salas libres en ese rango.
- **Buscar sala** (número o nombre).
- Botón "Limpiar filtros". Los filtros activos se reflejan en la URL (`?fecha=&estado=&desde=&hasta=`) para recargar sin perderlos.

Debajo, **4 indicadores** clicables que aplican su filtro: salas libres ahora · reservas del día · equipos en mantenimiento o
inciertos · avisos pendientes.

**Tarjeta de sala** (rediseñada):
- Encabezado: nombre, tipo (Estándar / Alto cómputo), capacidad, operativos/total y estado actual en texto
  ("Libre ahora", "Ocupada hasta 15:00", "Cerrada") con color **y** etiqueta (nunca solo color).
- Línea de tiempo 07–22 con marcas por hora; cada bloque de reserva es un **botón** (teclado y foco visibles, `aria-label`
  "Reserva RS-0001, 13:00 a 15:00, estudiantes") que abre el detalle. Escaladas con otro estilo (rayado) y su leyenda.
- Línea vertical de "ahora" si la fecha es hoy.
- Botón "Ver detalle".

**Panel de detalle** (Bootstrap offcanvas a la derecha; en móvil, pantalla completa):
- Pestaña **Agenda**: reservas del día de esa sala en lista; al elegir una, se ve el detalle de `GET /reservas/:codigo`
  (nombre, carné enmascarado, programa/espacio, horario, personas, equipos, estado, reglas).
- Pestaña **Equipos**: tabla con inventario vs. mantenimiento, resaltando los que no coinciden (contradicción, regla R3/R9) y
  los inciertos; filtro por estado.
- Pestaña **Huecos libres**: rangos libres del día (de `/disponibilidad`).

**Avisos del monitor** (columna derecha en escritorio, pestaña en móvil): pestañas Pendientes / Atendidos; cada aviso muestra
regla, motivo, sala, fecha, horario, carné enmascarado y nombre; botón "Marcar atendido" (con confirmación en línea, no `alert()`).

Estados: cargando (esqueleto), vacío con mensaje útil ("No hay reservas el domingo 8 de noviembre"), error con "Reintentar".
Accesibilidad: contraste AA, foco visible, todo operable con teclado, textos en español, responsive hasta 360 px.
Componentes nuevos en `web/src/components/` (por ejemplo `FiltrosSalas`, `TarjetaSala`, `LineaTiempo`, `DetalleSala`,
`PanelAvisos`, `SelectorFecha`) para que `Salas.jsx` quede corto.

## 3. Ajuste pendiente del chat
Actualizar la respuesta de "¿Qué puedes hacer?" (`agent/tools/ayuda.ts`): que hable de reservas, disponibilidad, ocupación por
fecha, saludo con carné y aviso al monitor; quitar "Me llamo Guardian Labs" y el enfoque solo en ingreso.

## 4. Pruebas
- Pruebas de la API nuevas (en `evals/e2e.ts` o un archivo nuevo incluido en `npm run pruebas`): `/reservas/dias`, `/reservas/:codigo`
  (incluye `solicitante`, carné enmascarado, 404), `PATCH /notificaciones/:id` (cambia a atendida, rechaza otros cambios),
  `/salas?fecha=`.
- `evals/mongo.ts`: marcar atendido en la base del `.env`.
- Revisión visual con el navegador (Playwright si está disponible): escritorio y 375 px, filtro por fecha, clic en un bloque,
  marcar atendido. Guardar capturas en `docs/capturas/` sin datos de la máquina (sin usuario de Linux en la barra).
- `npm run typecheck`, `npm --prefix web run lint`, `npm --prefix web run build`, `PROVEEDOR=ollama npm run pruebas`, `PROVEEDOR=ollama npm run matriz`.

## 5. Documentación
`docs/cambios-reservas.md` sección 7.0.7 y nota en el README de la vista del monitor.

## Orden
1 (API + pruebas) → 3 (ayuda) → 2 (interfaz, empezando por filtros y tarjeta, luego detalle y avisos) → 4 → 5.
No avanzar con pruebas en rojo.
