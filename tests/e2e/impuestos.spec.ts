import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  CAJERO,
  cerrarTurnoDesdeBarra,
  ingresar,
  ingresarEfectivo,
  trabajarEnCaja,
  unico,
  venderEnCaja,
} from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

test("impuestos: el admin crea un impuesto para tarjeta en un servicio, el cajero vende y el reporte lo suma por medio y por turno", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const sufijo = unico();
  const caja = `Caja imp ${sufijo}`;
  const categoria = `Cat imp ${sufijo}`;
  const servicio = `Servicio imp ${sufijo}`;
  const impuesto = `Imp tarjeta ${sufijo}`;

  // --- Admin: caja, servicio de $ 10.000 y efectivo para el cambio
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const nuevaCaja = page.getByRole("dialog", { name: "Nueva caja" });
  await nuevaCaja.getByLabel("Nombre").fill(caja);
  await nuevaCaja.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();
  await page.goto("/admin/servicios");
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const nuevaCategoria = page.getByRole("dialog", { name: "Nueva categoría" });
  await nuevaCategoria.getByLabel("Nombre").fill(categoria);
  await nuevaCategoria.getByRole("button", { name: "Crear categoría" }).click();
  await expect(page.getByText(`Categoría “${categoria}” creada`)).toBeVisible();
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const nuevoServicio = page.getByRole("dialog", { name: "Nuevo servicio" });
  await nuevoServicio.getByLabel("Nombre").fill(servicio);
  await elegir(page, nuevoServicio, "Categoría", categoria);
  await nuevoServicio.getByLabel("Precio ($)").fill("10.000");
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();

  // --- Admin: impuesto del 10 % solo para tarjeta, solo en ese servicio
  await page.goto("/admin");
  await page
    .getByRole("navigation", { name: "Menú de administración" })
    .getByRole("link", { name: "Impuestos" })
    .click();
  await expect(page.getByRole("heading", { name: "Impuestos", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo impuesto" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo impuesto" });
  await dialogo.getByLabel("Nombre").fill(impuesto);
  await dialogo.getByLabel("Porcentaje (%)").fill("10");
  await dialogo.getByRole("switch", { name: "Todos los medios de pago" }).click();
  await dialogo.getByRole("switch", { name: "Tarjeta" }).click();
  await dialogo.getByRole("button", { name: "Crear impuesto" }).click();
  await expect(page.getByText(`Impuesto “${impuesto}” creado`)).toBeVisible();
  const fila = page.getByTestId(`impuesto-${impuesto}`);
  await expect(fila).toContainText("Tarjeta");
  await expect(fila).toContainText("Ninguno");

  await page.getByRole("button", { name: `Servicios del impuesto ${impuesto}` }).click();
  const servicios = page.getByRole("dialog", { name: `Servicios de “${impuesto}”` });
  await servicios.getByRole("switch", { name: servicio, exact: true }).click();
  await servicios.getByRole("button", { name: "Guardar servicios" }).click();
  await expect(page.getByText(`Servicios de “${impuesto}” guardados`)).toBeVisible();
  await expect(fila).toContainText("1 servicio");

  // --- Turno y ventas del cajero: una con tarjeta (lleva impuesto) y una en efectivo (no)
  await ingresarEfectivo(page, "2.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "2.000" });
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await venderEnCaja(pc, { categoria, servicio, medio: "Tarjeta" });
  await venderEnCaja(pc, { categoria, servicio, medio: "Efectivo" });
  // El cliente paga el precio del servicio: el impuesto no lo cambia
  await expect(pc.getByTestId("ultima-venta")).toContainText(/10\.000,00/);
  await contextoCajero.close();

  // --- Reporte del mes actual: $ 1.000 en tarjeta, 1 venta
  await page.goto("/admin/impuestos");
  const reporte = page.getByTestId(`reporte-impuesto-${impuesto}`);
  await expect(reporte).toBeVisible();
  await expect(reporte.getByRole("cell")).toHaveText([
    impuesto,
    "1",
    /\$\s0,00/,
    /\$\s0,00/,
    /\$\s1\.000,00/,
    /\$\s1\.000,00/,
  ]);

  // --- Por turno: el de esta caja
  await page.getByLabel("Turno", { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(`^${caja} · `) }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`^Turno de ${caja}`) })).toBeVisible();
  await expect(reporte.getByRole("cell").last()).toHaveText(/\$\s1\.000,00/);

  // --- Año siguiente: todavía nada
  await page.getByLabel("Año", { exact: true }).click();
  const siguiente = String(new Date().getFullYear() + 1);
  await page.getByRole("option", { name: siguiente, exact: true }).click();
  await page.getByLabel("Mes", { exact: true }).click();
  await page.getByRole("option", { name: "Todo el año" }).click();
  await expect(page.getByRole("heading", { name: `Año ${siguiente}` })).toBeVisible();
  await expect(reporte).toHaveCount(0);

  // --- Se desactiva (no se borra: ya se aplicó en una venta) y se cierra el turno
  await page.getByRole("switch", { name: `Impuesto ${impuesto} activo` }).click();
  await expect(page.getByText(`Impuesto “${impuesto}” desactivado`)).toBeVisible();
  await cerrarTurnoDesdeBarra(page, { caja });
});
