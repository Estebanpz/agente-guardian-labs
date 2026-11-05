# Anexo: guía de configuración de MongoDB Atlas

Esta guía explica cómo preparar la base de datos en la nube que usa Guardian Labs. Sigue los pasos en orden. Los valores entre `< >` son marcadores: reemplázalos por tus propios datos, nunca los copies tal cual.

## 1. Cluster Free y sus límites

Guardian Labs usa un cluster **Free** (tier M0) de MongoDB Atlas. Sus límites principales son:

- **Almacenamiento:** 0,5 GB. Los datos sintéticos del prototipo ocupan muy poco, pero conviene no cargar datos innecesarios.
- **Operaciones:** 100 operaciones por segundo. Para una demostración con pocos usuarios es suficiente.
- **Conexiones:** 500 conexiones simultáneas.
- **Pausa por inactividad:** si el cluster no recibe conexiones durante **30 días**, Atlas lo pausa. Para reactivarlo, entra a Atlas y pulsa **Resume**; luego espera unos minutos antes de volver a probar la aplicación.

Atlas Free es un *replica set*, por lo que las transacciones de la aplicación funcionan sin configuración adicional (ver sección 7).

## 2. Usuario de base de datos con roles readWrite y dbAdmin

Crea un usuario exclusivo para el proyecto, con permisos solo sobre las bases `guardian_labs` y `guardian_labs_test`.

1. En Atlas, ve a **Security > Database Access**.
2. Pulsa **Add New Database User**.
3. En **Authentication Method**, elige **Password**.
4. Escribe un nombre de usuario, por ejemplo `<usuario>`, y genera una contraseña segura con el botón de generación. Guárdala en un gestor de contraseñas; no la escribas en el informe ni en el código.
5. En **Database User Privileges**, elige **Specific privileges** (o *Built-in role* si tu versión de Atlas no muestra esa opción) y agrega cuatro privilegios: **readWrite** y **dbAdmin** sobre la base **guardian_labs**, y **readWrite** y **dbAdmin** sobre la base **guardian_labs_test**. No elijas *Atlas admin* ni permisos sobre todas las bases.
6. Pulsa **Add User**.

Por qué **dbAdmin** y no solo **readWrite**: la semilla (`npm run seed`) aplica los validadores `$jsonSchema` con `collMod`, y esa operación pertenece al rol dbAdmin. Con readWrite solo, la semilla falla al aplicar el esquema. Con este usuario, la aplicación no administra el cluster ni tiene permisos sobre otras bases.

## 3. Acceso de red (Network Access)

Atlas bloquea cualquier conexión que no venga de una IP autorizada.

1. Ve a **Security > Network Access**.
2. Pulsa **Add IP Address**.
3. Elige **Add Current IP Address** para autorizar la IP desde la que estás conectado.
4. Opcionalmente escribe una descripción, por ejemplo `equipo de casa`, y pulsa **Confirm**.

**Diferencia entre las dos opciones:**

- **Permitir la IP propia:** solo tu equipo (o la red de tu casa o de la universidad) puede conectarse. Es la opción recomendada.
- **Acceso amplio** (`0.0.0.0/0`, "Allow access from anywhere"): cualquier computador del mundo puede intentar conectarse al cluster. Aunque la contraseña protege la base, el acceso amplio aumenta la superficie de ataque y puede ser objeto de escaneos automáticos. Para este prototipo **no conviene**.

Si cambias de red (por ejemplo, de la casa a la universidad), la IP cambia y tendrás que agregarla de nuevo.

## 4. Archivo `.env`

El archivo `.env` está en la raíz del proyecto y guarda la configuración local. **Nunca se sube al repositorio** (está en `.gitignore`). El archivo `.env.example` sí se sube, pero sin valores reales.

Las variables son:

```sh
# Repositorio de datos: mongo (Atlas) | memoria (pruebas y respaldo sin red)
REPOSITORIO=mongo
# Cadena de conexión copiada de Atlas > Connect > Drivers. Reemplaza <usuario>, <contraseña> y <cluster>.
MONGODB_URI=<cadena-de-conexion-de-atlas>
MONGODB_DB=guardian_labs
MONGODB_DB_PRUEBAS=guardian_labs_test
```

Qué significa cada una:

- **`REPOSITORIO`**: `mongo` usa Atlas; `memoria` usa datos en memoria del proceso (útil para pruebas sin red).
- **`MONGODB_URI`**: la cadena de conexión. Para obtenerla, entra a **Database > Connect > Drivers**, elige el lenguaje Node.js y copia la cadena. Luego reemplaza `<password>` por la contraseña del usuario de la sección 2. Si la contraseña tiene caracteres especiales, debes codificarlos (por ejemplo, con el botón de Atlas o una herramienta de URL-encoding).
- **`MONGODB_DB`**: nombre de la base de datos de trabajo, `guardian_labs`.
- **`MONGODB_DB_PRUEBAS`**: base temporal que usan las pruebas de conexión, `guardian_labs_test`.

Para comprobar que una variable existe sin mostrar su valor, usa:

```sh
grep -c '^MONGODB_URI=' .env
```

El comando devuelve `1` si la variable existe y `0` si no. No copies el contenido de `.env` en el informe, en capturas ni en mensajes de ayuda.

## 5. Semilla de datos

La semilla crea las colecciones, sus validadores, sus índices y los datos sintéticos.

```sh
npm run seed
```

- Es **idempotente**: puedes ejecutarlo varias veces y el resultado es el mismo. No duplica datos.
- Crea las colecciones si no existen, aplica los validadores `$jsonSchema` y crea los índices.

Para **borrar** las reservas, notificaciones, conversaciones, bloqueos y contadores antes de volver a sembrar:

```sh
npm run seed -- --reset --si
```

- `--reset` solo sirve junto con `--si`. Sin `--si` el comando se detiene y muestra un aviso, para evitar borrados por error.
- Este comando **no** borra salas, equipos, carnetización ni usuarios, que se reescriben con los datos base.

## 6. Verificación

Después de la semilla, los conteos esperados son:

| Colección | Documentos esperados |
|---|---|
| salas | 16 |
| equipos | 306 |
| carnetizacion | 17 |
| usuarios | 7 |
| reservas | 3 |

Si ejecutas `npm run seed` por segunda vez, los conteos deben ser los mismos.

Para verificar la base de pruebas:

```sh
npm run prueba:mongo
```

Este comando crea la base `guardian_labs_test`, la usa para comprobar la conexión y la **borra al terminar**. Si al final la base de pruebas sigue existiendo en Atlas, bórrala a mano desde la interfaz de Atlas (solo esa base, nunca `guardian_labs`).

## 7. Errores comunes

| Mensaje o síntoma | Causa probable | Solución |
|---|---|---|
| `Faltan MONGODB_URI o MONGODB_DB en .env` | Falta la variable en `.env`, o el archivo no está en la raíz del proyecto. | Agrega ambas variables en `.env` (ver sección 4). Comprueba con `grep -c`. |
| `Authentication failed` o `bad auth` | Usuario o contraseña incorrectos en `MONGODB_URI`, o la contraseña no está codificada. | Revisa el usuario en **Database Access**. Si es necesario, cambia la contraseña y actualiza la cadena en `.env`. |
| `Could not connect` o `server selection timed out` con mensaje de IP no autorizada | La IP actual no está en **Network Access**. | Agrega la IP actual (sección 3). Si cambiaste de red, repite el paso. |
| `[mongo] sin conexión: …` y `/salud` muestra `repositorio: "memoria"` | Con `REPOSITORIO=mongo` la conexión falló, así que el proceso usa memoria. Puede deberse a cualquiera de las causas anteriores o a un cluster pausado. | Corrige la causa indicada en el mensaje. Si el cluster está pausado, pulsa **Resume** en Atlas. Reinicia la aplicación y confirma que `/salud` muestre `"mongo"`. |
| `Document failed validation` | El validador `$jsonSchema` rechaza un documento que no cumple el esquema (falta un campo, un tipo es incorrecto o hay campos no previstos). | Revisa el documento con el mensaje de error y compáralo con el esquema de la colección (`collection-schema` en el MCP o el archivo de esquemas del proyecto). Corrige los datos; no relajes el validador solo para que pase. |
| `Transaction numbers are only allowed on a replica set member or mongos` | Estás usando un servidor MongoDB local sin *replica set*, y las reservas usan transacciones. | Usa el cluster de Atlas (Free sí es un replica set). No uses un `mongod` local independiente. |

Si el error no aparece en esta tabla, copia el mensaje completo **sin la cadena de conexión** y busca la causa en la documentación de MongoDB Atlas. Nunca compartas la contraseña ni la cadena de conexión al pedir ayuda.
