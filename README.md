# Guardian Labs: agente lógico local para el ingreso a los laboratorios

Prototipo académico del curso **Inteligencia Artificial** (Ingeniería de Sistemas, UniEspinal, 2026B), Fase 2 del
*Taller-proyecto de agente lógico local*. El agente ayuda al **monitor** de los laboratorios de sistemas a decidir si
una persona puede ingresar, qué equipo usar y cómo registrar su asistencia.

**Autores:** Kevin Alexis Ayala Rodriguez y Esteban Páez Leonel.

> **Uso académico.** Todos los datos (personas, salas, equipos) son **sintéticos**. El agente entrega
> **recomendaciones**; la decisión final siempre es del monitor. No se debe usar con datos reales.

## Principio de diseño

| Componente | Archivo | Responsabilidad | No hace |
|---|---|---|---|
| Interfaz | `web/` | Recibe el caso, muestra decisión, explicación, reglas, versión y traza | Presentar la recomendación como decisión oficial |
| Canal HTTP | `agent/channels/http.ts` | Expone la API en `127.0.0.1` y valida la entrada | Aceptar entradas sin validar |
| Orquestador | `agent/orquestador.ts` | Filtra datos prohibidos, llama al modelo, **verifica** sus datos, llama al motor, registra | Dejar que el modelo decida |
| Modelo local (Ollama) | `agent/llm/` | Interpreta la intención, propone datos y redacta la explicación | Decidir, inventar reglas o datos |
| Herramienta lógica | `agent/tools/motor.ts` | Aplica R1–R13 por prioridad y especificidad, trata desconocidos y contradicciones | Delegar el resultado al texto del modelo |
| Base de conocimiento | `agent/rules/reglas.json`, `data/` | Reglas versionadas y hechos sintéticos | Mezclar datos reales |
| Registro y pruebas | `logs/`, `evals/` | Guarda entrada, versión, decisión y traza; pruebas automáticas | Guardar datos personales |

La misma entrada con la misma versión de reglas produce siempre la misma decisión: el motor es determinista y el
modelo solo redacta.

## Requisitos

| Herramienta | Versión probada | Nota |
|---|---|---|
| Node.js | 24.x | `.nvmrc` fija la versión (`nvm use`) |
| Ollama | 0.34.2 | <https://ollama.com/download> |
| Modelo | `llama3.2:3b` (~2 GB) | Ver la justificación en la guía de Ollama del informe |
| Navegador | Cualquiera reciente | Para la interfaz |

## Instalación

```sh
git clone <url-del-repositorio> agente-guardian-labs
cd agente-guardian-labs
nvm use                      # Node 24
npm install                  # dependencias del agente
npm --prefix web install     # dependencias de la interfaz
ollama pull llama3.2:3b      # modelo local
cp .env.example .env         # configuración (por defecto: Ollama)
```

Verificar Ollama: `ollama run llama3.2:3b "Hola"` debe responder en pocos segundos.

## Uso

```sh
npm run app
```

Arranca la API (`http://127.0.0.1:3000`) y la interfaz (`http://localhost:5173`) en una sola terminal.
`Ctrl+C` detiene ambas.

| Vista | Para qué |
|---|---|
| **Puerta** | Formulario de solicitud y casos de demostración (normal, desconocido, contradicción, combinado) |
| **Chat** | Texto libre del monitor (incluye fuera de alcance, intento de eludir reglas y datos prohibidos) |
| **Salas** | Aforo y estado de los equipos según inventario y mantenimiento |

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run app` | API + interfaz |
| `npm run serve` | Solo la API |
| `npm run dev -- E-006` | Evalúa un caso por consola |
| `npm run dev -- "Soy E-001, sala 1, ¿puede entrar?"` | Texto libre por consola |
| `npm run pruebas` | Matriz P-01 a P-10, regresión P-08, R12, privacidad e intención |
| `npm run e2e` | Pruebas de punta a punta P-06 y P-07 con el modelo |
| `npm run typecheck` | Verificación de tipos (TypeScript estricto) |

## Configuración (`.env`)

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PROVEEDOR` | `ollama` | `ollama` (local, el exigido por el taller) o `vercel` (solo comparación) |
| `MODELO_OLLAMA` | `llama3.2:3b` | Modelo local |
| `AI_GATEWAY_API_KEY` | vacío | Solo si `PROVEEDOR=vercel`. Nunca se sube al repositorio |
| `MODELO_VERCEL` | vacío | Modelo principal del Gateway (comparación) |
| `MODELOS_RESPALDO` | vacío | Modelos de respaldo del Gateway, separados por coma |
| `PORT` | `3000` | Puerto de la API |

## API

Todas las rutas escuchan solo en `127.0.0.1` (el prototipo no tiene autenticación).

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /salud` | — | `{ ok, proveedor }` |
| `GET /salas` | — | Salas con aforo, ocupación y estado de cada equipo |
| `POST /evaluar` | `{ id_sintetico, laboratorio, franja, tipo_evento }` | `{ decision, explicacion }` |
| `POST /mensaje` | `{ texto, laboratorio? }` | Decisión, aclaración o rechazo, con la intención detectada |

Ejemplo:

```sh
curl -s -X POST localhost:3000/evaluar -H "Content-Type: application/json" \
  -d '{"id_sintetico":"E-002","laboratorio":"sala-1","franja":"08:00–10:00","tipo_evento":"ingreso"}'
```

```json
{
  "decision": {
    "decision": "negar",
    "reglas_aplicadas": ["R1"],
    "equipo_sugerido": null,
    "notificar": [],
    "estado_asistencia": "no_aplica",
    "hechos_desconocidos": [],
    "contradicciones": [],
    "version_reglas": "1.0.0",
    "traza": ["R1: Inducción de seguridad vencida: negar uso de equipos y remitir a inducción."]
  },
  "explicacion": "…redactada por el modelo local…"
}
```

Una entrada que no cumple el esquema devuelve `400` con el detalle de los campos.

## Flujo de una solicitud en texto libre

1. **Datos prohibidos:** si el texto trae cédula, correo o teléfono, se rechaza sin llamar al modelo y sin guardar el texto.
2. **Guardia:** patrones de manipulación ("ignora las reglas", "tu prompt"…) se marcan sin consultar al modelo.
3. **Interpretación:** el modelo devuelve JSON estructurado con la intención y los datos candidatos.
4. **Verificación:** el orquestador contrasta los datos con el texto; lo que el modelo no pueda respaldar se descarta. Si falta el id o la sala, el agente pide aclaración.
5. **Decisión:** el motor aplica las reglas y devuelve un resultado estructurado con traza.
6. **Explicación:** el modelo redacta la explicación sin cambiar la decisión.
7. **Registro:** se guarda en `logs/evaluaciones.jsonl`.

## Reglas (versión 1.0.0)

| ID | Prioridad | Condición | Efecto |
|---|---|---|---|
| R1 | 1 | Inducción de seguridad vencida | Negar uso de equipos |
| R13 | 2 (más específica) | Dato desconocido **y** fuentes en conflicto | Escalar sin concluir |
| R2 | 2 | Dato crítico desconocido | Escalar |
| R3 | 2 | Fuentes con estados incompatibles | Escalar y notificar a mantenimiento |
| R4 | 3 | Carné no vigente | Negar ingreso |
| R5 | 4 | Reserva creada por rol no autorizado | Escalar a coordinación |
| R6 | 4 | Aprobación verbal | Escalar a coordinación |
| R7 | 5 | Aforo completo | Negar ingreso nuevo |
| R8 | 6 | Necesidad de accesibilidad | Puesto accesible o escalar |
| R9 | 6 | Equipo no disponible | Excluirlo de las sugerencias |
| R10 | 7 | Nada bloquea y la reserva es válida | Recomendar ingreso |
| R11 | 8 | Llegada dentro de la tolerancia (15 min) | Presente; si no, tardía |
| R12 | 8 | Sin entrada al cierre de la franja | Sin registro (no ausente) |

La tolerancia de asistencia es un parámetro de `agent/rules/reglas.json` (`tolerancia_asistencia_min`).

## Pruebas

| Prueba | Caso | Resultado esperado |
|---|---|---|
| P-01 | E-001 | Permitir, sugerir equipo, presente |
| P-02 | E-002 | Negar por R1 |
| P-03 | E-003 / E-004 | Último cupo: permitir / aforo lleno: negar (R7) |
| P-04 | E-005 | Escalar por dato desconocido (R2) |
| P-05 | E-008 | Escalar por contradicción (R3), sugerir otro equipo, notificar a mantenimiento |
| P-06 | Texto | Fuera de alcance, sin decisión |
| P-07 | E-009 + texto adversarial | Escalar por R6, alerta a coordinación |
| P-08 | E-010 | Regresión: con tolerancia 10 min, solo la llegada a los 12 min cambia a tardía |
| P-09 | E-006 | Escalar por R13, sin sugerir PC-07 |
| P-10 | E-007 | Negar por R4 |
| P-11 | E-012 | Accesibilidad (R8): con puesto accesible libre sugiere PC-03; sin puestos accesibles libres, escala |

## Estructura

```
agente-guardian-labs/
├── agent/
│   ├── channels/http.ts      API Express
│   ├── orquestador.ts        ciclo completo de una solicitud
│   ├── llm/                  proveedor, intérprete, guardia y redactor
│   ├── tools/                esquemas, motor, privacidad y salas
│   ├── rules/reglas.json     base de reglas versionada
│   └── instructions.md       reglas permanentes del agente
├── data/                     casos, equipos y salas sintéticos
├── evals/                    pruebas automáticas
├── logs/                     registro local (no se sube al repositorio)
└── web/                      interfaz React + Bootstrap
```

## Solución de errores

| Síntoma | Causa probable | Solución |
|---|---|---|
| `fetch failed` / `ECONNREFUSED 11434` | Ollama no está corriendo | `ollama serve` o abrir la app de Ollama |
| `model "llama3.2:3b" not found` | Modelo sin descargar | `ollama pull llama3.2:3b` |
| La interfaz dice "API sin conexión" | La API no está corriendo | `npm run app` desde la **raíz** |
| `EADDRINUSE :3000` | Puerto ocupado | Cerrar el otro proceso o usar `PORT=3001` |
| Errores de sintaxis al iniciar | Node antiguo | `nvm use` (Node 24) |
| La explicación es imprecisa | Límite del modelo de 3B | La decisión no cambia; revisar la traza |

## Limitaciones conocidas

- Los ids, salas y equipos son sintéticos; los nombres reales de las salas dependen de la entrevista con el responsable.
- El modelo de 3B a veces redacta con imprecisiones; por eso la interfaz siempre muestra la traza.
- La guardia por patrones se puede evadir; es una primera capa, y el motor decide igual.
- No hay autenticación: la API escucha solo en `127.0.0.1`.

## Créditos y licencias de terceros

- Ilustraciones: [unDraw](https://undraw.co/license) (uso libre, sin atribución obligatoria).
- Íconos y favicon: [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT).
- Dependencias: ver `package.json` y `web/package.json`.

## Nota de uso académico

Este código se entrega como evidencia del curso Inteligencia Artificial de UniEspinal. Puede revisarse y ejecutarse
con fines académicos. No está autorizado su uso con datos personales reales ni como sistema oficial de control de
acceso.
