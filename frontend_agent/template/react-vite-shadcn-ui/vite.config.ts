import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0", // Bind to all interfaces for E2B sandbox
    port: 5173,
    strictPort: true,
    allowedHosts: true, // Allow all hosts (E2B sandbox URLs are dynamic)
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "./src"),
    },
  },
});
