import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  cerrarTurnoDesdeBarra,
  conFuncion,
  iniciarVentaEnCaja,
  ingresar,
  ingresarEfectivo,
  trabajarEnCaja,
  unico,
  venderEnCaja,
} from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: RegExp | string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion }).click();
}

test("turno completo: el admin abre la caja con efectivo inicial, el cajero vende viendo solo el efectivo en caja, busca por patente y anula su venta; el admin ve totales y efectivo, anula y cierra", async ({
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
  await nuevoUsuario.getByLabel("Nombre").fill("Cajero");
  await nuevoUsuario.getByLabel("Apellido").fill(sufijo);
  await nuevoUsuario.getByLabel("Email").fill(cajero.email);
  await nuevoUsuario.getByLabel("Contraseña", { exact: true }).fill(cajero.password);
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

  // --- Cajero: no abre ni cierra turnos (sin acciones de turno en la barra)
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, cajero);
  await expect(pc).toHaveURL("/caja");
  await expect(pc.getByRole("button", { name: "Abrir turno" })).toHaveCount(0);
  await expect(pc.getByRole("button", { name: "Cerrar turno" })).toHaveCount(0);

  // --- Admin: abre la caja con efectivo inicial (obligatorio, sale de la caja de cambio)
  await ingresarEfectivo(page, "15.000", `Cambio ${sufijo}`);
  await page.goto("/admin/ventas");
  await page.getByRole("banner").getByRole("button", { name: "Abrir turno" }).click();
  const apertura = page.getByRole("dialog", { name: "Abrir turno" });
  await apertura.getByRole("button", { name: "Abrir turno" }).click();
  await expect(apertura.getByText("Ingresá el efectivo inicial.")).toBeVisible();
  await page.keyboard.press("Escape");
  await abrirTurnoComoAdmin(page, { caja, efectivo: "10.000" });
  await page.goto("/admin/fondos?pestana=efectivo");
  await expect(page.getByRole("row").filter({ hasText: `(${caja})` })).toContainText(
    /−\$\s?10\.000,00/,
  );

  // --- Cajero: trabaja en la caja abierta
  await trabajarEnCaja(pc, caja);

  // Dos ventas con el teclado: en efectivo muestra el vuelto
  await expect(pc.getByLabel("1. Patente")).toBeFocused();
  await venderEnCaja(pc, {
    categoria,
    servicio,
    medio: "Efectivo",
    patente: "ab 123 cd",
    recibido: "30000",
  });
  await expect(pc.getByTestId("ultima-venta")).toContainText(/Vuelto \$\s?5\.000,00/);
  await venderEnCaja(pc, { categoria, servicio, medio: "Tarjeta" });
  await pc.getByRole("tab", { name: "Historial" }).click();
  const ventasCajero = pc.getByRole("region", { name: "Ventas de la caja" });
  await expect(ventasCajero.getByRole("row").filter({ hasText: servicio })).toHaveCount(2);
  await expect(ventasCajero).toContainText("AB123CD");
  // Decisión del negocio: en la caja no se ven totales, solo el efectivo en caja (10.000 + 25.000)
  await expect(pc.getByText(/total/i)).toHaveCount(0);
  await expect(pc.getByText(/50\.000/)).toHaveCount(0);
  await expect(pc.getByTestId("efectivo-en-caja")).toHaveText(/Efectivo en caja\s*\$\s?35\.000,00/);

  // Busca por patente: desde 3 caracteres, las ventas del turno con esa patente
  const buscar = ventasCajero.getByLabel("Buscar patente");
  await buscar.fill("ab 1");
  await expect(ventasCajero.getByRole("row").filter({ hasText: servicio })).toHaveCount(1);
  await expect(ventasCajero).toContainText("AB123CD");
  await buscar.fill("zz9");
  await expect(ventasCajero).toContainText(
    "No hay ventas en este turno con una patente que empiece con ZZ9.",
  );
  await buscar.fill("");

  // El cajero anula una venta suya en efectivo: queda quién, por qué, y el efectivo sale del cajón
  await pc.getByRole("tab", { name: "Ventas" }).click();
  await venderEnCaja(pc, { categoria, servicio, medio: "Efectivo", patente: "ZZ 999 YY" });
  await pc.getByRole("tab", { name: "Historial" }).click();
  await expect(pc.getByTestId("efectivo-en-caja")).toHaveText(/\$\s?60\.000,00/);
  const ventaZZ = ventasCajero.getByRole("row").filter({ hasText: "ZZ999YY" });
  await ventaZZ.getByRole("button", { name: /^Anular venta/ }).click();
  const anularCajero = pc.getByRole("dialog", { name: /^Anular venta/ });
  await anularCajero.getByLabel("Motivo").fill("Se cargó dos veces");
  await anularCajero.getByRole("button", { name: "Anular venta" }).click();
  await expect(pc.getByText(/^Venta N° \d+ anulada$/)).toBeVisible();
  await expect(ventaZZ).toContainText("Anulada");
  await expect(ventaZZ).toContainText("Se cargó dos veces");
  await expect(ventaZZ).toContainText(`Anuló: Cajero ${sufijo}`);
  await expect(ventaZZ.getByRole("button", { name: /^Anular venta/ })).toHaveCount(0);
  await expect(pc.getByTestId("efectivo-en-caja")).toHaveText(/\$\s?35\.000,00/);

  // --- Admin: ve el turno con sus totales
  await page.goto("/admin/ventas");
  const filaTurno = page
    .getByRole("region", { name: "Historial de turnos" })
    .getByRole("row")
    .filter({ hasText: caja });
  await expect(filaTurno).toContainText("Abierto");
  // Atendió el cajero; lo abrió el admin
  await expect(filaTurno).toContainText(`Cajero ${sufijo}`);
  await expect(filaTurno).toContainText("Ana Administradora");
  await expect(filaTurno).toContainText("50.000,00");
  await filaTurno.getByRole("link", { name: /^Ver turno/ }).click();
  await expect(page.getByTestId("total-Efectivo")).toHaveText(/25\.000,00/);
  await expect(page.getByTestId("total-Tarjeta")).toHaveText(/25\.000,00/);
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/50\.000,00/);
  // Efectivo de la caja: 10.000 inicial + 25.000 en efectivo
  await expect(page.getByTestId("efectivo-inicial")).toHaveText(/10\.000,00/);
  await expect(page.getByTestId("efectivo-en-caja")).toHaveText(/35\.000,00/);

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

  // --- Cajero: ve la anulación (sin totales)
  await pc.reload();
  await pc.getByRole("tab", { name: "Historial" }).click();
  await expect(ventasCajero.getByRole("row").filter({ hasText: "Anulada" })).toHaveCount(2);
  await expect(pc.getByTestId("efectivo-en-caja")).toHaveText(/\$\s?35\.000,00/);

  // --- Admin: cierra el turno desde el detalle ("Cerrar este turno"), sin totales en el diálogo
  await page.getByRole("button", { name: "Cerrar este turno" }).click();
  const cierre = page.getByRole("dialog", { name: "Cerrar turno" });
  await expect(cierre.getByText(/total|\$/i)).toHaveCount(0);
  await cierre.getByLabel("Observaciones (opcional)").fill("Sin novedades");
  await cierre.getByRole("button", { name: "Cerrar turno" }).click();
  await expect(page.getByText("Turno cerrado")).toBeVisible();

  // --- Admin: el turno figura cerrado, con las observaciones y el efectivo devuelto
  await page.reload();
  await expect(page.getByRole("heading", { name: new RegExp(caja) })).toContainText("Cerrado");
  await expect(page.getByText("Observaciones: Sin novedades")).toBeVisible();
  await expect(page.getByText("Efectivo devuelto al cerrar")).toBeVisible();
  await expect(page.getByTestId("efectivo-en-caja")).toHaveText(/35\.000,00/);

  // --- La caja se vuelve a abrir; el admin la cierra mientras el cajero trabaja en ella
  await abrirTurnoComoAdmin(page, { caja, efectivo: "5.000" });
  await trabajarEnCaja(pc, caja);
  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: caja })
    .filter({ hasText: "Abierto" })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  await page.getByRole("button", { name: "Cerrar este turno" }).click();
  const cierreAdmin = page.getByRole("dialog", { name: "Cerrar turno" });
  await cierreAdmin.getByRole("button", { name: "Cerrar turno" }).click();
  await expect(page.getByText("Turno cerrado")).toBeVisible();
  // El cajero, sin recargar, intenta vender: la BD lo rechaza y la pantalla vuelve a la elección
  // de caja con el aviso (sin la venta).
  await iniciarVentaEnCaja(pc, { categoria, servicio, medio: "Efectivo" });
  await expect(pc.getByRole("alert").filter({ hasText: caja })).toContainText("se cerró");
  await expect(pc.getByRole("tablist", { name: "Secciones de la caja" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/0,00/);
  await contextoCajero.close();
});

test("el admin abre una caja desde la barra (sin elegir quién atiende), se queda en el panel y va a la caja con 'Ir a la caja'", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const sufijo = unico();
  const caja = `Caja admin ${sufijo}`;
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const nuevaCaja = page.getByRole("dialog", { name: "Nueva caja" });
  await nuevaCaja.getByLabel("Nombre").fill(caja);
  await nuevaCaja.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();
  await ingresarEfectivo(page, "2.000", `Cambio ${sufijo}`);

  await page.getByRole("banner").getByRole("button", { name: "Abrir turno" }).click();
  const apertura = page.getByRole("dialog", { name: "Abrir turno" });
  await expect(apertura.getByLabel("Atiende")).toHaveCount(0);
  await apertura.getByLabel("Caja").click();
  await page.getByRole("option", { name: caja, exact: true }).click();
  await apertura.getByLabel("Efectivo inicial ($)").fill("2.000");
  await apertura.getByRole("button", { name: "Abrir turno" }).click();
  await expect(page.getByText(new RegExp(`^Turno abierto en “${caja}” con`))).toBeVisible();
  // Después de abrir no navega
  await expect(page).toHaveURL("/admin/fondos?pestana=efectivo");

  await page.getByRole("banner").getByRole("link", { name: "Ir a la caja" }).click();
  await expect(page).toHaveURL("/caja");
  await trabajarEnCaja(page, caja);

  // Cierra para no dejar la caja abierta
  await cerrarTurnoDesdeBarra(page, { caja });
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
