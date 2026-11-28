import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  CAJERO,
  cerrarTurnoDesdeBarra,
  escapar,
  iniciarVentaEnCaja,
  ingresar,
  ingresarEfectivo,
  opcionTurno,
  trabajarEnCaja,
  unico,
  venderEnCaja,
} from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

async function crearCaja(page: Page, caja: string) {
  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nueva caja" });
  await dialogo.getByLabel("Nombre").fill(caja);
  await dialogo.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();
}

test("cajas compartidas: el admin abre una caja, el cajero y el admin venden en ella, el historial muestra a los dos y el admin la cierra", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const sufijo = unico();
  const cajaA = `Caja compartida ${sufijo}`;
  const cajaB = `Caja otra ${sufijo}`;
  const categoria = `Cat compartida ${sufijo}`;
  const servicio = `Servicio compartido ${sufijo}`;

  // --- Admin: dos cajas, un servicio y efectivo para el cambio
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await crearCaja(page, cajaA);
  await crearCaja(page, cajaB);
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
  await nuevoServicio.getByLabel("Precio ($)").fill("12.000");
  await nuevoServicio.getByLabel("Usa hoja de certificado").click();
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();
  await ingresarEfectivo(page, "4.000", `Cambio ${sufijo}`);

  // --- Admin: abre las dos cajas (sin elegir quién atiende)
  await abrirTurnoComoAdmin(page, { caja: cajaA, efectivo: "2.000" });
  await abrirTurnoComoAdmin(page, { caja: cajaB, efectivo: "2.000" });

  // --- Cajero: con varias cajas abiertas elige en cuál trabaja y vende
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await expect(pc.getByRole("heading", { name: "¿En qué caja estás trabajando?" })).toBeVisible();
  await trabajarEnCaja(pc, cajaA);
  await venderEnCaja(pc, { categoria, servicio, medio: "Transferencia", patente: "CA111JE" });

  // --- Admin: trabaja en la misma caja a la vez y vende
  await page.goto("/admin");
  await page.getByRole("banner").getByRole("link", { name: "Ir a la caja" }).click();
  await expect(page).toHaveURL("/caja");
  await trabajarEnCaja(page, cajaA);
  await venderEnCaja(page, { categoria, servicio, medio: "Efectivo", patente: "AD222MI" });

  // --- El historial de la caja muestra las ventas de los dos, con quién vendió
  await pc.reload();
  await pc.getByRole("tab", { name: "Historial" }).click();
  const historial = pc.getByRole("region", { name: "Ventas de la caja" });
  await expect(historial.getByRole("columnheader", { name: "Vendió" })).toBeVisible();
  await expect(historial.getByRole("row").filter({ hasText: "CA111JE" })).toContainText(
    "Carlos Demo",
  );
  await expect(historial.getByRole("row").filter({ hasText: "AD222MI" })).toContainText(
    "Ana Administradora",
  );
  // Sin totales para el cajero
  await expect(pc.getByText(/total/i)).toHaveCount(0);

  // --- Admin: el turno de la caja lista a quienes atendieron
  await page.goto("/admin/ventas");
  const fila = page
    .getByRole("region", { name: "Historial de turnos" })
    .getByRole("row")
    .filter({ hasText: cajaA });
  await expect(fila).toContainText("Ana Administradora y Carlos Demo");
  await expect(fila).toContainText("24.000,00");

  // --- Admin: la cierra desde la barra (la lista muestra quiénes atendieron)
  await page.getByRole("banner").getByRole("button", { name: "Cerrar turno" }).click();
  const cierre = page.getByRole("dialog", { name: "Cerrar turno" });
  await expect(opcionTurno(cierre, cajaA)).toBeVisible();
  await expect(
    cierre.getByRole("listitem").filter({ hasText: new RegExp(`^${escapar(cajaA)}`) }),
  ).toContainText("Atendieron: Ana Administradora y Carlos Demo");
  await page.keyboard.press("Escape");
  await cerrarTurnoDesdeBarra(page, { caja: cajaA, observaciones: `Cierre ${sufijo}` });

  // --- Cajero, sin recargar: la venta se rechaza y vuelve a elegir caja con el aviso
  await iniciarVentaEnCaja(pc, { categoria, servicio, medio: "Transferencia" });
  await expect(pc.getByRole("heading", { name: "¿En qué caja estás trabajando?" })).toBeVisible();
  await expect(pc.getByRole("alert").filter({ hasText: cajaA })).toContainText("se cerró");
  // Elige la otra caja abierta y sigue vendiendo ahí
  await pc.getByRole("button", { name: new RegExp(`^${escapar(cajaB)}\\s*Abierta desde`) }).click();
  await expect(
    pc
      .getByLabel("Estás trabajando en")
      .or(pc.getByRole("heading", { name: cajaB, exact: true }))
      .first(),
  ).toContainText(cajaB);
  await venderEnCaja(pc, { categoria, servicio, medio: "Transferencia", patente: "OT333RA" });
  await contextoCajero.close();

  // --- El turno cerrado de la caja A tiene las dos ventas; la de la caja B quedó en la B
  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: cajaA })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  await expect(page.getByRole("heading", { name: new RegExp(escapar(cajaA)) })).toContainText(
    "Cerrado",
  );
  await expect(page.getByText("Atendieron: Ana Administradora y Carlos Demo")).toBeVisible();
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/24\.000,00/);
  await expect(page.getByRole("row").filter({ hasText: "OT333RA" })).toHaveCount(0);

  await cerrarTurnoDesdeBarra(page, { caja: cajaB });
});
