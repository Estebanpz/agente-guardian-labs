# Pruebas de mutación (Stryker)

Las pruebas de mutación introducen errores pequeños a propósito («mutantes») en el código y corren las pruebas: si
alguna prueba falla, el mutante muere; si todas pasan, sobrevive y señala un comportamiento que nadie comprueba.

- Herramienta: StrykerJS 10.1.1 con el ejecutor de comandos (`stryker.config.json`).
- Comando de pruebas por mutante: `REPOSITORIO=memoria npm run pruebas:rapidas` (unos 18 s).
- Archivos mutados: `agent/tools/privacidad.ts`, `agent/tools/acceso.ts`, `agent/tools/extraer.ts` y, en
  `agent/tools/reservas.ts`, `enmascarar`, `ocupadaPublica` y `evaluarCancelacion` (R27).
- Cómo correrla: `npm run mutacion`. Informe: `reports/mutation/mutation.html` (no se sube al repositorio).

## Corrida 1 (14-11-2026, 20 min 6 s)

| Archivo | Puntuación | Muertos | Sobrevivientes |
|---|---|---|---|
| acceso.ts | 62,45 % | 148 | 89 |
| extraer.ts | 94,27 % | 444 | 27 |
| privacidad.ts | 28,13 % | 63 | 161 |
| reservas.ts | 79,07 % | 34 | 9 |
| **Total** | **70,67 %** | **689** | **286** |

Lectura de los sobrevivientes:

- **privacidad.ts** (134 de 161 son de expresiones regulares): los patrones se cubren entre sí (un teléfono lo
  detectan dos expresiones y además el patrón de documento), así que debilitar uno no cambia el resultado final. Las
  pruebas solo miraban `datosProhibidos` completo. Además nadie comprobaba cada dígito en letras ni los límites de
  los cuantificadores (6 y 12 dígitos, 30 caracteres, 64 de la parte local del correo).
- **acceso.ts**: no se probaban huellas mal formadas, el largo exacto del secreto (32), el contenido firmado del token
  (rol, exp, carné), la limpieza de tokens revocados, el borde del bloqueo (justo a los 5 minutos) ni la poda del
  registro de intentos.
- **reservas.ts**: los bordes de R27 (empieza justo ahora, un minuto antes o después) y los campos de `ocupadaPublica`.

## Pruebas nuevas para matarlos

| Archivo | Qué comprueba |
|---|---|
| `evals/mutacion/privacidad.ts` | Cada patrón por separado (vía `internos`), en sus límites, cada rama de las alternativas, mayúsculas, lookbehind y lookahead, los diez dígitos en letras, fechas completas o trozos, códigos RS, carnés y enmascarado. |
| `evals/mutacion/acceso.ts` | Huellas mal formadas sin excepciones, surrogates, firma HMAC con el secreto de 32 caracteres (y uno de 31 ignorado, en otro proceso), 8 h exactas, contenido del token, revocación, mensajes de error, correo con mayúsculas y espacios, bordes del bloqueo y poda a 9 000. |
| `evals/mutacion/reservas.ts` | `enmascarar`, `ocupadaPublica` y todos los bordes de R27. |
| `evals/mutacion/extraer.ts` | Límites de fechas, horas y extractores (escrita por el agente de mutación). |

Mutantes equivalentes conocidos (no cambian el comportamiento): `cuenta !== null` en el login (la huella ficticia
nunca verifica), `f.hasta === 0` (un bloqueo guarda `n: 0`) y volver a registrar a un usuario ya registrado.

## Corrida 2

Pendiente: correr `npm run mutacion` con las pruebas nuevas y anotar aquí la tabla.
