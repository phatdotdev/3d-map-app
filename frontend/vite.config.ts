import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

function createBackendProxy(target: string) {
  return {
    target,
    changeOrigin: true,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const runtimeMode = String(env.VITE_RUNTIME_MODE || mode)
    .trim()
    .toLowerCase();
  const backendTarget = env.VITE_BACKEND_URL || "http://localhost:3001";
  const backendProxy = createBackendProxy(backendTarget);

  return {
    plugins: [react(), tailwind()],
    server: {
      proxy:
        runtimeMode === "web"
          ? undefined
          : {
              "/api": backendProxy,
              "/raw": backendProxy,
              "/data/raw": backendProxy,
              "/models": backendProxy,
            },
    },
  };
});
