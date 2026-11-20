import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresar, salir } from "./utilidades";

test("el admin entra al panel con menú lateral y puede ir a operar una caja", async ({ page }) => {
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  const menu = page.getByRole("navigation", { name: "Menú de administración" });
  for (const item of [
    "Dashboard",
    "Ventas",
    "Alertas",
    "Usuarios",
    "Cajas",
    "Servicios",
    "Certificados",
    "Gastos",
    "Caja de efectivo",
  ]) {
    await expect(menu.getByRole("link", { name: item })).toBeVisible();
  }
  await page.getByRole("link", { name: "Operar caja" }).click();
  await expect(page).toHaveURL("/caja");
  await expect(page.getByRole("link", { name: "Panel admin" })).toBeVisible();
  await salir(page);
});

test("el cajero entra a la caja y no puede abrir el panel admin", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  await expect(page.getByText("Cajero Demo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Panel admin" })).toHaveCount(0);

  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL("/caja");
  await salir(page);
});

test("credenciales incorrectas muestran un mensaje claro", async ({ page }) => {
  await ingresar(page, { email: ADMIN.email, password: "incorrecta" });
  await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("una ruta privada pide login y después vuelve a esa ruta", async ({ page }) => {
  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Contraseña").fill(ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
});

test("al salir no se puede volver a una pantalla privada", async ({ page }) => {
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await salir(page);
  await page.goto("/admin");
  await expect(page).toHaveURL("/login");
});
