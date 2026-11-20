import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresar, unico } from "./utilidades";

test("el admin gestiona categorías y servicios", async ({ page }) => {
  const sufijo = unico();
  const categoria = `Categoría ${sufijo}`;
  const servicio = `Servicio ${sufijo}`;
  await ingresar(page, ADMIN);
  await page.getByRole("link", { name: "Servicios" }).click();
  await expect(page.getByRole("heading", { name: "Servicios y categorías" })).toBeVisible();
  await expect(page.getByTestId("servicio-Vehículo particular")).toContainText("20.000,00");

  // Categoría nueva
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const dialogoCategoria = page.getByRole("dialog", { name: "Nueva categoría" });
  await dialogoCategoria.getByLabel("Nombre").fill(categoria);
  await dialogoCategoria.getByRole("button", { name: "Crear categoría" }).click();
  await expect(page.getByText(`Categoría “${categoria}” creada`)).toBeVisible();
  const filaCategoria = page.getByTestId(`categoria-${categoria}`);
  const cantidadServicios = filaCategoria.getByRole("cell").nth(1);
  await expect(cantidadServicios).toHaveText("0");

  // Servicio nuevo: validaciones
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const nuevo = page.getByRole("dialog", { name: "Nuevo servicio" });
  await nuevo.getByRole("button", { name: "Crear servicio" }).click();
  await expect(nuevo.getByText("Ingresá el nombre.")).toBeVisible();
  await expect(nuevo.getByText("Elegí una categoría.")).toBeVisible();
  await expect(nuevo.getByText("Ingresá un precio.")).toBeVisible();

  await nuevo.getByLabel("Nombre").fill(servicio);
  await nuevo.getByLabel("Categoría").click();
  await page.getByRole("option", { name: categoria }).click();
  await nuevo.getByLabel("Precio ($)").fill("15.000,555");
  await nuevo.getByRole("button", { name: "Crear servicio" }).click();
  await expect(nuevo.getByText("El precio no puede tener más de 2 decimales.")).toBeVisible();

  await nuevo.getByLabel("Precio ($)").fill("15.000,50");
  await nuevo.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();
  const fila = page.getByTestId(`servicio-${servicio}`);
  await expect(fila).toContainText(categoria);
  await expect(fila).toContainText("15.000,50");
  await expect(fila).toContainText("Usa hoja");
  await expect(cantidadServicios).toHaveText("1");

  // Nombre repetido
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  await nuevo.getByLabel("Nombre").fill(servicio.toLowerCase());
  await nuevo.getByLabel("Categoría").click();
  await page.getByRole("option", { name: categoria }).click();
  await nuevo.getByLabel("Precio ($)").fill("1");
  await nuevo.getByRole("button", { name: "Crear servicio" }).click();
  await expect(nuevo.getByRole("alert")).toHaveText("Ya existe un servicio con ese nombre.");
  await page.keyboard.press("Escape");

  // Editar: precio 0 y sin hoja
  await fila.getByRole("button", { name: `Editar servicio ${servicio}` }).click();
  const editar = page.getByRole("dialog", { name: "Editar servicio" });
  await expect(editar.getByLabel("Precio ($)")).toHaveValue("15000,50");
  await editar.getByLabel("Precio ($)").fill("0");
  await editar.getByLabel("Usa hoja de certificado").click();
  await editar.getByRole("button", { name: "Guardar" }).click();
  await expect(fila).toContainText("0,00");
  await expect(fila).toContainText("Sin hoja");

  // Filtro por categoría
  await page.getByLabel("Filtrar por categoría").click();
  await page.getByRole("option", { name: categoria }).click();
  await expect(page.locator('[data-testid^="servicio-"]')).toHaveCount(1);
  await page.getByLabel("Filtrar por categoría").click();
  await page.getByRole("option", { name: "Todas" }).click();
  await expect(page.getByTestId("servicio-Vehículo particular")).toBeVisible();

  // Desactivar servicio y categoría
  await fila.getByRole("switch", { name: `Servicio ${servicio} activo` }).click();
  await expect(page.getByText(`Servicio “${servicio}” desactivado`)).toBeVisible();
  await expect(fila.getByRole("switch")).not.toBeChecked();
  await filaCategoria.getByRole("switch", { name: `Categoría ${categoria} activa` }).click();
  await expect(page.getByText(`Categoría “${categoria}” desactivada`)).toBeVisible();
  await expect(fila).toContainText("(desactivada)");
});

test("el cajero no entra a la administración de servicios", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  await page.goto("/admin/servicios");
  await expect(page).not.toHaveURL("/admin/servicios");
  await expect(page.getByRole("heading", { name: "Servicios y categorías" })).toHaveCount(0);
});
