# Auditoría de código — agente-guardian-labs

Fecha: 2026-11-16 · Alcance: agente (`agent/`), backend/API (`agent/channels/`, `agent/store/`), frontend (`web/src/`) y extracción (`agent/tools/`).
Referencia rápida: ~5.400 líneas de TypeScript en `agent/`, ~2.200 líneas de JS/JSX en `web/src`, 89 archivos fuente.

## Resumen

El proyecto está en muy buen estado general: validación con Zod en todos los bordes, transacciones Mongo con candados para las reservas, protecciones de privacidad y anti-elusión documentadas con sus hallazgos de fuzzing, y un frameworks propio de evals (regresión, propiedades, adversarial, mutación con Stryker). Los hallazgos de abajo se concentran en (1) dos funciones-monstruo en el núcleo de la conversación, (2) lógica duplicada que ya está divergiendo, y (3) tres bugs reales de parsing y rate-limiting.

---

## Hallazgos (ordenados por impacto/esfuerzo)

### 1. `aMin` propio de `motor.ts` acepta cualquier cadena y produce NaN (bug, severidad alta)

- **Dónde:** `agent/tools/motor.ts:13-16` y uso en `motor.ts:65,67`
- **Qué pasa:** `motor.ts` define su propio `aMin` en vez de importar el de `agent/tools/reloj.ts`. `hhmm.split(":").map(Number)` con una cadena malformada (`"7"`, `"7-30"`, `"830"`) produce `NaN`; `aMin(e.franja.split("–")[0])` solo parte por guion largo (`–`), así que una franja con guion normal (`-`) llega completa a `aMin` → `tarde` = `NaN > x` = `false`, y la decisión de asistencia (R11) sale `presente` en silencio.
- **Corrección propuesta:** importar `aMin` de `reloj.ts` (una sola implementación, ya probada) y validar el formato `HH:MM` lanzando un error claro cuando no cumpla.
- **Esfuerzo:** pequeño.

### 2. `reglas.json` se carga con `JSON.parse` sin protección al importar el módulo (bug, severidad alta)

- **Dónde:** `agent/tools/motor.ts:9-11` y `agent/tools/reservas.ts:11-20`
- **Qué pasa:** la lectura y el parse corren al momento del `import`, sin manejo de errores ni validación de esquema: un `reglas.json` ausente o con un campo mal escrito (p. ej. `parametros` sin `horario_abre`) derriba el proceso al arrancar con un error opaco, o produce fallos `undefined` profundos en plena decisión.
- **Corrección propuesta:** extraer un `cargarReglas()` único (con path, mensaje descriptivo y validación Zod de la estructura, igual que ya se hace con `Decision.parse`) y usarlo en los dos módulos.
- **Esfuerzo:** pequeño.

### 3. `turnoReserva` tiene ~325 líneas y gestiona ocho preocupaciones (complejidad, severidad alta)

- **Dónde:** `agent/conversacion.ts:770-1093`
- **Qué pasa:** una sola función maneja dos fechas en un mensaje, chips "Revisar mañana", respaldo del modelo, salas negadas, "cambiar campo", elección de sala, cantidades ambiguas e inválidas, registro en el flujo, confirmación de propuesta, estado del carné, validación temprana, aforo, `faltante`, reintentos y textos con prefijo. Es el mayor foco de riesgo de regresión del proyecto: casi todo cambio del plan (7.0.x) toca aquí.
- **Corrección propuesta:** extraer subfunciones con nombre por fase (p. ej. `interpretarNegaciones`, `procesarCambios`, `manejarCarné`, `manejarFaltante`) y dejar `turnoReserva` como orquestador de ~60 líneas. Los evals de regresión y las propiedades existentes sirven de red de seguridad.
- **Esfuerzo:** grande.

### 4. `mensajeBase` es una cadena de ~290 líneas con 15 salidas (complejidad, severidad alta)

- **Dónde:** `agent/orquestador.ts:353-638`
- **Qué pasa:** el enrutamiento (botones, mixto, cancelar a secas, ocupación privada, consultas, fuera de alcance, respaldo, aclaraciones) vive en un solo bloque con patrón repetido `const r = await …; registrar(…); return r;` unas 10 veces. El orden de los pasos es la lógica del negocio pero no está expresada como estructura.
- **Corrección propuesta:** extraer cada paso a funciones pequeñas (`pasoFlujoAbierto`, `pasoBotones`, `pasoModelo`…) que devuelvan `RespuestaChat | null`, y centralizar el par `registrar` + `return` en un solo helper.
- **Esfuerzo:** mediano.

### 5. El rate-limit de login se limpia de golpe y se agrupa por IP del proxy (bug, severidad media)

- **Dónde:** `agent/channels/http.ts:52-62`
- **Qué pasa:** dos problemas: (a) `if (intentosPorIp.size > 10_000) intentosPorIp.clear()` borra también los contadores de clientes legítimos en uso, anulando la protección en ese instante; (b) se usa `req.ip` sin configurar `app.set("trust proxy")` — detrás del proxy de Vite todas las peticiones comparten la misma IP, así que 20 logins por minuto _de todos los usuarios combinados_ disparan el 429 colectivo.
- **Corrección propuesta:** podar selectivamente las entradas vencidas (como ya hace `podar` en `acceso.ts:105-112`) en vez de `clear()`, y evaluar `trust proxy` / clave por token+IP.
- **Esfuerzo:** pequeño.

### 6. La lógica de "estado de sala / equipos inciertos" está copiada en cuatro sitios (duplicación, severidad media)

- **Dónde:** `agent/tools/reservas.ts:69-77` (`estadoSala`), `agent/conversacion.ts:210-216` (`cantidadInvalida`), `agent/conversacion.ts:1325-1331` (`estadoSalasDeBase`), `agent/channels/http.ts:233-234` (`enRevision`)
- **Qué pasa:** los criterios "operativo = disponible en inventario y mantenimiento", "incierto = desconocido o contradictorio" y "en revisión = no operativo" están re-implementados con pequeñas variaciones. Si la definición cambia (p. ej. "degradado" como nuevo estado), hay que recordar actualizar cuatro lugares.
- **Corrección propuesta:** exportar `estadoSala(sala, equipos)` desde `reservas.ts` (o un `tools/estados.ts`) y reusarlo en los otros tres sitios.
- **Esfuerzo:** pequeño.

### 7. `norm()` (minúsculas y sin tildes) redefinido en cuatro módulos (duplicación, severidad baja)

- **Dónde:** `agent/tools/extraer.ts:6`, `agent/conversacion.ts:26`, `agent/conversacion.ts:1347` (inline en `rutaPorFecha`), `agent/orquestador.ts:32` (`normO`)
- **Qué pasa:** tres variantes con el mismo propósito (`[̀-ͯ]` por rangos, `\u0300-\u036f`, `\p{Diacritic}`). Ya hay una divergencia sutil de estilo; un character class por rango Unicode literal es frágil.
- **Corrección propuesta:** una sola `norm` exportada desde `tools/extraer.ts` (o `reloj.ts`) con `\p{Diacritic}/gu`, e importarla en los demás.
- **Esfuerzo:** pequeño.

### 8. Diez rutas repiten el mismo `try/catch → console.error → 500` (duplicación, severidad baja)

- **Dónde:** `agent/channels/http.ts:65-302` (bloques idénticos en `/login`, `/salud`, `/evaluar`, `/mensaje`, `/disponibilidad`, `/reservas`, `/notificaciones`, `/salas`, `/reservas/dias`, `/reservas/:codigo`, `/notificaciones/:id`)
- **Qué pasa:** ~15 líneas repetidas; un manejo distinto en una ruta (ya ocurrió con el middleware de errores del final) genera respuestas inconsistentes.
- **Corrección propuesta:** un helper `asyncHandler(fn)` que capture, registre con el mismo formato `[http]` y devuelva `{ error: "Error interno" }`, envolviendo cada ruta.
- **Esfuerzo:** pequeño.

### 9. Casts a `Record<string, unknown>` desactivan el tipado en puntos sensibles (type_safety, severidad media)

- **Dónde:** `agent/conversacion.ts:842, 891-892, 1518`; `agent/channels/http.ts:314` (objeto de error sin tipo); `agent/store/mongo.ts:23` (`({ _id: id }) as never`)
- **Qué pasa:** `CAMBIABLES[cambiar[1]]` y las comparaciones de `cantidadInvalida`/`iniciar` acceden a los campos por `Record<string, unknown>`, así que un renombre de campo en `SolicitudReserva` compila sin avisar. El `as never` de Mongo desactiva el chequeo de toda la query.
- **Corrección propuesta:** usar claves tipadas (`keyof SolicitudReserva`) con un helper `limpiarCampo<K extends keyof SolicitudReserva>(…)`, y en Mongo un tipo `Filter<{ _id: string }>` declarado una vez.
- **Esfuerzo:** pequeño.

### 10. El frontend (`web/src`) es JS/JSX sin TypeScript ni chequeo de tipos (type_safety, severidad media)

- **Dónde:** `web/src/` (2.211 líneas: `api.js`, `main.jsx`, 25 componentes)
- **Qué pasa:** el backend es TS estricto con Zod, pero el frontend consume las respuestas de la API sin tipos: campos como `flujo.opciones`, `reserva.conflictos`, `identidad.programa` se leen con formas asumidas; un cambio en `RespuestaChat` (por ejemplo, renombrar `pendiente`) no lo detecta ninguna herramienta. El `verify` del proyecto (`npm run typecheck`) solo cubre `agent/`.
- **Corrección propuesta:** migrar a TSX con `strict`, tipar `api.js` con los mismos esquemas (`RespuestaChat` ya existe en `agent/tools/esquemas-reservas.ts` y puede compartirse), e incluir `web/` en el typecheck.
- **Esfuerzo:** mediano.

---

## Qué NO encontré (verificado)

- No hay fugas de carnés: `enmascarar` se aplica en todas las rutas de lectura (`/reservas`, `/notificaciones`, `/salas`, `/reservas/:codigo`) y `publica()` quita carne/materia de los conflictos.
- No hay inyección NoSQL/Mongo: todas las entradas pasan por esquemas Zod antes de tocar la base, incluidos los `req.params` y `req.query`.
- La confirmación de reserva es atómica y revalida R28 con _todas_ las reservas del día dentro de la transacción (`mongo.ts:121-152`), con candados por sala y por carné.
- Contraseñas con scrypt + comparación en tiempo constante + hash ficticio anti-enumeración + límites por correo y por IP (`acceso.ts`).
- Cobertura de evals inusualmente completa (regresión, propiedades con fast-check, adversarial, fuzz, mutación con Stryker).

## Orden sugerido de trabajo

1. Hallazgos 1, 2 y 5 (bugs pequeños y de alto valor, con evals que los cubren).
2. Hallazgos 6-8 (duplicaciones pequeñas, reducen el riesgo del paso 3).
3. Hallazgo 3 y 4 (refactor de las dos funciones grandes, con `npm run pruebas` y `npm run mutacion` como verificación).
4. Hallazgo 10 (TS en el frontend) como línea de trabajo aparte.
