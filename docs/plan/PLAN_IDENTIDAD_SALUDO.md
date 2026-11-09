# Plan v3 — Identidad, saludo amable y horarios abiertos

Fecha: 2026-11-08 · Pedido del docente (3 cambios) · Base actual: commit bf9babb, reglas 2.0.0, matriz 53/53.
Base de datos: la que indique `MONGODB_URI` en `.env` (hoy MongoDB local `mongodb://127.0.0.1:27017/?replicaSet=rs0`).
Reglas fijas para quien ejecute: no leer ni imprimir `.env`; no subir claves; nombres de personas **ficticios**;
no usar nombres reales de estudiantes ni docentes del curso; sin Co-Author en commits; no commitear (lo hace Esteban).

## Decisiones ya tomadas (no preguntar de nuevo)

| Tema | Decisión |
|---|---|
| Carné | Se pide al inicio de **toda** conversación (consultas incluidas), salvo datos prohibidos y guardia, que responden igual que hoy. |
| Memoria de sesión | El carné identificado se guarda en la base del `.env` (colección nueva `sesiones`, TTL 1800 s) para no pedirlo otra vez. Se olvida al terminar una reserva (programada o escalada), al escribir "salir"/"cerrar sesión" o a los 30 min sin actividad. |
| Jornada | Solo informativa: va en el saludo y se guarda en la reserva. No cambia reglas. |
| Espacio académico | Estudiantes: **no** se pide. Docentes: se listan sus espacios como chips para escoger. |
| Facultades y programas | Los de las páginas oficiales de cada facultad (sección 1). |
| Saludo | Lo arma el código (plantilla), no el modelo, para que las pruebas sean deterministas. |

## 1. Catálogo de programas (nuevo `data/programas.ts`)

Fuente: páginas de facultad de uniespinal.edu.co, consultadas el 2026-11-08 (poner las URL en un comentario).
Exportar `FACULTADES` con `{ id, nombre, programas: { nombre, nivel }[] }`:

- **Facultad de Ingeniería y Ciencias Agroindustriales**: Técnica Profesional en Programación Web, Mantenimiento Electrónico, Construcción de Edificaciones, Monitoreo Agrícola, Técnica Profesional en Monitoreo Ambiental (técnico); Gestión Informática, Automatización Electrónica Industrial por Ciclos Propedéuticos, Gestión de la Construcción, Producción de Agrocultivos, Tecnología en Gestión Ambiental (tecnólogo); Ingeniería de Sistemas, Ingeniería Electrónica, Ingeniería Civil, Ingeniería Agronómica, Ingeniería Ambiental (profesional).
- **Facultad de Ciencias Económicas, Administrativas y Jurídicas**: Procesos Administrativos, Procesos Contables (técnico); Gestión Empresarial, Gestión Contable y Financiera (tecnólogo); Administración de Empresas, Contaduría Pública (profesional).
- **Facultad de Ciencias Sociales, Salud y Educación**: Operación de Servicios Comunitarios, Entrenamiento Deportivo (técnico); Gestión Deportiva, Gestión Comunitaria (tecnólogo); Trabajo Social, Actividad Física y Deporte (profesional).

## 2. Semilla de carnetización (`data/semilla.ts`) — mismos 17 carnés y vigencias

Esquema (Zod en `agent/tools/esquemas-reservas.ts`, unión por `rol`):
- estudiante: `_id, rol, vigencia, nombres, apellidos, programa, facultad, jornada ("Mañana"|"Noche")`
- docente: `_id, rol, vigencia, nombres, apellidos, facultad, espacios: string[] (1–6)`
`programa` y `facultad` deben existir en `FACULTADES` (validar en una prueba).

| Carné | Vigencia | Nombres | Apellidos | Programa | Facultad | Jornada |
|---|---|---|---|---|---|---|
| C-10000001 | vigente | Laura Valentina | Gómez Rojas | Ingeniería de Sistemas | Ingeniería y C. Agroindustriales | Noche |
| C-10000002 | vigente | Juan Camilo | Torres Díaz | Gestión Informática | Ingeniería | Mañana |
| C-10000003 | vigente | María José | Rincón Castro | Técnica Profesional en Programación Web | Ingeniería | Noche |
| C-10000004 | vigente | Andrés Felipe | Morales Pérez | Ingeniería Electrónica | Ingeniería | Mañana |
| C-10000005 | vigente | Daniela | Ortiz Suárez | Ingeniería Civil | Ingeniería | Mañana |
| C-10000006 | vigente | Santiago | Herrera López | Ingeniería Ambiental | Ingeniería | Noche |
| C-10000007 | vigente | Valeria | Cárdenas Mejía | Contaduría Pública | Económicas | Noche |
| C-10000008 | vigente | Sebastián | Ramírez Vargas | Administración de Empresas | Económicas | Mañana |
| C-10000009 | vigente | Natalia | Guzmán Ospina | Trabajo Social | Sociales | Mañana |
| C-10000010 | vigente | Miguel Ángel | Bermúdez Silva | Actividad Física y Deporte | Sociales | Noche |
| C-10000011 | vencido | Camila Andrea | Reyes Muñoz | Gestión Empresarial | Económicas | Noche |
| C-10000012 | desconocida | Diego Alejandro | Pardo Rubio | Ingeniería Agronómica | Ingeniería | Mañana |

(En el código usar el nombre completo de la facultad.)

| Carné | Vigencia | Nombres | Apellidos | Facultad | Espacios académicos |
|---|---|---|---|---|---|
| D-20000001 | vigente | Carlos Eduardo | Medina Ríos | Ingeniería | Bases de Datos; Programación Orientada a Objetos; Ingeniería de Software |
| D-20000002 | vigente | Patricia Elena | Soto Quintero | Ingeniería | Redes de Computadores; Sistemas Operativos; Seguridad Informática |
| D-20000003 | vigente | Luis Fernando | Acosta Beltrán | Económicas | Sistemas de Información Contable; Excel Financiero |
| D-20000004 | vigente | Adriana Marcela | Lozano Ruiz | Sociales | Estadística Aplicada; Informática Básica |
| D-20000005 | vencido | Jorge Iván | Castaño Prieto | Ingeniería | Electrónica Digital; Microcontroladores |

Cambios ligados: `PROY_CARNE` en `agent/store/mongo.ts` (añadir los campos), repositorio en memoria, y
validador `$jsonSchema` de `carnetizacion` en `agent/store/sembrar.ts` si existe. `usuarios` no cambia.
`ReservaDoc`: campo opcional `jornada` (solo estudiantes) + validador. Sin nombres en `reservas` ni `notificaciones`
(el carné sigue enmascarado C-****0001 en las respuestas).

## 3. Horarios abiertos (`agent/tools/extraer.ts`, función `buscarHorario`/`a24`)

Hoy ya funciona: `8:30AM - 11:30AM`, `8:30 am - 11:30 am`, `2 a 4 pm`, `11:30am a 1pm`, `18:30 a 20:00`.
Hoy falla (probado el 2026-11-08):
- `5:30 -7:30` y `de 5:30 a 7:30` → da 17:30–07:30. **Regla nueva:** si el fin no trae am/pm y queda antes del inicio, sumar 12 h al fin cuando así queda dentro de 07:00–22:00 y después del inicio.
- `8:30 a. m. a 11:30 a. m.` → null. Normalizar `a. m.`, `a.m.`, `a m`, `p. m.`, `p.m.`, `pm.` antes de buscar.
- `8.30 a 11.30` y `8h30` → null. Aceptar `.` y `h` como separador de minutos (sin confundir con fechas).
- `de 8 y media a 11 y media` → null. Aceptar `y media` (+30) y `y cuarto` (+15).
Se acepta cualquier minuto; las reglas R15 (07:00–22:00, 30 a 240 min) no cambian. Añadir todos estos casos a `evals/extraer.ts`
con su salida esperada.

## 4. Identidad y saludo (nuevo `agent/sesion.ts` + `agent/orquestador.ts` + `agent/conversacion.ts`)

1. Colección `sesiones` `{ _id: uuid de sesión, carne, actualizado, pendiente_texto?: string|null }`, índice TTL 1800 s en
   `actualizado` (en `sembrar.ts`); métodos en `Repositorio` (mongo y memoria): `leerSesion`, `guardarSesion`, `borrarSesion`.
2. En `mensaje()` del orquestador, **después** de datos prohibidos y antes del flujo abierto:
   - Sin sesión identificada y el texto trae carné → identificar. Si no trae → guardar el texto en `pendiente_texto` y responder:
     "¡Hola! Para atenderte, escríbeme tu carné (C- o D- seguido de 8 dígitos)." con chip "Soy nuevo".
   - La guardia (elusión) sigue respondiendo su alerta aunque no haya carné.
3. Al identificar (consultar carnetización):
   - vigente y registrado → guardar sesión y saludar.
   - vigente sin registro → flujo de registro actual (R26); al terminar, saludar.
   - vencido → "Tu carné está vencido; remítete a carnetización." (no se guarda sesión).
   - no existe o vigencia desconocida → R17 como hoy (aviso al monitor, no se guarda sesión).
4. Saludo (plantilla, hora de Bogotá con `reloj.ts`: 05–11 "Buenos días", 12–17 "Buenas tardes", 18–04 "Buenas noches"):
   - Estudiante: "¡{Saludo}, {Nombres} {Apellidos}! Qué gusto saludarte. Te veo en {Programa}, jornada de la {mañana/noche}. ¿En qué puedo ayudarte?"
   - Docente: "¡{Saludo}, {Nombres} {Apellidos}! Bienvenido(a) a Guardian Labs. ¿En qué puedo ayudarte hoy?" (sin profe/profesora para no asumir género)
   - Chips: "Reservar una sala", "Ver disponibilidad", "Salas ocupadas por fecha", "Ayuda".
   - Si había `pendiente_texto` con una petición (ej.: "quiero reservar la sala 6 mañana de 2 a 4"), tras el saludo **continuar
     esa petición** en el mismo turno en vez de preguntar otra vez qué necesita; luego borrar `pendiente_texto`.
5. Reserva con sesión: `iniciar("reserva")` toma `carne` de la sesión (quitar la regla "Nunca se copia el carné: siempre se pide").
   Para docentes, el paso `materia` muestra sus `espacios` como chips: "¿Para cuál espacio académico la requieres?". Acepta el
   nombre o el número de la opción; si no coincide, repite la lista. Estudiantes: sin paso de materia (ya es así; verificar).
6. Fin: tras registrar una reserva programada o escalada, añadir al mensaje: "Te envié el resumen de tu solicitud. Por tu
   seguridad olvidé tu carné; si necesitas otra solicitud, escríbeme de nuevo tu carné." y borrar la sesión.
   "salir" o "cerrar sesión" borra la sesión. "cancelar" cancela el flujo pero **no** borra la sesión.
7. `continuar`, `reanudar` y las rutas rápidas (ayuda, disponibilidad, ocupación por fecha) solo corren con sesión identificada.

## 5. Interfaz web (`web/src/pages/Chat.jsx`)
Mensaje inicial del agente al abrir el chat: "¡Hola! Soy Guardian Labs. Para empezar, escríbeme tu carné." y chip "Soy nuevo".
Botón pequeño "Cerrar sesión" que envía "salir". Mostrar los chips nuevos tal como llegan en `flujo.opciones`.

## 6. Pruebas (todas deben pasar; actualizar la matriz)
- `evals/extraer.ts`: los casos de horario de la sección 3.
- `evals/escenarios-conversacion.ts`: ajustar C-01 a C-16 al nuevo inicio (carné primero) sin cambiar lo que comprueban, y añadir:
  - C-17 primer mensaje "hola" → pide carné; luego C-10000001 → saludo con "Laura Valentina Gómez Rojas", "Ingeniería de Sistemas", "noche".
  - C-18 docente D-20000001 → saludo; reservar → al pedir materia salen sus 3 espacios como opciones; escoger "2" → materia "Programación Orientada a Objetos".
  - C-19 "quiero reservar la sala 6 mañana de 2 a 4" sin carné → pide carné → saludo + sigue la reserva sin volver a preguntar qué necesita.
  - C-20 tras confirmar una reserva → mensaje de olvido; el siguiente mensaje vuelve a pedir carné.
  - C-21 "de 5:30 a 7:30" en una reserva → 17:30–19:30.
  - C-22 "salir" → sesión borrada; "cancelar" en medio de reserva → no pide carné otra vez.
  - C-23 C-10000011 (vencido) → remite a carnetización, sin saludo ni sesión.
  - C-24 estudiante: nunca se pregunta el espacio académico.
- `evals/mongo.ts` (`npm run prueba:mongo`): sesión guardada y borrada en la base del `.env`; índice TTL presente.
- Prueba de semilla: cada `programa`/`facultad` existe en `FACULTADES`; 12 estudiantes y 5 docentes.
- `npm run typecheck`, `npm run pruebas`, `npm run matriz` (regenera docs/matriz-pruebas.*), `npm run seed -- --reset --si`.

## 7. Documentación
- `docs/cambios-reservas.md`: sección 7.0.5 con estos cambios, fecha y casos.
- `docs/plan/PLAN_RESERVAS.md`: enlace a este plan.
- `README.md`: MongoDB local con replica set `rs0` (instalación en Linux Mint 22 = Ubuntu noble; `replication.replSetName: rs0`;
  `rs.initiate`), y `MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0` en `.env.example` (sin claves).

## Orden de ejecución
1 → 2 (semilla + esquemas + seed) → 3 (horarios + pruebas) → 4 (sesión y saludo) → 5 (web) → 6 (todas las pruebas) → 7 (docs).
Después de cada paso: `npm run typecheck` y las pruebas del paso. No avanzar con pruebas en rojo.
