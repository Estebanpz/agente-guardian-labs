# Prompt para Stitch MCP (consola local)

Pegar en Claude Code (o Gemini CLI) dentro del repo, con el MCP de Stitch ya conectado.

---

Lee `PRODUCT.md` completo y usa sus tokens y reglas como sistema de diseño. Mira las referencias `chat-bot-1.webp` y `chat-bot-2.webp` de la raíz solo como inspiración de estructura (sección 10 de PRODUCT.md dice qué tomar y qué no).

Con el MCP de Stitch crea un proyecto "Guardian Labs · Chat" y genera **2 variantes** de la pantalla Chat (escritorio 1440 y móvil 390):

- **Variante 1 · Clara:** fondo `#F4F6FB`, barra lateral `#0E1B4D` con la navegación compartida (Laboratorios, Chat, Salas), panel de historial del día, saludo grande con el nombre tras el carné, 4 accesos rápidos en tarjetas (Reservar sala, Ver disponibilidad, Estado de salas, Mis reservas), entrada en píldora con botón redondo `#1D4ED8`.
- **Variante 2 · Oscura:** fondo `#0E1B4D`, superficies `#13235F`, acento `#2563EB` (no amarillo), conmutador segmentado "Reservar / Consultar", chips de sugerencia con punto de estado, entrada abajo con botones de icono.

En ambas incluye: un mensaje del usuario, una respuesta del agente con insignia de intención, una tarjeta de decisión (Permitir, borde izquierdo verde + texto), chips "Usar Sala 8" y "Ver otras salas", indicador de escribiendo. Fuente Plus Jakarta Sans, objetivos de 44px, foco visible, contraste AA. Textos en español, tuteo. Datos sintéticos, carné enmascarado `C-1234••••`. No incluyas claves, URIs ni nombres de usuario del sistema.

Al terminar, exporta el HTML de cada variante a `docs/plan/diseno-chat/variante-1.html` y `variante-2.html` y dame el enlace del proyecto en Stitch. No modifiques código de `web/` ni hagas commit.
