import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Static, client-only build of TikJil (no server) used to make the Android APK.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL("../www", import.meta.url)),
    emptyOutDir: true,
  },
});
