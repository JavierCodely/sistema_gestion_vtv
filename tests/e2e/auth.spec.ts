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
    "Fondos",
  ]) {
    await expect(menu.getByRole("link", { name: item })).toBeVisible();
  }
  // "Abrir turno" de la barra fija abre el modal de apertura sin salir del panel; el turno es de la
  // caja: no se elige quién atiende
  const barra = page.getByRole("banner");
  await expect(barra.getByRole("button", { name: "Cerrar turno" })).toBeVisible();
  await barra.getByRole("button", { name: "Abrir turno" }).click();
  const apertura = page.getByRole("dialog", { name: "Abrir turno" });
  await expect(apertura.getByLabel("Efectivo inicial ($)")).toBeVisible();
  await expect(apertura.getByLabel("Atiende")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/admin");
  await salir(page);
});

test("el cajero entra a la caja y no puede abrir el panel admin", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  await expect(page.getByText("Carlos Demo")).toBeVisible();
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
  const clave = page.getByLabel("Contraseña", { exact: true });
  await clave.fill(ADMIN.password);
  // El ojo muestra lo escrito y lo vuelve a ocultar, sin enviar el formulario
  await expect(clave).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(clave).toHaveAttribute("type", "text");
  await expect(clave).toHaveValue(ADMIN.password);
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(clave).toHaveAttribute("type", "password");
  await expect(page).toHaveURL("/login");
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
