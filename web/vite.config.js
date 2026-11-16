import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        // Envía X-Forwarded-For: el API limita los intentos de login por la IP real del navegador, no la del proxy.
        xfwd: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
