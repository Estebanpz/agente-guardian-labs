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
