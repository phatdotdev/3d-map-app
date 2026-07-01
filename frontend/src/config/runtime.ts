export type RuntimeMode = "app" | "web";

const rawRuntimeMode = String(import.meta.env.VITE_RUNTIME_MODE ?? "app")
  .trim()
  .toLowerCase();

export const runtimeMode: RuntimeMode =
  rawRuntimeMode === "web" ? "web" : "app";

export function isAppMode() {
  return runtimeMode === "app";
}

export function isWebMode() {
  return runtimeMode === "web";
}

export function ensureAppMode(action = "Chuc nang nay") {
  if (isWebMode()) {
    throw new Error(`${action} chi kha dung trong APP mode.`);
  }
}

