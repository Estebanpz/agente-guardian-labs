// Ilustraciones de unDraw (https://undraw.co/license: uso libre, sin atribución obligatoria).
// SVG optimizados con SVGO: son vectoriales, pesan menos que un WebP equivalente y se ven nítidos en cualquier pantalla.
import autenticacion from "./authentication.svg";
import negado from "./access-denied.svg";
import escalar from "./action-required.svg";
import permitir from "./access-account.svg";
import chat from "./chat-bot.svg";
import pensando from "./ai-response.svg";
import salas from "./control-panel.svg";
import sinConexion from "./connection-lost.svg";
import elegir from "./choose.svg";

export const ilus = { autenticacion, negado, escalar, permitir, chat, pensando, salas, sinConexion, elegir };

// Proporciones (viewBox) para reservar el espacio de cada imagen y evitar saltos al cargar (CLS).
export const tam = {
  autenticacion: [800, 626.6],
  negado: [742.4, 712.7],
  escalar: [800, 738.8],
  permitir: [720, 722.5],
  chat: [800, 714.2],
  pensando: [575.7, 800],
  salas: [960, 716.9],
  sinConexion: [800, 430.5],
  elegir: [800.2, 482.3],
};
