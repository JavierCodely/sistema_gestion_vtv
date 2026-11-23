import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  CAJERO,
  cerrarTurnoDesdeBarra,
  conFuncion,
  ingresar,
  salir,
  trabajarEnCaja,
  unico,
} from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

test("barra del admin: acciones de turno y modo oscuro que se recuerda", async ({ page }) => {
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  const barra = page.getByRole("banner");
  await expect(barra.getByRole("button", { name: "Abrir turno" })).toBeVisible();
  await expect(barra.getByRole("button", { name: "Cerrar turno" })).toBeVisible();

  const html = page.locator("html");
  const oscuroAntes = (await html.getAttribute("class"))?.includes("dark") ?? false;
  await page.getByRole("button", { name: /^Activar modo (oscuro|claro)$/ }).click();
  await expect(html).toHaveClass(oscuroAntes ? /^(?!.*\bdark\b)/ : /\bdark\b/);
  await page.reload();
  await expect(html).toHaveClass(oscuroAntes ? /^(?!.*\bdark\b)/ : /\bdark\b/);
  // Vuelve como estaba
  await page.getByRole("button", { name: /^Activar modo (oscuro|claro)$/ }).click();
  await salir(page);
});

test("el cajero no ve el saldo de efectivo ni pantallas del admin", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  for (const ruta of ["/admin/fondos", "/admin/efectivo", "/admin/gastos", "/admin"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL("/caja");
  }
  await expect(page.getByText(/saldo/i)).toHaveCount(0);
  await salir(page);
});

test("gastos: el admin habilita una categoría, el cajero carga un gasto y el admin lo anula", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const sufijo = unico();
  const caja = `Caja G ${sufijo}`;
  const subcategoria = `Sub ${sufijo}`;
  const cajero = { email: `cajerog${sufijo}@vtv.local`, password: "clave1234" };
  const nota = `Gasto ${sufijo}`;

  // --- Admin: fondo de la caja de cambio, cajero, caja y subcategoría habilitada para la caja
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "Fondos" }).click();
  await expect(page.getByRole("heading", { name: "Fondos", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Efectivo" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Ingreso" }).click();
  const ingreso = page.getByRole("dialog", { name: "Ingreso" });
  await ingreso.getByRole("button", { name: "Guardar" }).click();
  await expect(ingreso.getByText("Ingresá un monto.")).toBeVisible();
  await ingreso.getByLabel("Monto ($)").fill("5.000");
  await ingreso.getByLabel("Nota").fill(`Cambio ${sufijo}`);
  await ingreso.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/^Ingreso registrado\. Saldo: /)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `Cambio ${sufijo}` })).toContainText(
    /\+\$\s?5\.000,00/,
  );

  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nuevoUsuario = page.getByRole("dialog", { name: "Nuevo usuario" });
  await nuevoUsuario.getByLabel("Nombre").fill("Gaston");
  await nuevoUsuario.getByLabel("Apellido").fill(sufijo);
  await nuevoUsuario.getByLabel("Email").fill(cajero.email);
  await nuevoUsuario.getByLabel("Contraseña").fill(cajero.password);
  await conFuncion(page, "admin-usuarios", () =>
    nuevoUsuario.getByRole("button", { name: "Crear usuario" }).click(),
  );
  await expect(page.getByText(`Usuario Gaston ${sufijo} creado`)).toBeVisible();

  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const nuevaCaja = page.getByRole("dialog", { name: "Nueva caja" });
  await nuevaCaja.getByLabel("Nombre").fill(caja);
  await nuevaCaja.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();

  await page.goto("/admin/gastos");
  const varios = page.getByTestId("rubro-Varios");
  await varios.getByRole("button", { name: "Subcategoría" }).click();
  const nuevaSub = page.getByRole("dialog", { name: "Nueva subcategoría" });
  await nuevaSub.getByLabel("Nombre").fill(subcategoria);
  await nuevaSub.getByRole("switch").click();
  await nuevaSub.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(`Categoría «${subcategoria}» creada`)).toBeVisible();
  await expect(
    page.getByRole("switch", { name: `${subcategoria} habilitada para la caja` }),
  ).toBeChecked();

  await abrirTurnoComoAdmin(page, { caja, efectivo: "5.000" });

  // --- Cajero: en la caja abierta por el admin, carga un gasto en efectivo (sale de esa caja)
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, cajero);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await pc.getByRole("tab", { name: "Gastos" }).click();
  const gastosTurno = pc.getByRole("region", { name: "Gastos de la caja" });
  await expect(gastosTurno).toContainText("Todavía no hay gastos en este turno.");

  await pc.getByRole("button", { name: "Registrar gasto" }).click();
  const dialogo = pc.getByRole("dialog", { name: "Registrar gasto" });
  await dialogo.getByLabel("Categoría").click();
  await expect(pc.getByRole("option", { name: subcategoria })).toBeVisible();
  // Solo categorías habilitadas para la caja
  await expect(pc.getByRole("option", { name: "Sueldos" })).toHaveCount(0);
  await pc.getByRole("option", { name: subcategoria }).click();
  await dialogo.getByLabel("Monto ($)").fill("1.250,50");
  await elegir(pc, dialogo, "Pagado con", "Efectivo (de la caja)");
  await dialogo.getByLabel("Nota").fill(nota);
  await dialogo.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(pc.getByText(/^Gasto de \$\s?1\.250,50 registrado$/)).toBeVisible();
  const filaCajero = gastosTurno.getByRole("row").filter({ hasText: nota });
  await expect(filaCajero).toContainText(subcategoria);
  await expect(filaCajero).toContainText("1.250,50");
  // Quién lo cargó (la caja es compartida)
  await expect(filaCajero).toContainText(`Gaston ${sufijo}`);
  // Decisión del negocio: sin totales ni saldo en la caja
  await expect(pc.getByText(/total|saldo/i)).toHaveCount(0);

  // --- Admin: el gasto salió del efectivo de la caja del turno (no de la caja de cambio)
  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: caja })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  await expect(page.getByTestId("efectivo-gastos")).toHaveText(/1\.250,50/);
  await expect(page.getByTestId("efectivo-en-caja")).toHaveText(/3\.749,50/);

  // --- Admin: ve el gasto con quién y dónde, y lo anula; el efectivo vuelve a la caja del turno
  await page.goto("/admin/gastos");
  const filaAdmin = page.getByRole("row").filter({ hasText: nota });
  await expect(filaAdmin).toContainText(`Gaston ${sufijo}`);
  await expect(filaAdmin).toContainText(caja);
  await filaAdmin.getByRole("button", { name: /^Anular gasto/ }).click();
  const anular = page.getByRole("dialog", { name: "Anular gasto" });
  await anular.getByRole("button", { name: "Anular gasto" }).click();
  await expect(anular.getByText("Escribí el motivo.")).toBeVisible();
  await anular.getByLabel("Motivo").fill("Cargado por error");
  await anular.getByRole("button", { name: "Anular gasto" }).click();
  await expect(page.getByText(/^Gasto de \$\s?1\.250,50 anulado$/)).toBeVisible();
  await expect(filaAdmin).toContainText("Anulado");
  await expect(filaAdmin.getByRole("button", { name: /^Anular gasto/ })).toHaveCount(0);

  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: caja })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  await expect(page.getByTestId("efectivo-en-caja")).toHaveText(/5\.000,00/);
  // Nada de esto pasó por la caja de cambio
  await page.goto("/admin/fondos?pestana=efectivo");
  await expect(page.getByRole("row").filter({ hasText: nota })).toHaveCount(0);

  // --- Cajero: ve su gasto tachado
  await pc.reload();
  await pc.getByRole("tab", { name: "Gastos" }).click();
  await expect(gastosTurno.getByRole("row").filter({ hasText: nota })).toContainText("Anulado");
  await contextoCajero.close();

  // --- El admin cierra la caja (no queda abierta para otras pruebas)
  await cerrarTurnoDesdeBarra(page, { caja });
});
