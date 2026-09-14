import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Bonjour Flashcards",
        short_name: "Bonjour",
        description: "Franceza ta, în fiecare zi",
        theme_color: "#141615",
        background_color: "#141615",
        display: "standalone",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,ico}"] },
    }),
  ],
});
