import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresar, unico } from "./utilidades";

test("el admin crea, renombra y desactiva una caja", async ({ page }) => {
  const nombre = `Caja ${unico()}`;
  await ingresar(page, ADMIN);
  await page.getByRole("link", { name: "Cajas" }).click();
  await expect(page.getByRole("heading", { name: "Cajas" })).toBeVisible();
  await expect(page.getByTestId("caja-Caja 1")).toBeVisible();

  // Validación
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nueva caja" });
  await dialogo.getByRole("button", { name: "Crear caja" }).click();
  await expect(dialogo.getByText("Ingresá el nombre.")).toBeVisible();

  // Crear: la BD limpia los espacios sobrantes
  await dialogo.getByLabel("Nombre").fill(`  ${nombre.replace(" ", "   ")} `);
  await dialogo.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${nombre}” creada`)).toBeVisible();
  const fila = page.getByTestId(`caja-${nombre}`);
  await expect(fila.getByRole("switch")).toBeChecked();

  // Repetida aunque cambien las mayúsculas
  await page.getByRole("button", { name: "Nueva caja" }).click();
  await dialogo.getByLabel("Nombre").fill(nombre.toUpperCase());
  await dialogo.getByRole("button", { name: "Crear caja" }).click();
  await expect(dialogo.getByRole("alert")).toHaveText("Ya existe una caja con ese nombre.");
  await page.keyboard.press("Escape");

  // Renombrar
  await fila.getByRole("button", { name: `Editar ${nombre}` }).click();
  const editar = page.getByRole("dialog", { name: "Editar caja" });
  await expect(editar.getByLabel("Nombre")).toHaveValue(nombre);
  await editar.getByLabel("Nombre").fill(`${nombre} B`);
  await editar.getByRole("button", { name: "Guardar" }).click();
  const renombrada = page.getByTestId(`caja-${nombre} B`);
  await expect(renombrada).toBeVisible();

  // Desactivar y reactivar
  await renombrada.getByRole("switch", { name: `Caja ${nombre} B activa` }).click();
  await expect(page.getByText(`Caja “${nombre} B” desactivada`)).toBeVisible();
  await expect(renombrada.getByRole("switch")).not.toBeChecked();
  await renombrada.getByRole("switch").click();
  await expect(renombrada.getByRole("switch")).toBeChecked();
});

test("el cajero no entra a la administración de cajas", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  await page.goto("/admin/cajas");
  await expect(page).not.toHaveURL("/admin/cajas");
  await expect(page.getByRole("heading", { name: "Cajas" })).toHaveCount(0);
});
