// Genera .env.local con la URL y la clave pública de Supabase local.
// Uso: npm run env:local (requiere `supabase start`).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const estado = JSON.parse(
  execSync("npx supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const contenido = [
  "# Generado por scripts/env-local.mjs — Supabase local. No commitear.",
  `VITE_SUPABASE_URL=${estado.API_URL}`,
  `VITE_SUPABASE_ANON_KEY=${estado.ANON_KEY}`,
  "",
].join("\n");
writeFileSync(".env.local", contenido);
console.log("✔ .env.local generado para", estado.API_URL);
