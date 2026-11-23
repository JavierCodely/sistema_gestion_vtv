import { expect, test } from "@playwright/test";

test("sin sesión la app abre el login y está conectada a Supabase", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page).toHaveTitle("Sistema VTV");
  await expect(page.getByRole("heading", { name: "Sistema VTV" })).toBeVisible();
  await expect(page.getByTestId("estado-conexion")).toHaveText("Conectado");
});

test("una ruta desconocida muestra la página 404 y permite volver", async ({ page }) => {
  await page.goto("/no-existe");
  await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Volver al inicio" }).click();
  await expect(page).toHaveURL("/login");
});
