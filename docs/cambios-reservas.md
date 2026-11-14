# Cambios de la Fase 5 (reservas por chat)

Para: Esteban Páez Leonel, para actualizar el informe y el guion de la demo.

## Renombre de la vista "Puerta" a "Laboratorios" (pedido del docente, 4-11-2026)

| Dónde | Antes | Después |
|---|---|---|
| Pestaña de la interfaz | Puerta | Laboratorios (la ruta sigue siendo `/`) |
| Título de la vista Monitor | Control en la puerta | Control de ingreso a los laboratorios |
| Selector del Chat | Puerta de | Laboratorio |
| Texto vacío del Chat | ¿En qué le ayudo en la puerta? | ¿En qué le ayudo en los laboratorios? |
| Endpoint | `GET /salas/puerta` | `GET /salas/laboratorios` |
| Captura del README | `docs/capturas/interfaz-puerta.png` | `docs/capturas/interfaz-laboratorios.png` |
| Diagrama de componentes (`Figura5_componentes_v2.puml`) | Vistas Puerta, Chat y Salas | Vistas Laboratorios, Chat y Salas |

Pendiente para Esteban:

- Regenerar `docs/diagramas_v2/Figura5_componentes_v2.png` con PlantUML. Hasta entonces, el PNG
  todavía dice "Puerta".
- Actualizar la Figura 11 del informe y los textos que dicen "vista Puerta".
- Actualizar el guion de la demo.

Sin cambios a propósito: la metáfora "única puerta al modelo" (`proveedor.ts`, `guia-ollama.md`) y el
historial de `evals/matriz.ts`, que registra lo que pasó.

## Reservas por chat

El agente ahora programa reservas simuladas. Antes respondía "no es mi función". Todas las reservas
quedan en la base de demostración (datos sintéticos); el prototipo no reserva salas reales.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| El chat atiende reservas por pasos: pregunta carné, fecha, horario, personas, equipos, alto cómputo y materia, y al final pide confirmación ("¿Confirmo?"). Incluye disponibilidad y registro "Soy nuevo". | Pedido del docente del curso (4-11-2026): que el agente atienda reservas desde el chat. | `agent/conversacion.ts`, `agent/orquestador.ts`, `agent/channels/http.ts` | `evals/conversacion.ts` (C-01 a C-09) y `evals/reservas.ts` |
| Reglas R14 a R26 en `reglas.json`, versión `2.0.0`. Cada regla tiene `fuente` y `vigente_desde`. R1 a R13 no cambian de comportamiento. | Requisitos del docente del curso (4-11-2026) y entrevista al monitor (27-10-2026). Algunas reglas son supuestos del equipo, marcados así en `reglas.json`. | `agent/rules/reglas.json` | `evals/reservas.ts` (RS-01 a RS-20) |
| Nueva fuente de datos: base de demostración con datos sintéticos en MongoDB Atlas, con respaldo en memoria (`REPOSITORIO=memoria`). Incluye 16 salas, equipos, carnetización simulada, usuarios y reservas. | Las reservas reales están prohibidas por la guía del taller (punto 15); la base de demostración evita reservas reales. | `agent/store/repositorio.ts`, `agent/store/mongo.ts`, `agent/store/memoria.ts`, `data/semilla.ts`, `scripts/seed.ts` | `evals/mongo.ts` (`npm run prueba:mongo`) |
| Límite de autoridad: el modelo nunca elige sala, horario ni confirma una reserva. El motor decide. El monitor sigue siendo quien decide el ingreso a los laboratorios. | Principio del agente: el motor decide, el modelo solo interpreta el texto. | `agent/conversacion.ts`, `agent/llm/interprete.ts` | `evals/conversacion.ts` y `evals/prueba-intencion.ts` |
| Extractores deterministas del chat (fecha, horario, sala, personas, equipos, carné), sin modelo. | Que los datos del chat no dependan del modelo de lenguaje. | `agent/tools/extraer.ts` | `evals/extraer.ts` |
| Privacidad: los carnés se permiten en el chat y se enmascaran en los logs y en las respuestas que muestran a otras personas (`C-****0002`). | Permitir que el estudiante escriba su carné sin exponerlo a otros ni en `logs/`. | `agent/tools/privacidad.ts`, `agent/orquestador.ts` | `evals/privacidad.ts` |
| Interfaz: vista Chat con tarjeta de reserva; vista Salas con 16 salas, línea de tiempo y pendientes del monitor. | Mostrar la reserva y su traza de reglas, y la ocupación de las salas. | `web/src/pages/Chat.jsx`, `web/src/pages/Salas.jsx`, `web/src/components/TarjetaReserva.jsx` | Revisión visual en escritorio y móvil; `npm --prefix web run lint` y `npm --prefix web run build` |
| Endpoints nuevos: `POST /mensaje` acepta `sesion`, `GET /disponibilidad`, `GET /reservas` y `GET /notificaciones`. `GET /salas` ahora devuelve 16 salas (antes 3). La vista Laboratorios usa `GET /salas/laboratorios`. | Soporte de la conversación y de la interfaz nueva. | `agent/channels/http.ts` | Revisión manual con `npm run app` |

## Para actualizar el informe

- Las tablas 1, 7, 13, 14 y 15 deben revisarse: el agente ahora programa reservas simuladas (antes
  decía que no era su función).
- Hay reglas R14 a R26 y una nueva fuente de datos: la base de demostración en MongoDB Atlas
  (datos sintéticos, con respaldo en memoria).
- El límite de autoridad cambió: el modelo no decide reservas; el motor decide, y el monitor
  sigue decidiendo el ingreso.
- Cifras de pruebas: ver el informe de pruebas.

## Cambio de R21: docente contra docente escala al monitor (4-11-2026)

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| R21 ya no escala a coordinación: escala al monitor, que lo remite a coordinación o a la Vicerrectoría académica si hace falta. La versión de las reglas sigue en 2.0.0. | Decisión del equipo del 4-11-2026, registrada en `conocimiento/hechos.json` (H04): el monitor es la primera instancia y el agente nunca escala directo a la Vicerrectoría. | `agent/rules/reglas.json` (efecto, descripción y fuente de R21), `agent/tools/reservas.ts` (notificar `["monitor"]`), `agent/conversacion.ts` (texto del chat: "Avisé al monitor, que lo remitirá a coordinación si hace falta"), `docs/plan/PLAN_RESERVAS.md` (sección 2) | RS-08 en `evals/escenarios-reservas.ts` (y su fila en la matriz) |

## Disponibilidad con criterios y contexto entre consultas (sección 7.0.3, 4-11-2026)

Motivo: en una prueba manual, la disponibilidad ignoró el horario, las personas y el alto cómputo, y la reserva
siguiente volvió a preguntar todo.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| `candidatas(s, c)` se extrae como función exportada y la usa `evaluarReserva`. Sin cambio de comportamiento. | Una sola regla para elegir sala, usada por la reserva y por la disponibilidad. | `agent/tools/reservas.ts` | RS-01 a RS-20 (sin cambios) |
| La disponibilidad aplica fecha, horario, personas, equipos y alto cómputo, y responde solo con las salas que cumplen. Muestra máximo 6; si hay más, lo dice. | Que la respuesta corresponda a lo que pidió la persona. | `agent/conversacion.ts` | C-10 y extractor "de 7PM - 9PM" / "7pm a 9pm" |
| Tras una disponibilidad se guarda el contexto (fecha, horario, personas, equipos, alto cómputo), 30 min, sin carné ni sala. Al empezar una reserva se reutiliza, y el mensaje nuevo gana. | Que la reserva siguiente no pida otra vez lo que ya se dijo. | `agent/conversacion.ts` | C-11, C-12 |
| El chip "Reservar Sala N" fija la sala y la respuesta empieza con «Tomo lo que me dijiste: …». | Confirmar lo tomado del contexto antes de seguir preguntando. | `agent/conversacion.ts` | C-11, C-12 |
| Los datos sueltos dentro de una reserva llenan los campos que faltan en un solo mensaje. | Evitar preguntas repetidas. | `agent/conversacion.ts` | C-13 |
| El contexto de disponibilidad no es un flujo abierto: el chip "Cancelar" no aparece después de una disponibilidad. | "Cancelar" solo cuando hay una reserva o un registro abierto. | `agent/conversacion.ts`, `web/src/pages/Chat.jsx` (sin cambio: ya usa `flujo.tipo`) | revisión manual de C-11 en la interfaz |

## Ocupación por día y varias fechas (sección 7.0.4, 4-11-2026)

Motivo: "Que salas tienes ocupadas el jueves y viernes?" se respondió con el estado de ahora.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| `fechas(t, hoy)` devuelve todas las fechas del texto, sin repetir, en orden y máximo 7. `fecha()` no cambia. | Poder preguntar por varios días en un mensaje. | `agent/tools/extraer.ts` | 4 casos de `fechas()` en `evals/extraer.ts` |
| `ocupacionTurno` lista por día las reservas programadas (sala, hora y si es de docente o estudiantes), sin carnés, y cuántas salas quedan libres. | Responder qué está ocupado, no solo los huecos libres. | `agent/conversacion.ts`, `agent/tools/reservas.ts` (`horarioLaboratorio`) | C-14, C-15 |
| Ruta antes del modelo: un texto con fecha sobre salas va a ocupación (si dice ocupadas/reservadas o trae dos fechas o más) o a disponibilidad (una fecha). Se aplica también si el modelo devuelve `consulta_salas`. | Que la fecha no se pierda aunque el modelo se equivoque o esté apagado. | `agent/orquestador.ts` | C-14, C-15 (sin modelo) |
| El estado de ahora termina con «Para otro día, pregunta por ejemplo: ¿qué salas están ocupadas el viernes?». | Indicar cómo preguntar por otra fecha. | `agent/conversacion.ts` | C-16 |

## Identidad por carné, sesión y saludo (sección 7.0.5, 8-11-2026)

Motivo: el chat necesitaba el carné en cada reserva y no saludaba ni recordaba a la persona. Plan: `docs/plan/PLAN_IDENTIDAD_SALUDO.md`.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| Toda conversación empieza con el carné (salvo datos prohibidos y la guardia). Sin carné, el texto se guarda y se continúa al identificarse. | Identificar a la persona antes de atender. | `agent/orquestador.ts`, `agent/sesion.ts` | C-01, C-06, C-10 a C-13, C-17, C-19, I-01 |
| Carné vigente: se guarda la sesión (colección `sesiones`, TTL 1800 s) y se saluda con plantilla (hora de Bogotá). Vencido: remite a carnetización, sin sesión. Desconocido: R17 como antes. | No pedir el carné en cada mensaje; saludo determinista. | `agent/orquestador.ts`, `agent/sesion.ts`, `agent/store/*.ts` | C-17, C-23, C-07, C-08 |
| Registro (R26): al identificar a un carné vigente sin registro se registra y se avisa. | Mantener el flujo de registro. | `agent/orquestador.ts` | C-03 |
| La reserva toma el carné de la sesión. Docentes eligen el espacio académico entre sus chips (número o nombre); estudiantes no. | Materia real de cada docente. | `agent/conversacion.ts` | C-18, C-24 |
| Jornada del estudiante (Mañana/Noche), solo informativa: va en el saludo y en la reserva. | Saludo y registro. | `agent/tools/esquemas-reservas.ts`, `agent/store/sembrar.ts`, `agent/conversacion.ts` | C-17 |
| Al terminar una reserva (programada o escalada) se añade el aviso de olvido y se borra la sesión. «salir» o «cerrar sesión» borran la sesión; «cancelar» no. | Privacidad: no se conserva el carné después de la solicitud. | `agent/conversacion.ts`, `agent/orquestador.ts` | C-20, C-22 |
| Horarios abiertos: «de 5:30 a 7:30» → 17:30–19:30; «8:30 a. m.», «8.30», «8h30», «y media», «y cuarto». | Aceptar formas habituales de escribir la hora. | `agent/tools/extraer.ts` | `evals/extraer.ts`, C-21 |
| Datos de carnetización: 12 estudiantes y 5 docentes con el catálogo de programas (`data/programas.ts`). | Semilla del plan de identidad. | `data/semilla.ts`, `data/programas.ts` | `evals/semilla.ts` |
| Interfaz: mensaje inicial con el chip «Soy nuevo» y botón «Cerrar sesión» (envía «salir»). | Empezar por el carné. | `web/src/pages/Chat.jsx` | revisión en el navegador (mensaje, chip y botón visibles; sin errores de consola) |
| Rutas rápidas: «ver disponibilidad» y «ver todas» van a disponibilidad. | Chips del saludo. | `agent/llm/interprete.ts` | C-04 |
| `npm run seed -- --reset --si` también borra `sesiones`. Prueba de MongoDB: sesión guardada, leída y borrada; índice TTL 1800 s. | Restaurar la demostración sin sesiones viejas. | `agent/store/sembrar.ts`, `evals/mongo.ts` | `npm run prueba:mongo` |
| Matriz: se añaden C-17 a C-24 e I-01; P-06, P-07 y S-02 corren con la sesión identificada. | Reflejar el carné primero. | `evals/matriz.ts`, `evals/escenarios-conversacion.ts` | `npm run matriz` (62/62) |

## Chat de reservas: oferta de mañana, validación temprana y sala ocupada (sección 7.0.6, 8-11-2026)

Motivo: en una prueba del 8-11-2026 a las 20:23, el chat heredó la fecha de hoy tras ofrecer revisar mañana, pidió
datos de una solicitud que ya no se podía y tardó sin decir nada. Esta sección junta las rondas de ajustes.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| Sin salas con 2 horas libres hoy, se ofrece revisar mañana con el chip «Sí, revisar mañana». La oferta queda en el contexto de la sesión. «Sí, quiero la sala 1» reserva mañana; nunca hereda la fecha de hoy. | Que la respuesta corresponda a lo pedido. | `agent/conversacion.ts` | C-27 |
| Una fecha de hoy no se hereda si el horario que quedaría ya pasó. | Evitar fechas vencidas. | `agent/conversacion.ts` | C-27, C-30 |
| Separadores «hasta la», «a la», «hasta las», «a las»: «de 11AM hasta la 1PM» y «de 11 a la 1» dan 11:00–13:00. | Frases habituales de horario. | `agent/tools/extraer.ts` | `evals/extraer.ts`, C-28, C-35 |
| Validación temprana: con fecha y horario se evalúa R15 antes de pedir personas, equipos, cómputo o materia. Si nombró una sala, se revisa si está libre (choques en la base). Libre: «Revisé la Sala 1 para el martes 10 de noviembre de 11:00 a 13:00 y está libre ✅. Ahora, ¿cuántas personas son?». | Avisar al momento, no después de cuatro preguntas. | `agent/conversacion.ts` | C-31, C-35 |
| Sala ocupada (R20, R21 o R22): aviso en ese mismo turno con quién la tiene (estudiantes u otro docente, carné enmascarado, sin nombres) y los chips «Ver otras salas» y «Escalar al monitor». | No seguir pidiendo datos de una solicitud que no se puede. | `agent/conversacion.ts` | C-02, C-29, C-34 |
| «Ver otras salas»: hasta 3 salas libres a esa hora como chips «Usar Sala N»; la solicitud sigue. | Alternativa concreta. | `agent/conversacion.ts` | C-32 |
| «Escalar al monitor»: no pide más datos ni crea reserva. Crea un aviso al monitor con `reserva_codigo: null` (R20 o R21 si el solicitante es docente según el choque; R22 si es estudiante), con sala, fecha, horario y carné enmascarado. Cierra la conversación, borra la sesión y responde «Listo, {Nombres}: le pasé tu caso al monitor…». | El monitor confirma con la persona; el motor sigue sin crear reservas escaladas desde el chat en este caso. | `agent/conversacion.ts` | C-02, C-33 |
| Causa concreta de R15: «Ese horario de hoy ya pasó (son las HH:MM)»; fuera de 07:00–22:00; menos de 30 minutos o más de 4 horas; fecha a más de 30 días. La comprobación es la misma de la regla (`causaR15`). | Decir qué cambiar. | `agent/tools/reservas.ts`, `agent/conversacion.ts` | C-30 y `evals/reservas.ts` (RS-01 a RS-20 sin cambios) |
| Indicador de espera en el chat: «Un momento, estoy revisando la disponibilidad…» si el mensaje nombra una sala o un horario; «Estoy trabajando en tu solicitud…» en los demás casos. | No dejar silencio mientras responde. | `web/src/pages/Chat.jsx` | revisión de lint y build |
| Etiqueta de la base: la API informa `base` (local, atlas, remota o memoria) sin la URI. La interfaz muestra «MongoDB local», «MongoDB Atlas», «MongoDB remoto» o «Memoria». | Que la etiqueta diga dónde están los datos. | `agent/store/repositorio.ts` (`tipoDeBase`), `agent/channels/http.ts`, `web/src/App.jsx` | revisión de `tipoDeBase` con URIs de ejemplo |
| Chat: se quita el selector «Laboratorio»; `api.mensaje` ya no envía `laboratorio`. El campo sigue opcional en la API y en el orquestador (la pestaña Laboratorios y las pruebas lo usan). | La sala la dice el mensaje. | `web/src/pages/Chat.jsx`, `web/src/api.js` | C-34 a C-36 |
| Chat: subtítulo «Escribe en lenguaje natural. Empieza con tu carné (C- o D- y 8 dígitos).»; sugerencias nuevas en orden; panel «Cómo funciona» de 7 pasos. | Empezar por el carné y reflejar el flujo real. | `web/src/pages/Chat.jsx` | C-34 a C-36 |
| Ruta rápida «quiero/necesito la sala…» → solicitud de reserva, sin depender del modelo. | «Quiero la sala 1 mañana…» no debe depender del modelo. | `agent/llm/interprete.ts` | C-35 |
| «salir» cancela una reserva solo como mensaje completo, igual que cierra la sesión. | «hasta salir de clase» no debe cancelar. | `agent/tools/extraer.ts` (`cancelar`) | C-25 |

## Sala antes que horario y respaldo del modelo (sección 7.0.8, 8-11-2026)

- Orden de extracción: carné → fecha → sala → horario → números. El número de la sala ya no se lee como hora
  ("la sala 1 mañana a la 1PM hasta las 3PM" → Sala 1, 13:00–15:00).
- Separadores "a la(s)", "hasta la(s)", "desde la(s)", "de la(s)"; am/pm de la hora final aplicado a la inicial si el rango es válido.
- Respaldo con el modelo (`agent/llm/respaldo.ts`): solo cuando el código no entiende la sala o el horario. El modelo
  devuelve sala, día y horas con esquema Zod; el código calcula la fecha, valida cada dato y descarta lo que no esté en
  el texto. Antes de usarlo se confirma con la persona ("Entendí: … ¿Es correcto?"). Pruebas C-37 a C-39.

## Recorrido del chat corregido (sección 7.0.9, 8-11-2026)

Fallos vistos en el navegador y su corrección:

| Fallo | Corrección | Prueba |
|---|---|---|
| Tras recargar la página, el carné no saludaba y seguía una reserva vieja | Cada carga de la página abre una sesión nueva; un carné escrito con la sesión ya identificada vuelve a saludar y cierra el flujo anterior | C-40 |
| "Ver otras salas" ofrecía salas sin saber cuántas personas eran, y la elegida terminaba en R18 | Si faltan las personas, se preguntan primero; se ofrecen solo salas que alcanzan, con puestos y equipos operativos | C-41, C-32 |
| "quiero la 4" no elegía sala | Con salas en oferta se acepta "13", "la 13", "quiero la 13" o "sala 13"; un número solo cuando se piden personas sigue siendo la cantidad | C-42 |
| R18 al final, con mensaje genérico y pidiendo otro horario | Aforo temprano: con sala y personas se revisa el aforo antes de pedir más datos; el mensaje da la cifra y conserva el horario | C-43 |
| "de 2 a 4 pm en la sala 6 mañana" se tomaba como consulta de disponibilidad | Sala + rango de horas sin pregunta es una reserva | C-44 |
| El indicador de espera casi no se veía | Se muestra al menos 600 ms | — |
| Texto de fuera de alcance hablaba solo de ingreso | "Te ayudo con reservas, disponibilidad y ocupación de las salas de sistemas." | — |

C-18 y C-32 cambiaron de la Sala 13 (10 puestos) a la Sala 8 (20 puestos): con el aforo temprano, 20 estudiantes ya no
caben en la 13.

## Vista Salas del monitor (sección 7.0.10, 8-11-2026)

Motivo: el monitor necesitaba ver el estado de las 16 salas, la agenda del día, los equipos y los avisos en una sola
pantalla, con la variante A aprobada (`docs/plan/PLAN_VISTA_MONITOR.md`, `docs/plan/diseno-salas/variante-a.dc.html`).

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| `GET /salas?fecha=` devuelve equipos, equipos en revisión y reservas del día (programadas y escaladas) con carné enmascarado y perfil del solicitante (sin carné). | Una sola llamada para la tabla y el detalle. | `agent/channels/http.ts`, `agent/tools/monitor.ts` | `evals/api-monitor.ts` |
| `GET /reservas/dias?mes=` y `GET /reservas/:codigo` (detalle con solicitante y carné enmascarado). | Calendario y detalle de una reserva. | `agent/channels/http.ts`, `agent/store/*.ts` | `evals/api-monitor.ts` |
| `PATCH /notificaciones/:id` con `{ estado: "atendida" }` (solo ese cambio). Los avisos llevan `_id`, sala, fecha, horario, carné y hora de atención. | Marcar un aviso atendido desde el panel. | `agent/channels/http.ts`, `agent/store/*.ts`, `agent/conversacion.ts` | `evals/api-monitor.ts`, `evals/mongo.ts` |
| Semilla: materias de RS-0002 ("Bases de Datos") y RS-0003 ("Redes de Computadores"), que sí son espacios académicos de sus docentes. | Coherencia de la semilla. | `data/semilla.ts` | `evals/semilla.ts` |
| Validador de `notificaciones` admite `carne` y `atendida_en`. | Esquema de los avisos. | `agent/store/sembrar.ts` | `npm run prueba:mongo` |
| Servidor separado de las rutas: `agent/channels/servir.ts` arranca la API; `http.ts` exporta la aplicación para probarla sin abrir el puerto. | Pruebas de la API sin puerto. | `agent/channels/servir.ts`, `package.json` (`serve`) | `evals/api-monitor.ts` |
| Ayuda del chat: describe reservas, disponibilidad, ocupación, saludo con carné y avisos al monitor. | Texto acorde al chat actual. | `agent/tools/ayuda.ts` | `evals/ayuda.ts` |
| Interfaz: barra lateral compartida (Laboratorios, Chat, Salas), en la variante A; indicadores con gráficas, filtros con la URL como estado, línea de tiempo 07–22, detalle en panel lateral y avisos. Calendario con `@daypicker/react` 10.0.2 en español. | Vista del monitor. | `web/src/App.jsx`, `web/src/pages/Salas.jsx`, `web/src/pages/salas/*`, `web/src/components/salas/*`, `web/src/styles/salas.css` | revisión en el navegador (1440 px y 375 px) |

## Chat en la variante Clara (sección 7.0.11, 9-11-2026)

Motivo: la variante Clara de Stitch (`docs/plan/diseno-chat/variante-1.html`) fue la elegida para la pantalla del chat.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| La respuesta de identificación trae `identidad` (nombres, apellidos, rol, programa y carné enmascarado) para el saludo grande. | El saludo necesita el nombre tras validar el carné; nunca sale el carné completo. | `agent/conversacion.ts`, `agent/orquestador.ts` | C-17 |
| Pantalla: historial del día (solo la conversación actual), saludo con nombre y apellido, cuatro accesos rápidos, burbujas, insignia de intención, chips con punto, entrada en píldora con botón redondo. Sin texto inventado de la maqueta (sin «Reserva Segura», «Validado» ni historial de ejemplo). | Diseño aprobado con datos reales. | `web/src/pages/Chat.jsx`, `web/src/styles/chat.css` | revisión en el navegador (1440 px y 375 px sin desbordamiento) |
| «Mis reservas» aparece deshabilitado con «Próximamente». | La función no existe todavía. | `web/src/pages/Chat.jsx` | — |
| «Ejemplos para probar» y «Cómo funciona» quedan plegados en la columna de historial. | Conservar la guía sin ocupar la pantalla. | `web/src/pages/Chat.jsx` | — |

## Rangos de horario personalizados y R15 sin tope de duración (sección 7.0.12, 12-11-2026)

Motivo: el chat rechazaba como «más de 4 horas» una reserva de 10:00 a 15:00 pedida por un docente. El tope de 4 h
era un supuesto del equipo, no una decisión de la entrevista al monitor, y las sugerencias de horario eran fijas
(«08:00 a 10:00», «14:00 a 16:00») y de 2 h.

**Antes:** R15 negaba cualquier reserva de más de 4 horas («duracion_max_min»: 240); reglas 2.0.0; la pregunta de
horario ofrecía los chips fijos de 2 h y el ejemplo «de 13:00 a 15:00»; la disponibilidad sin criterios buscaba
huecos de 2 h; la oferta de otro día era solo «mañana».

**Después:** R15 sin tope (cualquier rango de 07:00 a 22:00, mínimo 30 minutos, hasta 30 días); reglas 2.1.0; la
pregunta no trae chips y pide el rango; si R15 falla por el horario, el chip es el ajuste mínimo del rango que
escribió la persona; la disponibilidad busca huecos continuos de la duración pedida y, si el día no tiene salas,
ofrece el día más cercano con los mismos criterios.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| `reglas.json` 2.1.0: `duracion_max_min: null`; R15 con descripción, fuente y `vigente_desde` 2026-11-12. | Quitar el tope de 4 h, que era un supuesto. | `agent/rules/reglas.json` | RS-21, RS-22 |
| `causaR15` salta el tope cuando es `null`; la versión sale de `reglas.json` (sin «2.0.0» fijo en el código ni en las pruebas). | Versión única y tope configurable. | `agent/tools/reservas.ts`, `agent/conversacion.ts`, `evals/escenarios-reservas.ts`, `evals/mongo.ts` | `evals/reservas.ts`, `evals/conversacion.ts` |
| Chips del ajuste mínimo cuando R15 falla por el horario: `07:00 a …`, `… a 22:00`, `07:00 a 22:00`, `… a …` con 30 min, `… a` con la tarde, o «Revisar mañana» si hoy ya no cabe. | Decir qué cambiar sin pedir todo otra vez. | `agent/conversacion.ts` (`chipsHorarioR15`) | C-30, C-46 |
| La pregunta de horario no trae chips fijos; con solo la hora de inicio pide la final. | Que la persona escriba su rango. | `agent/conversacion.ts` (`preguntaPara`) | C-45 |
| Extractor `duracion_min`: «por 5 horas», «hora y media», «3 horas y media», «media hora», «90 minutos», «5 h»; no cuenta «a las 3» ni «3 de la tarde». | Duración pedida sin rango. | `agent/tools/extraer.ts` | `evals/extraer.ts` |
| Disponibilidad por duración N (rango, o duración pedida, o 30 min): huecos continuos de N; «Salas con 5 horas libres seguidas …». | Responder a lo que se pidió. | `agent/conversacion.ts` (`disponibilidadTurno`, `salasQueCumplen`) | C-04, C-47 |
| Día más cercano (hasta 30 días) cuando el día no tiene salas; `oferta_manana` pasa a `oferta_dia`, con la fecha ofrecida y la duración guardadas (`duracion_min` en la conversación). | Ofrecer otro día sin perder los criterios. | `agent/conversacion.ts`, `agent/tools/esquemas-reservas.ts`, `agent/store/mongo.ts` | C-27, C-48 |
| R24 (ninguna sala en ese horario): ofrece el día más cercano con el mismo rango y personas, como chip «Revisar el …». | Plan, 4. | `agent/conversacion.ts` (`responder`) | — (sin fila nueva) |
| Chips «Revisar mañana» y «Revisar el {día}» cambian la fecha y conservan el horario pedido. | El horario que ya escribió la persona no se vuelve a pedir. | `agent/conversacion.ts` (`turnoReserva`) | C-30, C-48 |
| Pruebas nuevas: C-45 (10AM a 3 de la tarde, sin R15), C-46 (8 PM a 11 PM con chip «20:00 a 22:00»), C-47 (5 horas libres), C-48 (día más cercano con choques creados en la prueba), RS-21 (jornada completa), RS-22 (menos de 30 minutos). C-04 y C-27 se ajustaron a la nueva duración por defecto (30 min) y a la pregunta «2 horas». | Cubrir las reglas nuevas. | `evals/escenarios-conversacion.ts`, `evals/escenarios-reservas.ts`, `evals/extraer.ts` | `npm run pruebas`, `npm run matriz` (88/88) |

Prueba manual en el navegador (C-45): D-20000001 → «Quiero una sala para 25 estudiantes el 14 de noviembre de 10AM
hasta las 3 de la tarde». Respuesta: «¿Cuántos computadores necesita?» con el chip «El mismo número de estudiantes».
Ya no aparece «La reserva dura más de 4 horas».

RS-04b (21:00–22:30) sigue negado: termina después de las 22:00.

## El modelo interpreta todo el texto libre (sección 7.0.13, 13-11-2026)

Motivo: «Quiero reservar un almuerzo» abría una reserva de sala. Una lista de palabras clave (`rutaRapida`) decidía la
intención antes del modelo: cualquier «reservar», «separar», «apartar», «agendar» o «programar» iba al flujo de salas.
El agente respondía con un diccionario en lugar de interpretar. Las pruebas solo tenían frases del dominio.

**Principio:** el modelo interpreta, el código valida y el motor decide.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| Sale `rutaRapida`. Solo los botones de la interfaz (texto fijo: «Quiero reservar una sala», «Ver disponibilidad», «Soy nuevo», «Estado de salas») se atienden sin modelo (`rutaDeBoton`). Todo texto libre lo interpreta el modelo. Siguen sin modelo, por seguridad, los datos prohibidos y la guardia. | Que el agente piense qué se pide. | `agent/llm/interprete.ts`, `agent/orquestador.ts` | C-49 a C-53 |
| La interpretación trae `recurso` («sala», «otro» o null) y `recurso_texto` (las palabras que nombran lo que quiere reservar). El prompt dice qué hace el asistente y que reservar otra cosa es fuera de alcance; ejemplos guía nuevos (almuerzo, cancha, «necesito reservar» a secas, frase sin verbo, horas libres). | Distinguir una sala de un almuerzo. | `agent/llm/interprete.ts` | `evals/prueba-intencion.ts` (con Ollama) |
| `recurso` «otro»: «No puedo reservar un almuerzo: solo reservo salas de los laboratorios de sistemas. ¿Necesitas una sala?» con el chip «Reservar una sala». `recurso_texto` solo se repite si sus palabras están en el mensaje. | Responder lo que se pidió sin repetir lo que el modelo invente. | `agent/orquestador.ts` (`textoFuera`, `recursoVerificado`) | C-49, C-50 |
| «Quiero reservar» sin decir qué ni traer datos de una sala: «¿Qué quieres reservar? Solo reservo salas de los laboratorios de sistemas.» | No suponer. | `agent/orquestador.ts` (`traeDatosDeSala`) | C-51 |
| Dentro de una reserva, un mensaje de 3 palabras o más, sin números y sin ningún dato para la pregunta pendiente, lo interpreta el modelo. Si está fuera de alcance se responde y se retoma la pregunta («Sigamos con tu solicitud»). | Que un desvío no se tome como dato de la reserva. | `agent/orquestador.ts` (`desvioDelFlujo`) | C-52 |
| Las preguntas por fecha («¿qué salas están ocupadas el jueves?») se responden después de que el modelo dice que es una consulta, ya no antes. | La fecha sola no define la intención. | `agent/orquestador.ts` | C-14 a C-16 |
| Modelo sin respuesta: aviso y botones («Reservar una sala», «Ver disponibilidad», «Estado de salas»), que funcionan sin el modelo. | No dejar a la persona sin salida. | `agent/orquestador.ts` | C-53 |
| Tiempo de espera del modelo configurable: `MODELO_TIEMPO_MS` (120 000 ms por defecto) para Ollama y el Gateway. La interfaz avisa a los 8 s que sigue pensando. | Cada mensaje pasa por el modelo; con CPU puede tardar decenas de segundos. | `agent/llm/proveedor.ts`, `.env.example`, `web/src/pages/Chat.jsx` | revisión manual |
| Pruebas del flujo con un **modelo simulado** (`evals/modelo-simulado.ts`) para que sigan siendo deterministas; la calidad del modelo real se mide en `evals/prueba-intencion.ts` con 6 frases nuevas (4 reservas que no son salas y 2 reservas de sala). C-05, C-06, C-13 y C-22 empiezan ahora con el botón «Quiero reservar una sala». | Separar el flujo (determinista) de la interpretación (modelo). | `evals/modelo-simulado.ts`, `evals/escenarios-conversacion.ts`, `evals/prueba-intencion.ts` | `npm run pruebas`, `npm run matriz` |

## Cancelar una reserva propia (R27) y sin datos de otras personas en el chat (sección 7.0.14, 14-11-2026)

Motivo: al decir que una sala estaba ocupada, el chat mostraba el carné (enmascarado) de quien la tenía; y no había
forma de cancelar una reserva desde el chat.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| El aviso de sala ocupada y los textos de R20/R21 dicen solo «un grupo de estudiantes» u «otro docente», sin carné. La tarjeta de la reserva muestra los choques sin código, carné ni materia; la API del chat (`publica`) ya no los envía. El monitor sigue viéndolos en su vista y en los avisos. | Minimización: los datos de otra persona no salen del servidor hacia quien consulta. | `agent/conversacion.ts`, `web/src/components/TarjetaReserva.jsx` | C-02, C-58 |
| Regla **R27** (`reglas.json` 2.2.0): cancelar desde el chat solo si la reserva está programada, aún no empieza y su carné es el de la sesión (estudiante o docente titular). Si no es suya o no existe, la respuesta es la misma, para no revelar reservas ajenas. | Pedido de Esteban (14-11-2026). | `agent/rules/reglas.json`, `agent/tools/reservas.ts` (`evaluarCancelacion`) | RS-23 a RS-26 |
| Intención `cancelar_reserva` en el intérprete. Sin estado: se ubica la reserva propia por código, día o sala; los chips llevan el código («Sí, cancelar RS-…», «No, conservar RS-…») y al confirmar se vuelve a comprobar R27. La escritura es condicional (código + carné + programada): `estado: "cancelada"` y `cancelada_en`. La sala queda libre. | Cancelar sin que otra persona pueda forzarlo escribiendo el botón. | `agent/llm/interprete.ts`, `agent/orquestador.ts`, `agent/conversacion.ts` (`cancelacionTurno`), `agent/store/*.ts`, `agent/tools/esquemas-reservas.ts`, `agent/store/sembrar.ts` | C-54 a C-57 |

## El modelo lee primero, también sin carné (sección 7.0.15, 14-11-2026)

Motivo: «Necesito plantar un árbol» respondía «escríbeme tu carné». El agente pedía el carné antes de leer el mensaje,
así que no negaba lo que no es de sus funciones. El docente espera que lo fuera de alcance se niegue de una vez.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| Sin carné, el modelo interpreta el mensaje antes de pedirlo. Fuera de alcance (o reservar algo que no es una sala): se niega sin pedir el carné y sin guardar el texto. Ayuda: se responde y al final se pide el carné. Elusión: alerta y carné. Una petición del dominio (reserva, disponibilidad, ocupación, cancelación, registro): se pide el carné y se continúa al identificarse. Botones y saludos siguen sin modelo. Si el modelo no responde, se pide el carné como antes. | Negar lo que no es función del agente desde el primer mensaje. | `agent/orquestador.ts` (`sinIdentidad`) | C-59 a C-62; `evals/prueba-intencion.ts` (2 frases) |

Costo: una petición del dominio escrita antes del carné pasa dos veces por el modelo (al llegar y al continuarla).

## Escritura informal y faltas de ortografía (sección 7.0.16, 14-11-2026)

Motivo: «Khe puedes hazer?» se marcó como intento de eludir reglas. El modelo de 3B no entendió la frase mal escrita y
la guardia por patrones no tenía nada que ver.

| cambio | motivo | archivo | prueba |
|---|---|---|---|
| El prompt del intérprete pide corregir mentalmente faltas, abreviaturas y escritura informal («khe», «hazer», «kiero», «resevar», «sla», «mñana», «xq», «ay», «oy») y clasificar por lo que la persona quiso decir. Dice que una falta de ortografía nunca es elusión y que la elusión requiere una petición explícita. Cinco ejemplos guía nuevos escritos con faltas. | Entender como lo haría un monitor. | `agent/llm/interprete.ts` | `evals/prueba-intencion.ts` (3 frases nuevas, con Ollama) |
| El código valida la elusión del modelo (`validarElusion`): sin ninguna señal en el texto (reglas, instrucciones, prompt, autorización, permiso, ignorar, olvidar, desactivar, coordinador, profesor…), se trata como ayuda. La guardia por patrones no cambia. | Que un error del modelo no acuse a un estudiante. | `agent/llm/interprete.ts`, `agent/orquestador.ts` (`clasificar`) | C-63 |

Límite: los extractores de fecha y hora (código) no corrigen faltas como «mñana» o «juebes»; esos datos los pide de
nuevo el flujo, o los propone el respaldo del modelo con confirmación (7.0.8).

## Prompt del intérprete con reglas explícitas y correcciones del informe adversarial (sección 7.0.17, 14-11-2026)

| Cambio | Por qué | Archivos | Prueba |
|---|---|---|---|
| El prompt del intérprete se reescribió por secciones: IDIOMA (entrada y salida en español), ALCANCE (las cuatro funciones), CÓMO LEER EL MENSAJE (entender primero, decidir por el significado de la frase y no por palabras sueltas, corregir faltas), REGLAS PARA PEDIDOS DE RESERVA, INTENCIONES, CAMPOS y SEGURIDAD. Las reglas de reserva dicen que decide lo que se reserva y no el verbo: sala → solicitud_reserva; otra cosa → fuera_de_alcance con recurso "otro"; "quiero reservar" sin objeto → solicitud_reserva con recurso null (el asistente pregunta qué); datos sin verbo → reserva de sala; cancelar otra cosa → fuera_de_alcance. Los ejemplos guía se conservan, incluidos los cinco escritos con faltas, como ilustración del razonamiento. | Que el modelo tenga instrucciones claras para los casos de "Quiero reservar" en vez de depender de los ejemplos. | `agent/llm/interprete.ts` | `evals/prueba-intencion.ts` (con Ollama) |
| ADV-04: filtro de datos prohibidos tolerante a separadores, ofuscación y dígitos en letras, sin bloquear fechas, horas, carnés ni códigos RS. | Una cédula con puntos llegaba a la traza. | `agent/tools/privacidad.ts` | `evals/privacidad.ts` (15 casos nuevos), P-07, P-08 |
| ADV-07: fechas imposibles se descartan. | "31 de febrero" se guardaba como 2026-02-31. | `agent/tools/extraer.ts` | `evals/extraer.ts` (4 casos) |
| ADV-08: código de reserva tolerante. | "RS 0001" o "RS-00001" no se reconocían. | `agent/conversacion.ts` (`codigoDe`, `esBotonCancelacion`) | CA-04 |
| ADV-09: aviso de sala inexistente. | "sala 99" se ignoraba en silencio. | `agent/tools/extraer.ts` (`salaInexistente`), `agent/orquestador.ts` | `evals/extraer.ts` (6 casos) |

Pendiente: ADV-03, ADV-05 y ADV-06 (identidad y endpoints sin autorización) se resuelven con el inicio de sesión por rol.

## Inicio de sesión por rol: estudiante, docente y monitor (sección 7.0.18, 14-11-2026)

Motivo: el informe adversarial mostró que bastaba escribir un carné para actuar como otra persona (ADV-03) y que la
API del monitor no tenía autorización (ADV-05, ADV-06). Pedido de Esteban: separar la lógica por rol con un login.

| Cambio | Por qué | Archivos | Prueba |
|---|---|---|---|
| Cuentas sintéticas con correo `.test` ligadas a los carnés de la semilla, más un monitor sin carné. Solo se guarda el hash `scrypt` con sal. Colección `cuentas` con su esquema. | Credencial distinta del carné, que es secuencial y público. | `data/semilla.ts`, `agent/tools/esquemas-reservas.ts`, `agent/store/*` | `evals/acceso.ts` |
| `POST /login`, `POST /logout` y `GET /yo`. Token HMAC-SHA256 de 8 horas con revocación al cerrar sesión; 5 intentos fallidos bloquean el correo 5 minutos; mismo mensaje para correo inexistente y clave errada. Carné vencido (R16) o desconocido (R17, con aviso) no entra; el primer ingreso registra (R26). | Autenticación y defensa básica contra fuerza bruta y enumeración. | `agent/tools/acceso.ts`, `agent/channels/http.ts` | `evals/acceso.ts` (50 comprobaciones) |
| Rutas del monitor con `exigir("monitor")`: 401 sin sesión y 403 con otro rol. `/disponibilidad`, `/salud` y `/mensaje` siguen públicas. | ADV-05 y ADV-06. | `agent/channels/http.ts` | `evals/acceso.ts`, `evals/api-monitor.ts`, `evals/adversarial/api.ts` |
| El chat toma la identidad del token (`autenticado`). Sin sesión, solo informa (disponibilidad, ocupación, estado y ayuda) y pide iniciar sesión para reservar, cancelar o registrarse. Con sesión, el carné de otra persona se rechaza y el propio sobra. Al terminar una reserva la sesión sigue. | ADV-03: nadie actúa con un carné que no es el suyo. | `agent/orquestador.ts` (`mensaje`, `modoPublico`) | `evals/acceso.ts`, CA-03, P-06 |
| Interfaz: página `/ingresar`, sesión en `localStorage` (`guardian.sesion`, se borra al cerrar sesión o si el token vence), Laboratorios y Salas solo para el monitor, usuario y «Cerrar sesión» en la barra lateral, saludo del chat con el nombre de la sesión. | Separar la experiencia por rol. | `web/src/sesion.js`, `web/src/api.js`, `web/src/components/SesionContexto.jsx`, `SoloRol.jsx`, `NavegacionLateral.jsx`, `web/src/pages/Ingresar.jsx`, `Chat.jsx`, `web/src/App.jsx`, `web/src/styles/login.css` | Revisión visual (escritorio y móvil) |

Las pruebas de flujo (`evals/conversacion.ts`) y la consola siguen usando la identidad por carné escrito: `mensaje()` sin
`autenticado` conserva ese modo. La API siempre envía `autenticado`. Cuentas y contraseñas: `docs/cuentas-de-prueba.md`.

## Mis reservas desde el chat (sección 7.0.19, 14-11-2026)

Motivo: para cancelar había que saber el código RS de memoria; el botón «Mis reservas» estaba deshabilitado.

| Cambio | Por qué | Archivos | Prueba |
|---|---|---|---|
| Intención nueva `mis_reservas` (el modelo la reconoce: «quiero ver mis reservas», «qué reservas tengo») y botón «Mis reservas» (texto fijo, sin modelo). Lista las reservas programadas del carné de la sesión desde hoy, marca las que ya empezaron y ofrece «Cancelar RS-…» para las que aún se pueden cancelar (R27). Sin sesión pide iniciar sesión. | Ver y cancelar las reservas propias sin recordar el código. | `agent/llm/interprete.ts`, `agent/conversacion.ts` (`misReservasTurno`), `agent/orquestador.ts`, `web/src/pages/Chat.jsx` | `evals/acceso.ts` (4 comprobaciones), `evals/prueba-intencion.ts` (2 frases, con Ollama) |

