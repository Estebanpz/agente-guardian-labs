# Plan v4 — Rangos de horario personalizados (R15 sin tope de duración)

Fecha: 2026-11-12 · Pedido de Esteban · Base: commit 9b1d822, reglas 2.0.0, matriz 82/82.
Base de datos: la que indique `MONGODB_URI` en `.env` (hoy MongoDB local con replica set `rs0`).

Reglas fijas para quien ejecute: no leer ni imprimir `.env`; no subir claves; datos y nombres **sintéticos**;
no modificar `agent/tools/motor.ts`, `data/casos.ts` ni `data/equipos.ts`; sin `Co-Authored-By` ni firmas de IA;
no hacer commit (lo hace Esteban, agregando archivos por nombre).

## Problema observado (12-11-2026)

Docente D-20000001: «Quiero una sala para 25 estudiantes el 14 de noviembre de 10AM hasta las 3 de la tarde».
Respuesta: «La reserva dura más de 4 horas. ¿De qué hora a qué hora? … Por ejemplo: de 13:00 a 15:00.»

- El tope de 4 h (`duracion_max_min: 240`) es un **supuesto del equipo** según la `fuente` de R15, no salió de la entrevista.
- Las sugerencias de horario son fijas y de 2 h (chips «08:00 a 10:00», «14:00 a 16:00» y el ejemplo «de 13:00 a 15:00»).
- La disponibilidad sin criterios solo busca huecos de 2 h (`rangosDesde(..., 120)`).

## Decisiones ya tomadas (no preguntar de nuevo)

| Tema | Decisión |
|---|---|
| Duración de una reserva | **Sin tope**: cualquier rango dentro de 07:00–22:00, mínimo 30 minutos. El plazo de 30 días sigue igual. |
| Sugerencias de horario | **Chips derivados del texto** de la persona. Se quitan los chips fijos de 2 h. |
| Disponibilidad | Busca huecos **continuos de la duración pedida** (N horas). Si ese día no hay, sugiere **el día más cercano** (hasta 30 días) que sí tenga. Sin duración pedida: huecos de 30 minutos o más. |

## 1. Regla R15 y versión (`agent/rules/reglas.json` → **2.1.0**)

- `parametros.duracion_max_min`: `null` (sin tope). Dejar `duracion_min_min: 30`.
- R15 `descripcion`: «Fecha u horario fuera de lo permitido (07:00–22:00, mínimo 30 minutos, hasta 30 días): negar y pedir otro horario.»
- R15 `fuente`: añadir «; sin tope de duración: decisión del equipo del 12-11-2026 (antes 4 h, supuesto)».
- R15 `vigente_desde`: `"2026-11-12"`. `version`: `"2.1.0"`.
- `agent/tools/reservas.ts`: tipo `duracion_max_min: number | null`; en `causaR15` saltar el chequeo si es `null`.
  Quitar el texto fijo `"reglas.json 2.0.0"` (línea 38) y leer la versión de `reglas.json`.
- `agent/conversacion.ts` línea 35 (texto de R15): «la fecha u horario no están permitidos (salas de 07:00 a 22:00, mínimo 30 minutos y hasta 30 días)».
- Evals que fijan `"2.0.0"` (`evals/escenarios-reservas.ts`, `evals/mongo.ts`): leer la versión de `reglas.json`, no escribirla a mano.

## 2. Chips de horario derivados del texto (`agent/conversacion.ts`)

Pregunta del campo `horario` (`preguntaPara`):

- Sin ningún dato de hora: «¿De qué hora a qué hora? Las salas abren de 07:00 a 22:00. Escribe el rango que necesites, por ejemplo: de 10:00 a 15:00.» **Sin chips.**
- Con solo la hora de inicio («a las 10»): «¿Hasta qué hora? Empiezas a las 10:00.» Sin chips.

Cuando R15 falla por el horario, la respuesta da la causa (como hoy) y **un chip con el ajuste mínimo** del rango que escribió la persona, en formato `HH:MM a HH:MM` (el extractor ya lo entiende; verificarlo):

| Causa | Chip |
|---|---|
| Empieza antes de 07:00 | `07:00 a {fin}` |
| Termina después de 22:00 | `{inicio} a 22:00` |
| Empieza antes y termina después | `07:00 a 22:00` |
| Dura menos de 30 min | `{inicio} a {inicio + 30 min}` (si no pasa de 22:00) |
| Fin antes que el inicio («de 3 a 1») | `{inicio} a {fin + 12 h}` solo si queda dentro de 07:00–22:00; si no, sin chip |
| Hoy y la hora ya pasó | misma duración desde la siguiente media hora (`{redondeo} a {redondeo + duración}`) si cabe antes de 22:00; si no cabe, chip «Revisar mañana» con el mismo rango |

La fecha, la sala, las personas y los demás datos de la solicitud se **conservan**: solo se vuelve a pedir el horario.

## 3. Disponibilidad por duración

### 3.1 Extractor (`agent/tools/extraer.ts`)

Nuevo campo `duracion_min` (número o `null`), solo cuando el texto no trae un rango explícito:
«por 5 horas», «5 h», «una hora y media», «3 horas y media», «media hora», «90 minutos».
No confundir con horas del día: «a las 3», «3 de la tarde», «de 3 a 5» no son duración.

### 3.2 `disponibilidadTurno`

- N = `fin − inicio` si hay rango; si no, `duracion_min`; si no, 30 minutos.
- Sin otros criterios: listar las salas con un hueco **continuo** de al menos N (`rangosDesde(…, N)`).
  Texto: «Salas con {N} libres seguidas {cuándo}:» (N legible: «5 horas», «1 hora y media», «30 minutos»).
- Con criterios (rango, personas, alto cómputo) y `candidatas()` vacío, o sin huecos de N ese día:
  buscar **el día más cercano** (fecha + 1 … hoy + 30) que cumpla los mismos criterios y responder
  «No hay salas con {N} libres seguidas el {día}. El día más cercano con salas libres es el {día2}. ¿Lo reviso?»
  con el chip «Sí, revisar el {día2 corto}».
- Generalizar la oferta `oferta_manana` a **`oferta_dia`** guardando la fecha ofrecida en el contexto de la sesión.
  «Sí» revisa esa fecha con los mismos criterios; nunca hereda la fecha anterior (regla de 7.0.6).
- Rendimiento: como mucho 30 días × 16 salas; está bien leer `reservasDelDia` por día. Si el repositorio ya tiene una
  consulta por rango de fechas, usarla.

## 4. Reserva sin sala posible (R24)

Si el motor devuelve R24 (ninguna sala cumple en ese horario), además del mensaje actual ofrecer el día más cercano
donde sí haya una sala para el **mismo rango** y las mismas personas (chip «Sí, revisar el {día}»), con el mismo
mecanismo `oferta_dia`. «Ver otras salas» y «Escalar al monitor» no cambian.

## 5. Pruebas

Reloj simulado de las pruebas: lunes 2026-11-09 08:00 (como hoy). Datos de choque creados en la prueba con el
repositorio en memoria; **no** modificar la semilla.

| ID | Entrada | Esperado |
|---|---|---|
| C-45 | D-20000001 → «Quiero una sala para 25 estudiantes el 14 de noviembre de 10AM hasta las 3 de la tarde» | Sin R15; conserva 2026-11-14, 10:00–15:00 y 25 personas; pide el siguiente dato que falte |
| C-46 | C-10000001 → «Quiero la sala 3 mañana de 8 PM a 11 PM» | R15 «las salas abren de 07:00 a 22:00» con chip «20:00 a 22:00»; al tocarlo sigue la reserva |
| C-47 | «¿Qué salas tienen 5 horas libres el martes?» | Solo salas con un hueco continuo ≥ 5 h; texto «5 horas libres seguidas» |
| C-48 | Disponibilidad con rango que ninguna sala cumple ese día (choques creados en la prueba) | Ofrece el día más cercano que sí cumple; «Sí, revisar el …» revisa esa fecha |
| C-30 | (actualizar) hoy ya pasado a las 20:23, «de 9 a 11» | Causa como hoy y chip «Revisar mañana» con 09:00–11:00 (a esa hora no cabe hoy) |
| RS-21 | Motor: sala libre, 07:00–22:00 | `programar` [R25] |
| RS-22 | Motor: 21:45–22:00 | `negar` [R15] (menos de 30 minutos) |
| extraer | «por 5 horas», «hora y media», «3 horas y media», «media hora», «90 minutos»; «a las 3» y «3 de la tarde» sin duración | `duracion_min` correcto |

RS-04b (21:00–22:30) sigue negado por R15 (termina después de 22:00).

Correr y dejar en verde: `npm run typecheck`, `npm run pruebas`, `npm run matriz` (82 + nuevas, todas pasan).
Si cambia algo en `web/`: `npm --prefix web run lint` y `npm --prefix web run build`.

## 6. Documentación

- `docs/cambios-reservas.md`: nueva sección **7.0.12** (tabla cambio · motivo · archivo · prueba) con el antes y el después de R15.
- `README.md`: fila de R15 en la tabla de reglas y nota de reglas 2.1.0.
- No tocar el informe Word (se actualiza aparte: versión de reglas, R15, matriz y requisitos).

## 7. Entrega de Haiku

Al terminar, reportar: archivos cambiados, resultado literal de `npm run matriz` (total y nuevas), y la prueba
manual en el navegador del caso C-45 con el texto exacto de la respuesta.
