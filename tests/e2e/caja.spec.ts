import { expect, type Locator, type Page, test } from "@playwright/test";
import { ADMIN, conFuncion, ingresar, unico } from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: RegExp | string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion }).click();
}

async function vender(page: Page, servicio: string, medio: string, patente = "") {
  const formulario = page.locator("form").filter({ hasText: "Medio de pago" });
  await elegir(page, formulario, "Servicio", new RegExp(`^${servicio}`));
  await formulario.getByText(medio, { exact: true }).click();
  if (patente) await formulario.getByLabel("Patente (opcional)").fill(patente);
  await formulario.getByRole("button", { name: "Registrar venta" }).click();
  await expect(page.getByText(new RegExp(`^Venta N° \\d+: ${servicio}`))).toBeVisible();
}

test("turno completo: el cajero abre, vende sin ver totales y cierra; el admin ve los totales, anula y cierra", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const sufijo = unico();
  const caja = `Caja ${sufijo}`;
  const categoria = `Cat caja ${sufijo}`;
  const servicio = `Servicio caja ${sufijo}`;
  const cajero = { email: `cajero${sufijo}@vtv.local`, password: "clave1234" };

  // --- Admin: prepara un cajero, una caja y un servicio propios de esta corrida
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nuevoUsuario = page.getByRole("dialog", { name: "Nuevo usuario" });
  await nuevoUsuario.getByLabel("Nombre").fill(`Cajero ${sufijo}`);
  await nuevoUsuario.getByLabel("Email").fill(cajero.email);
  await nuevoUsuario.getByLabel("Contraseña").fill(cajero.password);
  await conFuncion(page, "admin-usuarios", () =>
    nuevoUsuario.getByRole("button", { name: "Crear usuario" }).click(),
  );
  await expect(page.getByText(`Usuario Cajero ${sufijo} creado`)).toBeVisible();

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
  await nuevoServicio.getByLabel("Precio ($)").fill("25.000");
  await nuevoServicio.getByLabel("Usa hoja de certificado").click();
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();

  // --- Cajero: abre turno en su caja
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, cajero);
  await expect(pc).toHaveURL("/caja");
  await expect(pc.getByRole("heading", { name: "Abrir turno" })).toBeVisible();
  await pc.getByRole("button", { name: "Abrir turno" }).click();
  await expect(pc.getByText("Elegí una caja.")).toBeVisible();
  await pc.getByRole("radio", { name: new RegExp(caja) }).check();
  await pc.getByRole("button", { name: "Abrir turno" }).click();
  await expect(pc.getByText(`Turno abierto en “${caja}”`)).toBeVisible();
  await expect(pc.getByRole("heading", { name: caja })).toBeVisible();

  // Validación y dos ventas
  await pc.getByRole("button", { name: "Registrar venta" }).click();
  await expect(pc.getByText("Elegí un servicio.")).toBeVisible();
  await expect(pc.getByText("Elegí el medio de pago.")).toBeVisible();
  await vender(pc, servicio, "Efectivo", "ab 123 cd");
  await vender(pc, servicio, "Tarjeta");
  const ventasCajero = pc.getByRole("region", { name: "Ventas del turno" });
  await expect(ventasCajero.getByRole("row").filter({ hasText: servicio })).toHaveCount(2);
  await expect(ventasCajero).toContainText("AB123CD");
  // Decisión del negocio: en la caja no se ven totales
  await expect(pc.getByText(/total/i)).toHaveCount(0);
  await expect(pc.getByText(/50\.000/)).toHaveCount(0);

  // --- Admin: ve el turno con sus totales
  await page.goto("/admin/ventas");
  const filaTurno = page.getByRole("row").filter({ hasText: caja });
  await expect(filaTurno).toContainText("Abierto");
  await expect(filaTurno).toContainText(`Cajero ${sufijo}`);
  await expect(filaTurno).toContainText("50.000,00");
  await filaTurno.getByRole("link", { name: /^Ver turno/ }).click();
  await expect(page.getByTestId("total-Efectivo")).toHaveText(/25\.000,00/);
  await expect(page.getByTestId("total-Tarjeta")).toHaveText(/25\.000,00/);
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/50\.000,00/);

  // Anular la venta con tarjeta: deja de sumar
  const ventaTarjeta = page.getByRole("row").filter({ hasText: "Tarjeta" });
  await ventaTarjeta.getByRole("button", { name: /^Anular venta/ }).click();
  const anular = page.getByRole("dialog", { name: /^Anular venta/ });
  await anular.getByRole("button", { name: "Anular venta" }).click();
  await expect(anular.getByText("Escribí el motivo.")).toBeVisible();
  await anular.getByLabel("Motivo").fill("Cobro duplicado");
  await anular.getByRole("button", { name: "Anular venta" }).click();
  await expect(page.getByText(/^Venta N° \d+ anulada$/)).toBeVisible();
  await expect(ventaTarjeta).toContainText("Anulada");
  await expect(ventaTarjeta).toContainText("Cobro duplicado");
  await expect(page.getByTestId("total-Tarjeta")).toHaveText(/0,00/);
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/25\.000,00/);

  // --- Cajero: ve la anulación y cierra su turno, sin totales
  await pc.reload();
  await expect(ventasCajero.getByRole("row").filter({ hasText: "Anulada" })).toHaveCount(1);
  await pc.getByRole("button", { name: "Cerrar turno" }).click();
  const cierre = pc.getByRole("dialog", { name: "Cerrar turno" });
  await expect(cierre.getByText(/total|\$/i)).toHaveCount(0);
  await cierre.getByLabel("Observaciones (opcional)").fill("Sin novedades");
  await cierre.getByRole("button", { name: "Cerrar turno" }).click();
  await expect(pc.getByText("Turno cerrado")).toBeVisible();
  await expect(pc.getByRole("heading", { name: "Abrir turno" })).toBeVisible();
  await expect(pc.getByRole("radio", { name: new RegExp(caja) })).toBeEnabled();

  // --- Admin: el turno figura cerrado, con las observaciones
  await page.reload();
  await expect(page.getByRole("heading", { name: new RegExp(caja) })).toContainText("Cerrado");
  await expect(page.getByText("Observaciones: Sin novedades")).toBeVisible();

  // --- Un turno que quedó abierto lo cierra el admin
  await pc.getByRole("radio", { name: new RegExp(caja) }).check();
  await pc.getByRole("button", { name: "Abrir turno" }).click();
  await expect(pc.getByRole("heading", { name: caja })).toBeVisible();
  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: caja })
    .filter({ hasText: "Abierto" })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  await page.getByRole("button", { name: "Cerrar turno" }).click();
  const cierreAdmin = page.getByRole("dialog", { name: "Cerrar turno" });
  await cierreAdmin.getByRole("button", { name: "Cerrar turno" }).click();
  await expect(page.getByText("Turno cerrado")).toBeVisible();
  // El cajero, sin recargar, intenta vender: la BD lo rechaza y la pantalla vuelve sola a
  // "Abrir turno" (sin la venta).
  const formulario = pc.locator("form").filter({ hasText: "Medio de pago" });
  await elegir(pc, formulario, "Servicio", new RegExp(`^${servicio}`));
  await formulario.getByText("Efectivo", { exact: true }).click();
  await formulario.getByRole("button", { name: "Registrar venta" }).click();
  await expect(pc.getByRole("heading", { name: "Abrir turno" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/0,00/);
  await contextoCajero.close();
});

test("el cajero no entra a ventas del admin", async ({ browser }) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, { email: "cajero@vtv.local", password: "cajero1234" });
  await expect(page).toHaveURL("/caja");
  await page.goto("/admin/ventas");
  await expect(page).not.toHaveURL("/admin/ventas");
  await contexto.close();
});
