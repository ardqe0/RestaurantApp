import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "../RestaurantApp/wwwroot/admin",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5223"
    }
  }
});
