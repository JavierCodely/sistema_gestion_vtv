import { expect, type Locator, type Page, test } from "@playwright/test";
import { ADMIN, ingresar, unico } from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: RegExp | string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion }).click();
}

test("el admin carga una venta con fecha pasada en efectivo (entra a la caja de cambio) y la anula", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const patente = `P${unico().slice(-7)}`;

  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/ventas");
  await page.getByRole("link", { name: "Ventas con fecha pasada" }).click();
  await expect(page).toHaveURL("/admin/ventas/pasadas");

  await page.getByRole("button", { name: "Cargar venta" }).click();
  const dialogo = page.getByRole("dialog", { name: "Cargar venta con fecha pasada" });
  await dialogo.getByLabel("Fecha").fill("2026-10-15");
  await dialogo.getByLabel("Hora").fill("09:15");
  await elegir(page, dialogo, "Caja", /^Caja 1$/);
  await elegir(page, dialogo, "Servicio", /^Vehículo particular/);
  // Propone el precio actual del servicio; en esa fecha era otro.
  await expect(dialogo.getByLabel("Precio ($)")).toHaveValue("20000");
  await dialogo.getByLabel("Precio ($)").fill("18.500");
  await elegir(page, dialogo, "Medio de pago", "Efectivo");
  await dialogo.getByLabel("Patente (opcional)").fill(patente);
  await dialogo.getByRole("button", { name: "Cargar venta" }).click();

  const aviso = page.getByText(/^Venta N° \d+ cargada \(Vehículo particular/);
  await expect(aviso).toBeVisible();
  const id = /N° (\d+)/.exec((await aviso.textContent()) ?? "")?.[1] ?? "";
  expect(id).not.toBe("");

  const fila = page.getByTestId(`venta-pasada-${id}`);
  await expect(fila).toContainText("15/10/2026, 09:15");
  await expect(fila).toContainText("Caja 1");
  await expect(fila).toContainText(patente.toUpperCase());
  await expect(fila).toContainText(/\$\s?18\.500,00/);

  // El efectivo entró a la caja de cambio.
  await page.goto("/admin/fondos?pestana=efectivo");
  await expect(
    page.getByRole("row").filter({ hasText: `Venta #${id} con fecha 15/10/2026 (Caja 1)` }),
  ).toContainText(/\$\s?18\.500,00/);

  // No figura en ningún turno ni se factura: se anula desde su pantalla y sale de la caja de cambio.
  await page.goto("/admin/ventas/pasadas");
  await page.getByRole("button", { name: `Anular venta N° ${id}` }).click();
  const anular = page.getByRole("dialog", { name: `Anular venta N° ${id}` });
  await expect(anular).toContainText("el monto sale de la caja de cambio.");
  await anular.getByLabel("Motivo").fill("Cargada por error");
  await anular.getByRole("button", { name: "Anular venta" }).click();
  await expect(page.getByTestId(`venta-pasada-${id}`)).toContainText("Anulada");
  await expect(page.getByTestId(`venta-pasada-${id}`)).toContainText("Cargada por error");

  await page.goto("/admin/fondos?pestana=efectivo");
  await expect(
    page.getByRole("row").filter({ hasText: `Anulación de venta #${id}: Cargada por error` }),
  ).toContainText(/−\$\s?18\.500,00/);
});
