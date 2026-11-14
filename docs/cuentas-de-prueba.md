# Cuentas de prueba (datos sintéticos)

Cuentas para el inicio de sesión de la interfaz (`/ingresar`). Son **sintéticas**: el dominio `.test` está reservado
y nunca corresponde a un correo real. La base solo guarda el hash `scrypt` de cada contraseña (`data/semilla.ts`);
las contraseñas en texto plano existen únicamente en este documento, para las pruebas y la sustentación.

| Rol | Contraseña |
|---|---|
| Estudiante | `Estudiante2026!` |
| Docente | `Docente2026!` |
| Monitor | `Monitor2026!` |

## Estudiantes (`@estudiantes.uniespinal.test`)

| Correo | Carné | Nombre | Estado en carnetización | Resultado al iniciar sesión |
|---|---|---|---|---|
| laura.gomez@estudiantes.uniespinal.test | C-****0001 | Laura Valentina Gómez Rojas | vigente, registrada | Entra |
| juan.torres@estudiantes.uniespinal.test | C-****0002 | Juan Camilo Torres Díaz | vigente, registrado (titular de RS-0001) | Entra |
| maria.rincon@estudiantes.uniespinal.test | C-****0003 | María José Rincón Castro | vigente, registrada | Entra |
| andres.morales@estudiantes.uniespinal.test | C-****0004 | Andrés Felipe Morales Pérez | vigente, registrado | Entra |
| daniela.ortiz@estudiantes.uniespinal.test | C-****0005 | Daniela Ortiz Suárez | vigente, registrada | Entra |
| santiago.herrera@estudiantes.uniespinal.test | C-****0006 | Santiago Herrera López | vigente, sin registro | Entra y queda registrado (R26) |
| valeria.cardenas@estudiantes.uniespinal.test | C-****0007 | Valeria Cárdenas Mejía | vigente, sin registro | Entra y queda registrada (R26) |
| sebastian.ramirez@estudiantes.uniespinal.test | C-****0008 | Sebastián Ramírez Vargas | vigente, sin registro | Entra y queda registrado (R26) |
| natalia.guzman@estudiantes.uniespinal.test | C-****0009 | Natalia Guzmán Ospina | vigente, sin registro | Entra y queda registrada (R26) |
| miguel.bermudez@estudiantes.uniespinal.test | C-****0010 | Miguel Ángel Bermúdez Silva | vigente, sin registro | Entra y queda registrado (R26) |
| camila.reyes@estudiantes.uniespinal.test | C-****0011 | Camila Andrea Reyes Muñoz | vencido | No entra: remite a carnetización (R16) |
| diego.pardo@estudiantes.uniespinal.test | C-****0012 | Diego Alejandro Pardo Rubio | vigencia desconocida | No entra: aviso al monitor (R17) |

## Docentes (`@docentes.uniespinal.test`)

| Correo | Carné | Nombre | Estado | Resultado |
|---|---|---|---|---|
| carlos.medina@docentes.uniespinal.test | D-****0001 | Carlos Eduardo Medina Ríos | vigente, registrado (titular de RS-0002) | Entra |
| patricia.soto@docentes.uniespinal.test | D-****0002 | Patricia Elena Soto Quintero | vigente, registrada (titular de RS-0003) | Entra |
| luis.acosta@docentes.uniespinal.test | D-****0003 | Luis Fernando Acosta Beltrán | vigente, sin registro | Entra y queda registrado (R26) |
| adriana.lozano@docentes.uniespinal.test | D-****0004 | Adriana Marcela Lozano Ruiz | vigente, sin registro | Entra y queda registrada (R26) |
| jorge.castano@docentes.uniespinal.test | D-****0005 | Jorge Iván Castaño Prieto | vencido | No entra: remite a carnetización (R16) |

## Monitor de salas

| Correo | Nombre | Acceso |
|---|---|---|
| monitor.salas@uniespinal.test | Sofía Martínez Lara (sintética) | Laboratorios, Salas, avisos y detalle de reservas. Sin carné: en el chat solo consulta. |

## Cómo se protegen

- Contraseña: `scrypt` (N=16384, r=8, p=1) con sal aleatoria de 16 bytes; se compara en tiempo constante.
- Sesión: token firmado con HMAC-SHA256 (`SESION_SECRETO` del `.env`), vence en 8 horas y se revoca al cerrar sesión.
- 5 contraseñas erradas seguidas bloquean ese correo 5 minutos. Correo inexistente y clave errada reciben el mismo mensaje.
- Cambiar el `localStorage` a mano no da otro rol: la API verifica la firma del token en cada petición.
