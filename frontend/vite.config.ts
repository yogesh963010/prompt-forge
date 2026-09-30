import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(async ({ command }) => {
  const plugins = [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
  ];

  if (command === "build") {
    try {
      const { nitro } = await import("nitro/vite");
      plugins.push(nitro());
    } catch {
      // nitro is optional if not building for server targets
    }
  }

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: "::",
      port: 8080,
      proxy: {
        // Forward all backend API routes to the local FastAPI server.
        // This means VITE_API_URL can be empty and the app works on any machine.
        "/auth": { target: "http://127.0.0.1:8000", changeOrigin: true },
        "/prompt-systems": { target: "http://127.0.0.1:8000", changeOrigin: true },
        "/modules": { target: "http://127.0.0.1:8000", changeOrigin: true },
        "/providers": { target: "http://127.0.0.1:8000", changeOrigin: true },
      },
    },
    plugins,
  };
});
