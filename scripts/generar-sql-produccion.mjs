// Genera supabase/produccion/01_esquema_completo.sql: todas las migraciones, en orden,
// en UNA transacción, para ejecutar a mano en el SQL Editor de Supabase.
//
//   node scripts/generar-sql-produccion.mjs              → (re)genera el archivo
//   node scripts/generar-sql-produccion.mjs --verificar  → falla si está desactualizado
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR_MIGRACIONES = "supabase/migrations";
const SALIDA = "supabase/produccion/01_esquema_completo.sql";

const archivos = readdirSync(DIR_MIGRACIONES)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();

const versiones = archivos.map((f) => f.slice(0, 14));

const partes = [
  "-- =====================================================================",
  "-- Sistema VTV — esquema completo para producción",
  "-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs. No editar a mano:",
  "-- cambiá supabase/migrations/ y corré `npm run sql:produccion`.",
  "--",
  "-- Ejecutar UNA sola vez, en un proyecto vacío, en el SQL Editor del Dashboard.",
  "-- Corre en una transacción: si algo falla, no queda nada a medias.",
  "-- NO incluye supabase/seed.sql (usuarios de prueba): no va a producción.",
  "--",
  "-- Incluye, en este orden:",
  ...archivos.map((f, i) => `--   ${String(i + 1).padStart(2, "0")}. ${f}`),
  "--",
  "-- Después de ejecutarlo, registrá las migraciones como aplicadas para que",
  "-- `supabase db push` no intente aplicarlas de nuevo:",
  `--   npx supabase migration repair --status applied ${versiones.join(" ")}`,
  "-- =====================================================================",
  "",
  "begin;",
  "",
];

for (const archivo of archivos) {
  const sql = readFileSync(`${DIR_MIGRACIONES}/${archivo}`, "utf8")
    .replace(/\r\n/g, "\n")
    .trimEnd();
  partes.push(
    "-- ---------------------------------------------------------------------",
    `-- ${archivo}`,
    "-- ---------------------------------------------------------------------",
    sql,
    "",
  );
}
partes.push("commit;", "");

const contenido = partes.join("\n");

if (process.argv.includes("--verificar")) {
  const actual = existsSync(SALIDA) ? readFileSync(SALIDA, "utf8").replace(/\r\n/g, "\n") : "";
  if (actual !== contenido) {
    console.error(`✖ ${SALIDA} está desactualizado. Corré: npm run sql:produccion`);
    process.exit(1);
  }
  console.log(`✔ ${SALIDA} al día (${archivos.length} migraciones)`);
} else {
  writeFileSync(SALIDA, contenido);
  console.log(`✔ ${SALIDA} generado con ${archivos.length} migraciones`);
}
