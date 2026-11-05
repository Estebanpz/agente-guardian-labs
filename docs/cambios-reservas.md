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
