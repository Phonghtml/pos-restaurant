import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: false, // ໃຊ້ public/manifest.json ທີ່ມີຢູ່ແລ້ວ
      workbox: {
        // ເກັບໄຟລ໌ໜ້າເວັບໄວ້ອອບລາຍ. ຂໍ້ມູນ API ເກັບຜ່ານ IndexedDB (ບໍ່ cache ໂດຍ service worker)
        globPatterns: ["**/*.{js,css,html,svg,png,ico,json}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3100",
    },
  },
});
