import { expect, type Page, test } from "@playwright/test";
import {
  ADMIN,
  CAJERO,
  cerrarTurnoDesdeBarra,
  conFuncion,
  ingresar,
  ingresarEfectivo,
  opcionTurno,
  trabajarEnCaja,
  unico,
} from "./utilidades";

/**
 * La barra entra en el ancho de la pantalla: todos sus botones (el último es "Salir") se ven enteros.
 * Si la barra desbordara, el último quedaría fuera y la página tendría scroll horizontal.
 */
async function barraEntera(page: Page) {
  const botones = page.getByRole("banner").getByRole("button");
  const cantidad = await botones.count();
  expect(cantidad).toBeGreaterThan(0);
  for (let i = 0; i < cantidad; i++) {
    await expect(botones.nth(i)).toBeInViewport({ ratio: 1 });
  }
}

test("barra fija: el admin abre una caja (ya elegida, sin 'Atiende') y la cierra eligiéndola de la lista con quiénes atendieron", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const sufijo = unico();
  const caja = `Caja barra ${sufijo}`;
  const cajero = { email: `cajerobarra${sufijo}@vtv.local`, password: "clave1234" };
  const nombreCajero = `Cajero ${sufijo}`;

  // --- Admin: un cajero y una caja propios de esta corrida, y efectivo para el cambio
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nuevoUsuario = page.getByRole("dialog", { name: "Nuevo usuario" });
  await nuevoUsuario.getByLabel("Nombre").fill("Cajero");
  await nuevoUsuario.getByLabel("Apellido").fill(sufijo);
  await nuevoUsuario.getByLabel("Email").fill(cajero.email);
  await nuevoUsuario.getByLabel("Contraseña").fill(cajero.password);
  await conFuncion(page, "admin-usuarios", () =>
    nuevoUsuario.getByRole("button", { name: "Crear usuario" }).click(),
  );
  await expect(page.getByText(`Usuario ${nombreCajero} creado`)).toBeVisible();

  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const nuevaCaja = page.getByRole("dialog", { name: "Nueva caja" });
  await nuevaCaja.getByLabel("Nombre").fill(caja);
  await nuevaCaja.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();
  await ingresarEfectivo(page, "8.000", `Cambio ${sufijo}`);

  // --- La barra queda fija arriba al hacer scroll
  await page.goto("/admin/fondos");
  const barra = page.getByRole("banner");
  await page.mouse.wheel(0, 5000);
  await expect(barra).toBeInViewport();
  await expect(barra.getByRole("button", { name: "Abrir turno" })).toBeInViewport();

  // --- Abrir turno desde la barra: una caja libre ya viene elegida; no se elige quién atiende
  await barra.getByRole("button", { name: "Abrir turno" }).click();
  const apertura = page.getByRole("dialog", { name: "Abrir turno" });
  await expect(apertura.getByLabel("Caja")).not.toHaveText(/Elegí una caja|No hay cajas libres/);
  await expect(apertura.getByLabel("Atiende")).toHaveCount(0);
  await apertura.getByLabel("Caja").click();
  await page.getByRole("option", { name: caja, exact: true }).click();
  await apertura.getByLabel("Efectivo inicial ($)").fill("8.000");
  await apertura.getByRole("button", { name: "Abrir turno" }).click();
  await expect(page.getByText(new RegExp(`^Turno abierto en “${caja}” con`))).toBeVisible();
  // Después de abrir el admin se queda donde estaba, y la barra ofrece ir a la caja
  await expect(page).toHaveURL("/admin/fondos");
  await expect(barra.getByRole("link", { name: "Ir a la caja" })).toBeVisible();

  // --- Cajero: trabaja en la caja; no tiene acciones de turno en la barra
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, cajero);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  const barraCajero = pc.getByRole("banner");
  await expect(barraCajero.getByRole("button", { name: "Cerrar turno" })).toHaveCount(0);
  await expect(barraCajero.getByRole("button", { name: "Abrir turno" })).toHaveCount(0);
  await contextoCajero.close();

  // --- Admin: "Cerrar turno" lista la caja con desde cuándo y quiénes atendieron
  await barra.getByRole("button", { name: "Cerrar turno" }).click();
  const cierre = page.getByRole("dialog", { name: "Cerrar turno" });
  await expect(opcionTurno(cierre, caja)).toBeVisible();
  await page.keyboard.press("Escape");
  await cerrarTurnoDesdeBarra(page, { caja, observaciones: `Cierre desde la barra ${sufijo}` });

  // --- El turno figura cerrado con las observaciones, y el efectivo volvió a la caja de cambio
  await page.goto("/admin/ventas");
  const fila = page
    .getByRole("region", { name: "Historial de turnos" })
    .getByRole("row")
    .filter({ hasText: caja });
  await expect(fila).toContainText("Cerrado");
  await fila.getByRole("link", { name: /^Ver turno/ }).click();
  await expect(page.getByText(`Observaciones: Cierre desde la barra ${sufijo}`)).toBeVisible();
  await expect(page.getByTestId("efectivo-en-caja")).toHaveText(/8\.000,00/);
});

test("en el celular la barra no genera scroll horizontal", async ({ page, browser }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  const barra = page.getByRole("banner");
  // Solo íconos, con nombre accesible
  await expect(barra.getByRole("button", { name: "Abrir turno" })).toBeVisible();
  await expect(barra.getByRole("button", { name: "Cerrar turno" })).toBeVisible();
  await expect(barra.getByText("Abrir turno")).toBeHidden();
  await barraEntera(page);

  const contexto = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const pc = await contexto.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await expect(pc.getByRole("banner").getByRole("button", { name: "Salir" })).toBeVisible();
  await barraEntera(pc);
  await contexto.close();
});
