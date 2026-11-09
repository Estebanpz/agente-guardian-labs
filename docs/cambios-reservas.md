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
