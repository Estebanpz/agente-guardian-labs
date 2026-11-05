# Guardian Labs: guía para agentes de código

Prototipo académico (IA, UniEspinal 2026B). Agente lógico con un motor de reglas que decide y un
modelo local (Ollama `llama3.2:3b`) que solo interpreta texto. Datos 100 % sintéticos.

## Plan vigente

El trabajo en curso está en `docs/plan/PLAN_RESERVAS.md`. Síguelo fase por fase; si algo no está
definido allí, pregunta a Esteban antes de inventarlo.

## Reglas obligatorias

- Trabaja solo en la rama `dev`. Nunca hagas commit ni push a `main`. No hagas `push` sin que
  Esteban lo pida.
- **Prohibido** agregar `Co-Authored-By:`, `Generated with`, `Claude-Session:` u otra firma de IA en
  commits, PR o archivos.
- Mensajes de commit: `tipo: descripción en español` (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`).
- `git add` por nombre de archivo; nunca `git add -A` ni `git add .`.
- Nunca leas ni imprimas `.env`. Para comprobar una variable: `grep -c '^NOMBRE=' .env`.
- La URI de MongoDB, contraseñas, claves y tokens no van en código, docs, logs, capturas ni commits.
  Antes de cada commit:
  `git diff --cached | grep -nE 'mongodb(\+srv)?://[^ "]*@|AI_GATEWAY_API_KEY=.+' || echo "OK sin secretos"`
- Sin datos personales reales. Carnés sintéticos `C-1000000X` / `D-2000000X`; los de terceros se
  muestran enmascarados (`C-****0002`).
- Ciclo por fase: implementar → probar → informe de fase → **esperar la aceptación de Esteban** →
  commit en `dev`. Sin aceptación no hay commit ni siguiente fase.
- MCP de MongoDB Atlas: solo para crear la base y las colecciones vacías y para verificar
  (`count`, `find` con `limit`, índices, esquema). Los datos los carga `npm run seed`. Nunca
  insertes, edites ni borres documentos de `guardian_labs` a mano. No toques usuarios, IPs,
  clusters ni el proyecto `api`. `drop-database` solo sobre `guardian_labs_test`.
- El motor decide; el modelo nunca elige sala, horario ni confirma una reserva.
- No modifiques `agent/tools/motor.ts` (R1–R13), `data/casos.ts` ni `data/equipos.ts`.

## Trabajo con varios agentes (subagentes)

Puedes repartir una fase entre subagentes en paralelo para ir más rápido, con estas reglas:

- **Cada archivo tiene un solo dueño.** Antes de lanzar los subagentes, escribe la lista de
  "subagente → archivos que puede crear o editar". Dos subagentes nunca tocan el mismo archivo,
  ni siquiera `package.json` o `README.md`.
- **Solo el agente principal** puede:
  - usar git (`add`, `commit`, `push`, `mv`);
  - correr `npm install`, `npm run seed` y `seed --reset`;
  - usar las herramientas de escritura del MCP de MongoDB;
  - levantar o detener `npm run app`;
  - hacer el informe de fase.
- Los subagentes solo leen, editan sus archivos y corren pruebas de solo lectura (`typecheck`,
  `npx tsx evals/<su-archivo>.ts`). No corren la matriz completa ni tocan Atlas.
- Tareas que dependen de otras (por ejemplo, la verificación final) van **después** de que
  terminen los subagentes, en el agente principal.
- Al terminar, el agente principal revisa `git status` y `git diff`, corre todas las pruebas de
  la fase y recién entonces entrega el informe.

## Cómo explorar el código

Usa CodeGraph antes de abrir archivos: la herramienta MCP `codegraph_explore`, o en la terminal
`codegraph explore "<tema>"`. Si el índice falla: `codegraph uninit . ; codegraph init .`.
`.codegraph/` está en `.gitignore`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run app` | API en 127.0.0.1:3000 + interfaz en localhost:5173 (vistas Laboratorios, Chat y Salas) |
| `npm run typecheck` | Verificación de tipos |
| `npm run pruebas` | Pruebas deterministas (sin red) |
| `npm run matriz` | Matriz esperado vs. observado (requiere Ollama para algunas filas) |
| `npm run seed` | Siembra MongoDB Atlas (después de la Fase 2 del plan) |
| `npm --prefix web run lint` / `build` | Calidad y compilación de la interfaz |

## Mapa

- `agent/tools/`: motor de reglas, esquemas Zod, privacidad, ayuda.
- `agent/llm/`: proveedor, intérprete, guardia y redactor.
- `agent/orquestador.ts`: orden de las capas.
- `agent/channels/http.ts`: API Express.
- `agent/rules/reglas.json`: base de reglas versionada.
- `data/`: hechos sintéticos.
- `evals/`: pruebas.
- `web/`: React 19 + Bootstrap 5.3, tokens de diseño en `web/src/index.css` (no agregues otro sistema visual).
