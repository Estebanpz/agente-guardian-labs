# PRODUCT.md · Guardian Labs

Contexto de producto y de diseño de Guardian Labs. Sirve como fuente única para quien diseñe o programe interfaces (personas, Haiku, Stitch u otra herramienta). Si un valor de aquí choca con el código, manda el código y se actualiza este archivo.

## 1. Producto

- **Qué es:** asistente de reservas y monitoreo de las salas de sistemas de UniEspinal (proyecto del curso de IA).
- **Principio rector:** el motor de reglas (`reglas.json`, R1–R26) decide; el modelo (Ollama `llama3.2:3b`) solo interpreta el texto. La interfaz nunca presenta una decisión como opinión del modelo.
- **Decisiones posibles:** Permitir, Negar, Escalar (al monitor). Cada una tiene color, icono y texto propios.
- **Vistas:**
  - **Laboratorios** (`/`): estado de salas y equipos, casos de demostración.
  - **Chat** (`/chat`): conversación con el asistente; identidad por carné primero.
  - **Salas** (`/salas`): panel del monitor (variante A elegida): KPI con gráficas, tabla agenda, avisos, detalle en offcanvas.

## 2. Usuarios

| Usuario | Qué necesita | Notas de interfaz |
|---|---|---|
| Estudiante | Reservar rápido, saber si hay cupo | Carné `C-` + 8 dígitos. No se le pide espacio académico. |
| Docente | Reservar para clase, ver salas con aforo | Carné `D-` + 8 dígitos. Se le pide espacio académico. |
| Monitor | Ver ocupación del día, atender avisos | Usa la vista Salas; marca avisos como atendidos. |

Carnés siempre sintéticos y enmascarados en pantalla (`C-1234••••`). Nombre visible solo el de pila más apellido.

## 3. Voz y tono

- Español de Colombia, tuteo, frases cortas, verbos simples.
- Cada respuesta dice qué pasó y qué hacer después. Sin disculpas vacías, sin tecnicismos ("R18" va como dato secundario, nunca como mensaje principal).
- Botones con la acción exacta: "Usar Sala 8", "Escalar al monitor", "Ver otras salas", "Marcar atendido".
- Ejemplos vigentes:
  - Saludo: plantilla con nombre y programa tras validar el carné.
  - Validando: "Un momento, estamos validando…".
  - Fuera de alcance: "Te ayudo con reservas, disponibilidad y ocupación de las salas de sistemas."
  - Escalar: cierra con "Confirma el caso con el monitor. Ha sido un gusto ayudarte."
- Mayúsculas de oración. Nada de TODO MAYÚSCULAS en etiquetas.

## 4. Sistemas visuales

Hoy conviven dos capas. La dirección acordada es migrar todo hacia la capa **Salas A**; mientras tanto se respetan ambas.

### 4.1 Capa global `gl-` (`web/src/index.css`, Bootstrap 5.3.8)

| Token | Valor | Uso |
|---|---|---|
| `--gl-primario` | `#4b45c6` | Botón principal, burbuja del usuario, enlaces |
| `--gl-acento` | `#6c63ff` | Degradado del logo/hero, puntos de "escribiendo" |
| `--gl-fondo` | `#f4f5fb` | Fondo de página |
| `--gl-texto` | `#1f2147` | Texto principal |
| `--gl-suave` | `#6b6f91` | Subtítulos, etiquetas, pie |
| `--gl-borde` | `#e7e8f3` | Bordes de tarjetas y burbujas |
| `--gl-permitir` | `#16a34a` | Decisión Permitir |
| `--gl-negar` | `#dc2626` | Decisión Negar |
| `--gl-escalar` | `#d97706` | Decisión Escalar |
| `--gl-estudiantes` | `#8b85ff` | Bloques de reserva de estudiantes |
| `--gl-clase` | = primario | Bloques de clase |
| `--gl-alto` | `#0e7490` | Insignia de riesgo alto |
| hover botón | `#3d37b0` | `.btn-gl:hover` |

Estados de equipo: disponible `#e8f7ee/#15803d`, mantenimiento `#f1f2f6/#6b7280`, diagnóstico `#fff4e5/#b45309`, conflicto `#fde8e8/#b91c1c` + borde `#f8b4b4`, desconocido `#eef0fb` + borde punteado `#c7c9ef`.

- **Tipografía:** `system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif`. Escala de Bootstrap; `.gl-stat` 1.6rem/700; etiquetas de formulario .85rem/600.
- **Radios:** tarjeta 1.1rem · hero 1.25rem · burbuja 1rem (esquina de origen .25rem) · equipo .8rem · logo 11px · chips y pestañas 999px.
- **Sombra:** tarjetas `0 6px 24px rgba(31,33,71,.05)`.
- **Degradado de marca:** `linear-gradient(135deg, #4b45c6, #6c63ff)` solo en logo y hero.

### 4.2 Capa Salas A `sa-` (`web/src/styles/salas.css`, todo cuelga de `.salas-a`)

| Token | Valor | Uso |
|---|---|---|
| `--sa-fondo` | `#F4F6FB` | Fondo |
| `--sa-superficie` | `#FFFFFF` | Tarjetas, controles |
| `--sa-borde` | `#E2E7F2` | Bordes de tarjeta |
| `--sa-borde-control` | `#D5DBEA` | Bordes de botón, chip, input |
| `--sa-texto` | `#0F172A` | Texto principal |
| `--sa-texto-2` | `#5B6478` | Texto secundario |
| `--sa-primario` | `#1D4ED8` | Acción principal, foco |
| `--sa-primario-suave` | `#EAF0FF` | Fondo de "ocupada" |
| `--sa-lateral` | `#0E1B4D` | Barra lateral |
| `--sa-lateral-activo` | `#1F3A8A` | Ítem activo de navegación |
| `--sa-bloque` | `#2563EB` | Bloque de reserva en la agenda |
| `--sa-bloque-escalada` | `#9A3412` → `#B45309` | Bloque escalado (rayado/degradado) |
| `--sa-ahora` | `#DC2626` | Línea de "ahora" |
| `--sa-libre` | `#10B981` | Gráfica de libres |
| `--sa-ocupada-barra` | `#CBD3E4` | Barra de ocupadas |
| `--sa-hora-actual` / `--sa-hora-vacia` | `#1E3A8A` / `#DCE3F2` | Barras por hora |
| `--sa-revision` | `#F59E0B` | Equipos en revisión |
| ok | `#E7F7EE` / `#136C3A` | Pastilla Libre |
| alerta | `#FFF4DB` / `#8A5300` | Avisos |
| escalada | `#FDECDD` / `#9A3412` | Pastilla Escalada |
| `--sa-error` | `#A11B1B` | Texto de error |

- **Tipografía:** Plus Jakarta Sans 400/500/600/700/800 (Google Fonts, `display=swap`), respaldo `system-ui`.

| Rol | Tamaño / peso |
|---|---|
| Título de página | 28px / 800, `letter-spacing -0.01em`, `text-wrap: balance` (24px en móvil) |
| Valor KPI | 30px / 800, line-height 1.1 |
| Marca lateral | 17px / 700 |
| Botón, control | 14px / 600 |
| Chip | 13px / 600 |
| Título KPI, cabecera de tabla, pastilla | 12px / 600–700 |
| Texto en bloque de agenda | 11px / 700 |

- **Espaciado (base 4px):** 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 28 · 48. Principal `24px 28px 48px` (móvil 16px). Lateral 224px de ancho, padding `24px 16px`. Celdas de tabla `12px 16px`, cabecera `10px 16px`. Tarjeta KPI padding 16px, alto mínimo 150px. Offcanvas de detalle 480px, padding 24px.
- **Radios:** `--sa-radio` 14px (tarjetas, KPI) · aviso/esqueleto 12px · botón y nav 10px · control 8px · bloque 6px · chip y pastilla 999px.
- **Sombras:** solo en capas flotantes: detalle `-12px 0 32px rgba(15,23,42,.18)`; tooltips `0 12px 32px rgba(15,23,42,.14)`. Las tarjetas usan borde, no sombra.

## 5. Componentes

- **Navegación lateral** (`NavegacionLateral.jsx`, compartida): Laboratorios `bi-pc-display`, Chat `bi-chat-dots`, Salas `bi-grid-3x3-gap`. Ítems de 44px, hover `rgba(255,255,255,.08)`, activo con `aria-current="page"`. Abajo, estado de la base y del proveedor (punto verde/rojo). En móvil pasa arriba en fila.
- **Burbujas de chat:** usuario a la derecha (primario, texto blanco, radio `1rem 1rem .25rem 1rem`); agente a la izquierda (blanco, borde, radio `1rem 1rem 1rem .25rem`). Ancho máximo 85%, padding `.7rem 1rem`. La respuesta del agente lleva insignia de intención (icono + texto).
- **Insignias de intención:** solicitud_reserva `bi-calendar-plus`, consulta_disponibilidad `bi-calendar3`, consulta_salas `bi-grid-3x3-gap`, identidad `bi-person-badge`, aclaracion `bi-question-circle`, ayuda `bi-info-circle`, fuera_de_alcance `bi-slash-circle`, datos_prohibidos `bi-incognito`, intento_eludir_reglas `bi-shield-exclamation`, error_modelo `bi-exclamation-octagon`.
- **Chips de sugerencia:** píldora 999px, .8rem, `btn-outline-secondary`; "Cancelar" en `outline-danger` con `bi-x-circle`.
- **Entrada del chat:** textarea que crece hasta 160px, contador `n/MAX` (rojo al 90%), ayuda "Enter para enviar · Shift+Enter para nueva línea", botón enviar `bi-send-fill` con `aria-label`.
- **Tarjeta de decisión:** borde izquierdo de 6px con el color de la decisión, más texto e icono. Nunca solo color.
- **KPI con gráfica** (Salas A): título, valor grande, nota, y mini gráfica (barras apiladas libres/ocupadas, barras por hora).
- **Tabla agenda:** sala, tipo, operativos con barra, pastilla de estado, línea de tiempo 07:00–22:00 con bloques y línea roja de "ahora".
- **Avisos:** tarjeta con regla (chip), motivo, pestañas Pendientes/Atendidos con contador, botón "Marcar atendido" (PATCH).
- **Selector de fecha:** `@daypicker/react` 10.0.2.

## 6. Movimiento

- `gl-parpadeo`: tres puntos de "escribiendo", 1.2s, retrasos 0 / .15s / .3s, escala .8→1 y opacidad .25→1.
- Espera mínima de 600ms antes de mostrar la respuesta para que el indicador se vea.
- `sa-brillo`: esqueleto de carga, 1.4s.
- Con `prefers-reduced-motion: reduce` se quitan ambas animaciones (los puntos quedan fijos al 60%).
- Sin entradas animadas por sección ni hover decorativo en tarjetas. El movimiento solo responde a una acción o indica espera.

## 7. Accesibilidad (mínimos)

- Objetivos táctiles de 44px como mínimo (botones, chips, nav, controles, bloques de agenda).
- Foco visible: `outline 3px solid` primario, `offset 2px` (`:focus-visible`).
- Contraste AA en texto; los pares de pastilla ya cumplen sobre su fondo.
- El estado nunca depende solo del color: siempre hay texto o icono.
- Chat con `aria-live="polite"`; iconos decorativos con `aria-hidden="true"`; botones de solo icono con `aria-label`.

## 8. Iconografía

Bootstrap Icons 1.13. Trazo de línea, se usa relleno solo en enviar (`bi-send-fill`). Tamaño heredado del texto; 1.05rem en tarjetas de equipo. Marca: `bi-shield-check` sobre cuadro con degradado o primario.

## 9. Responsive

- Punto de quiebre principal: 767px (Salas) y `lg` de Bootstrap (Chat: 8/4 columnas, apiladas en móvil).
- Margen lateral mínimo 16px en móvil, sin scroll horizontal de página (la tabla tiene su propio scroll).
- Chat: alto `calc(100vh - 330px)`, mínimo 360px.

## 10. Dirección del rediseño del chat

Referencias: `chat-bot-1.webp` (escritorio claro: historial a la izquierda, saludo grande con el nombre, accesos rápidos en tarjetas, entrada en píldora con botón redondo) y `chat-bot-2.webp` (móvil oscuro: acento amarillo, conmutador segmentado, chips con punto, entrada abajo con iconos).

Qué tomar y qué no:
- Tomar: saludo personalizado tras el carné ("Hola, Ana. ¿Qué necesitas hoy?"), accesos rápidos como tarjetas (Reservar sala, Ver disponibilidad, Estado de salas, Mis reservas), entrada en píldora con botón redondo, chips con punto de estado, historial de conversaciones del día en panel lateral.
- Adaptar: el amarillo de la referencia 2 no pertenece a la marca; si hay modo oscuro, se usa `--sa-lateral #0E1B4D` como fondo y `--sa-primario`/`#2563EB` como acento. Mascota 3D fuera; se usa `bi-shield-check` o la ilustración propia.
- Mantener: identidad por carné primero, insignias de intención, tarjetas de decisión, botones de acción exactos, 44px, foco visible, `aria-live`.
- Las dos variantes deben usar la capa Salas A (Plus Jakarta Sans, tokens `sa-`) para que el chat quede alineado con el panel del monitor.

## 11. Reglas de datos en diseños y capturas

- Solo datos sintéticos; carnés enmascarados.
- Ninguna clave, URI de base de datos, `.env` ni nombre de usuario del sistema en capturas, prototipos o prompts.
- Las imágenes de referencia (`*.webp` de la raíz) no se suben al repositorio.
