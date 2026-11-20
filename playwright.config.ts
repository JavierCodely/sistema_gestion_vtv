import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// E2E SIEMPRE contra Supabase local (npm run db:start) con el seed cargado:
// - servidor propio en un puerto exclusivo, nunca se reutiliza uno abierto (ej. `npm run dev:remoto`);
// - URL y clave se leen de `supabase status` y pisan cualquier .env (Vite da prioridad al entorno);
// - si la URL no es local, no corre: los tests crean datos y jamás deben tocar la nube.

const PUERTO_E2E = 5174;

function supabaseLocal(): { url: string; clave: string } {
  if (process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_ANON_KEY) {
    return { url: process.env.E2E_SUPABASE_URL, clave: process.env.E2E_SUPABASE_ANON_KEY };
  }
  let estado: { API_URL?: string; ANON_KEY?: string };
  try {
    estado = JSON.parse(
      execSync("npx supabase status -o json", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as typeof estado;
  } catch {
    throw new Error("Supabase local no está corriendo. Ejecutá: npm run db:start");
  }
  const url = estado.API_URL ?? "";
  const clave = estado.ANON_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) || !clave) {
    throw new Error(`Los E2E solo corren contra Supabase local y se obtuvo: "${url}"`);
  }
  // Los workers heredan el entorno: no vuelven a consultar el estado.
  process.env.E2E_SUPABASE_URL = url;
  process.env.E2E_SUPABASE_ANON_KEY = clave;
  return { url, clave };
}

const { url, clave } = supabaseLocal();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PUERTO_E2E}`,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${PUERTO_E2E} --strictPort`,
    url: `http://localhost:${PUERTO_E2E}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: clave },
  },
});
