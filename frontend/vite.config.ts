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
        // Forward backend API routes to the local FastAPI server.
        // This means VITE_API_URL can be empty and the app works on any machine.
        "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
        "/auth": { target: "http://127.0.0.1:8000", changeOrigin: true },
        "/prompt-systems": { target: "http://127.0.0.1:8000", changeOrigin: true },
        "/providers": { target: "http://127.0.0.1:8000", changeOrigin: true },
        // For /modules and /shared: if the browser is navigating to the HTML page (Accept: text/html),
        // bypass the proxy so Vite renders the frontend React app and styles.
        "/modules": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.accept?.includes("text/html")) {
              return req.url;
            }
          },
        },
        "/shared": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.accept?.includes("text/html")) {
              return req.url;
            }
          },
        },
        "/history": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.accept?.includes("text/html")) {
              return req.url;
            }
          },
        },
        "/rag": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.accept?.includes("text/html")) {
              return req.url;
            }
          },
        },
        // RAG Assistant endpoints -> Railway RAG Backend
        "/rag-api": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/rag-api/, ""),
        },
        "/health": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
        },
        "/status": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
        },
        "/upload": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
        },
        "/documents": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
        },
        "/chat": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
        },
        "/ask": {
          target: process.env.VITE_RAG_API_URL || "https://ai-study-assistant.up.railway.app",
          changeOrigin: true,
          secure: true,
        },
      },
    },
    plugins,
  };
});
