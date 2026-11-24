import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  cerrarTurnoDesdeBarra,
  cobrarYConfirmar,
  confirmarVenta,
  escribirPatente,
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

async function crearServicio(
  page: Page,
  { nombre, categoria }: { nombre: string; categoria: string },
) {
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo servicio" });
  await dialogo.getByLabel("Nombre").fill(nombre);
  await elegir(page, dialogo, "Categoría", categoria);
  await dialogo.getByLabel("Precio ($)").fill("71.000");
  await dialogo.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${nombre}” creado`)).toBeVisible();
}

/** Certificado con 10 hojas que se usa solo en `servicio` (el condicional, con 30 días para volver). */
async function crearCertificado(
  page: Page,
  {
    nombre,
    servicio,
    condicional = false,
  }: { nombre: string; servicio: string; condicional?: boolean },
) {
  await page.getByRole("button", { name: "Nuevo certificado" }).click();
  const nuevo = page.getByRole("dialog", { name: "Nuevo certificado" });
  await nuevo.getByLabel("Nombre").fill(nombre);
  await nuevo.getByLabel("Hojas por unidad").fill("10");
  if (condicional) {
    await nuevo.getByRole("switch", { name: "Es un certificado de condicional" }).click();
    await expect(nuevo.getByLabel("Días para volver")).toHaveValue("30");
  }
  await nuevo.getByRole("button", { name: "Crear certificado" }).click();
  const destinos = page.getByRole("dialog", { name: `Dónde se usa “${nombre}”` });
  await destinos.getByRole("switch", { name: servicio, exact: true }).click();
  await destinos.getByRole("button", { name: "Guardar" }).click();
  await expect(destinos).toBeHidden();
  const fila = page.getByTestId(`certificado-${nombre}`);
  await fila.getByRole("button", { name: `Ajuste de stock de ${nombre}` }).click();
  const ajuste = page.getByRole("dialog", { name: "Ajustar stock" });
  await elegir(page, ajuste, "Tipo de ajuste", "Sumar hojas");
  await ajuste.getByLabel("Cantidad de hojas").fill("10");
  await ajuste.getByLabel("Motivo").fill("Stock inicial");
  await ajuste.getByRole("button", { name: "Ajustar stock" }).click();
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("10");
}

test("condicional con certificado B: total o 50%; al volver, el servicio cobra lo que faltaba con la hoja E; la patente muestra todo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const sufijo = unico();
  const caja = `Caja cond ${sufijo}`;
  const categoria = `Cat cond ${sufijo}`;
  const servicio = `Auto ${sufijo}`;
  const hojaAprobado = `Hoja E ${sufijo}`;
  const hojaCondicional = `Hoja B ${sufijo}`;
  const patente = `C${sufijo.slice(-7)}`;
  const patenteMitad = `M${sufijo.slice(-7)}`;

  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const nuevaCaja = page.getByRole("dialog", { name: "Nueva caja" });
  await nuevaCaja.getByLabel("Nombre").fill(caja);
  await nuevaCaja.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();

  // Un solo servicio
  await page.goto("/admin/servicios");
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const nuevaCategoria = page.getByRole("dialog", { name: "Nueva categoría" });
  await nuevaCategoria.getByLabel("Nombre").fill(categoria);
  await nuevaCategoria.getByRole("button", { name: "Crear categoría" }).click();
  await expect(page.getByText(`Categoría “${categoria}” creada`)).toBeVisible();
  await crearServicio(page, { nombre: servicio, categoria });

  // Dos certificados para el mismo servicio: E (el de siempre) y B (condicional, 30 días)
  await page.goto("/admin/certificados");
  await crearCertificado(page, { nombre: hojaAprobado, servicio });
  await crearCertificado(page, { nombre: hojaCondicional, servicio, condicional: true });
  await expect(page.getByTestId(`certificado-${hojaCondicional}`)).toContainText(
    "Condicional · vuelve dentro de 30 días",
  );

  // Caja abierta; el admin vende
  await ingresarEfectivo(page, "5.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "5.000" });
  await trabajarEnCaja(page, caja);

  // 1) No aprueba: el servicio con el certificado B, pagado completo ($ 71.000)
  await venderEnCaja(page, {
    categoria,
    servicio,
    medio: "Tarjeta",
    patente,
    certificado: "condicional",
    pagoCondicional: "Total",
  });
  await expect(
    page.getByText(
      new RegExp(`^Venta N° \\d+: ${servicio} · \\$\\s?71\\.000,00 \\(condicional\\)$`),
    ),
  ).toBeVisible();

  // 2) Vuelve y aprueba: la caja lo detecta con la patente (primer paso) y es sin cargo
  await escribirPatente(page, patente.toLowerCase());
  const vuelta = page.getByTestId("paso-condicional");
  await expect(vuelta).toContainText(`“${servicio}”`);
  await expect(vuelta).toContainText(`certificado “${hojaCondicional}”`);
  await expect(vuelta).toContainText("Pagó el total: la vuelta es sin cargo.");
  await expect(page.getByRole("listbox", { name: "Vuelve de condicional" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("precio")).toHaveText(/\$\s?0,00/);
  await confirmarVenta(page, patente);
  await expect(
    page.getByText(
      new RegExp(`^Venta N° \\d+: ${servicio} · \\$\\s?0,00 \\(vuelta de condicional\\)$`),
    ),
  ).toBeVisible();
  await expect(page.getByTestId("ultima-venta")).toContainText("Vuelta de condicional: sin cargo.");

  // 3) Ya usó la vuelta: con el certificado de siempre se cobra entero
  await venderEnCaja(page, {
    categoria,
    servicio,
    medio: "Tarjeta",
    patente,
    certificado: "aprobado",
  });
  await expect(
    page.getByText(new RegExp(`^Venta N° \\d+: ${servicio} · \\$\\s?71\\.000,00$`)),
  ).toBeVisible();

  // 4) Otra patente: condicional al 50% ($ 35.500 ahora) …
  await venderEnCaja(page, {
    categoria,
    servicio,
    medio: "Efectivo",
    patente: patenteMitad,
    certificado: "condicional",
    pagoCondicional: "50%",
  });
  await expect(
    page.getByText(
      new RegExp(`^Venta N° \\d+: ${servicio} · \\$\\s?35\\.500,00 \\(condicional al 50%\\)$`),
    ),
  ).toBeVisible();
  await expect(page.getByTestId("ultima-venta")).toContainText(
    /Condicional al 50%: al volver paga \$\s?35\.500,00\./,
  );

  // … y al volver aprobado paga el 50% que faltaba
  await escribirPatente(page, patenteMitad);
  await expect(page.getByTestId("paso-condicional")).toContainText(/faltan \$\s?35\.500,00/);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("precio")).toHaveText(/\$\s?35\.500,00/);
  await cobrarYConfirmar(page, { medio: "Transferencia", patente: patenteMitad });
  await expect(
    page.getByText(
      new RegExp(`^Venta N° \\d+: ${servicio} · \\$\\s?35\\.500,00 \\(vuelta de condicional\\)$`),
    ),
  ).toBeVisible();

  // El historial de la caja marca la condicional y la vuelta
  await page.getByRole("tab", { name: "Historial" }).click();
  const historial = page.getByRole("region", { name: "Ventas de la caja" });
  await expect(historial.getByText("Vuelta de condicional").first()).toBeVisible();
  await expect(
    historial.getByText(/^Condicional hasta \d{2}\/\d{2}\/\d{4}$/).first(),
  ).toBeVisible();
  await expect(historial.getByText(/^Al 50%: al volver paga \$\s?35\.500,00$/)).toBeVisible();

  // Stock: las condicionales descontaron la B; las vueltas y la venta común, la E
  await page.goto("/admin/certificados");
  await expect(
    page.getByTestId(`certificado-${hojaCondicional}`).locator('[data-columna="stock"]'),
  ).toHaveText("8");
  await expect(
    page.getByTestId(`certificado-${hojaAprobado}`).locator('[data-columna="stock"]'),
  ).toHaveText("7");

  // Búsqueda por patente: las tres ventas con servicio y certificado entregado
  await page.getByRole("navigation").getByRole("link", { name: "Patentes" }).click();
  await page.getByLabel("Patente").fill(patente);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByTestId("cantidad-ventas-patente")).toHaveText("3 ventas");
  const filas = page.locator('[data-testid^="venta-patente-"]');
  await expect(filas.nth(0)).toContainText(hojaAprobado);
  await expect(filas.nth(0)).toContainText(/\$\s?71\.000,00/);
  await expect(filas.nth(1)).toContainText(hojaAprobado);
  await expect(filas.nth(1)).toContainText(/Vuelta sin cargo de la N° \d+/);
  await expect(filas.nth(2)).toContainText(servicio);
  await expect(filas.nth(2)).toContainText(hojaCondicional);
  await expect(filas.nth(2)).toContainText(/Volvió: venta N° \d+/);

  // La del 50%: lo pagado y la vuelta que pagó el resto
  await page.getByLabel("Patente").fill(patenteMitad);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByTestId("cantidad-ventas-patente")).toHaveText("2 ventas");
  await expect(filas.nth(0)).toContainText(/Vuelta: pagó el 50% restante de la N° \d+/);
  await expect(filas.nth(1)).toContainText(/Pagó el 50%: faltan \$\s?35\.500,00/);

  await cerrarTurnoDesdeBarra(page, { caja });
});
