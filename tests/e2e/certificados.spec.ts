import { expect, type Page, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresar, unico } from "./utilidades";

async function elegir(
  page: Page,
  contenedor: ReturnType<Page["getByRole"]>,
  etiqueta: string,
  opcion: string,
) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

test("el admin gestiona certificados: alta, compra, ajuste, movimientos, edición y desactivación", async ({
  page,
}) => {
  // Flujo completo de punta a punta (~60 pasos contra la BD real): más que los 30 s por defecto.
  test.setTimeout(90_000);
  const sufijo = unico();
  const categoria = `Cat cert ${sufijo}`;
  const otraCategoria = `Cat otra ${sufijo}`;
  const servicioSuelto = `Serv suelto ${sufijo}`;
  const nombre = `Hoja ${sufijo}`;
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");

  // Destinos propios: cada corrida usa destinos nuevos (un solo certificado activo por destino).
  // Una categoría entera y un servicio suelto de otra categoría.
  await page.goto("/admin/servicios");
  for (const nombreCategoria of [categoria, otraCategoria]) {
    await page.getByRole("button", { name: "Nueva categoría" }).click();
    const dialogoCategoria = page.getByRole("dialog", { name: "Nueva categoría" });
    await dialogoCategoria.getByLabel("Nombre").fill(nombreCategoria);
    await dialogoCategoria.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.getByText(`Categoría “${nombreCategoria}” creada`)).toBeVisible();
  }
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const nuevoServicio = page.getByRole("dialog", { name: "Nuevo servicio" });
  await nuevoServicio.getByLabel("Nombre").fill(servicioSuelto);
  await elegir(page, nuevoServicio, "Categoría", otraCategoria);
  await nuevoServicio.getByLabel("Precio ($)").fill("15.000");
  await nuevoServicio.getByLabel("Usa hoja de certificado").click();
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicioSuelto}” creado`)).toBeVisible();

  // Alta
  await page.getByRole("link", { name: "Certificados" }).click();
  await expect(page.getByRole("heading", { name: "Certificados", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo certificado" }).click();
  const nuevo = page.getByRole("dialog", { name: "Nuevo certificado" });
  await nuevo.getByRole("button", { name: "Crear certificado" }).click();
  await expect(nuevo.getByText("Ingresá el nombre.")).toBeVisible();
  await expect(nuevo.getByText("Ingresá las hojas por unidad.")).toBeVisible();

  await nuevo.getByLabel("Nombre").fill(nombre);
  await nuevo.getByLabel("Hojas por unidad").fill("25");
  await nuevo.getByLabel("Stock mínimo (hojas)").fill("30");
  await nuevo.getByRole("button", { name: "Crear certificado" }).click();
  await expect(page.getByText(`Certificado “${nombre}” creado`)).toBeVisible();

  // Al crearlo se elige dónde se usa: una categoría entera + un servicio suelto de otra
  const destinos = page.getByRole("dialog", { name: `Dónde se usa “${nombre}”` });
  await expect(destinos.getByTestId("resumen-destinos")).toHaveText("Ningún servicio");
  await destinos.getByRole("switch", { name: `Toda la categoría ${categoria}` }).click();
  await destinos.getByRole("switch", { name: servicioSuelto, exact: true }).click();
  await expect(destinos.getByTestId("resumen-destinos")).toHaveText("1 categoría y 1 servicio");
  await destinos.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(`Guardado dónde se usa “${nombre}”`)).toBeVisible();
  await expect(destinos).toBeHidden();

  const fila = page.getByTestId(`certificado-${nombre}`);
  await expect(fila.locator('[data-columna="destinos"]')).toHaveText(
    `Categoría ${categoria}, ${servicioSuelto}`,
  );
  await expect(fila).toContainText("Caja de 25 hojas");
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("0");
  await expect(fila).toContainText("Sin stock");

  // Un solo certificado activo por destino: la BD lo explica con nombres
  await page.getByRole("button", { name: "Nuevo certificado" }).click();
  await nuevo.getByLabel("Nombre").fill(`${nombre} B`);
  await nuevo.getByLabel("Hojas por unidad").fill("10");
  await nuevo.getByRole("button", { name: "Crear certificado" }).click();
  const destinosB = page.getByRole("dialog", { name: `Dónde se usa “${nombre} B”` });
  await destinosB.getByRole("switch", { name: `Toda la categoría ${categoria}` }).click();
  await destinosB.getByRole("button", { name: "Guardar" }).click();
  await expect(destinosB.getByRole("alert")).toHaveText(
    `La categoría "${categoria}" ya usa el certificado activo "${nombre}". Desactivalo o quitale esa categoría antes.`,
  );
  await page.keyboard.press("Escape");
  await expect(destinosB).toBeHidden();
  await expect(
    page.getByTestId(`certificado-${nombre} B`).locator('[data-columna="destinos"]'),
  ).toContainText("Sin asignar");

  // Compra: 2 cajas × $50.000 → 50 hojas a $2.000
  await fila.getByRole("button", { name: `Registrar compra de ${nombre}` }).click();
  const compra = page.getByRole("dialog", { name: "Registrar compra" });
  await compra.getByLabel("Cantidad de cajas").fill("2");
  await expect(compra.getByTestId("hojas-que-entran")).toHaveText("Entran 50 hojas al stock.");
  await compra.getByLabel("Costo por caja ($)").fill("50.000");
  await elegir(page, compra, "Se pagó con", "Transferencia");
  await compra.getByLabel("Proveedor (opcional)").fill(`Imprenta ${sufijo}`);
  await compra.getByRole("button", { name: "Registrar compra" }).click();
  await expect(
    page.getByText(`Compra registrada: 50 hojas de “${nombre}” por $ 100.000,00`),
  ).toBeVisible();
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("50");
  await expect(fila.locator('[data-columna="costo"]')).toHaveText("$ 2.000,00");
  await expect(fila.locator('[data-columna="valor"]')).toHaveText("$ 100.000,00");
  await expect(fila).toContainText("OK");
  await expect(page.getByRole("row").filter({ hasText: `Imprenta ${sufijo}` })).toContainText(
    "$ 100.000,00",
  );

  // Ajuste: validación local y luego restar 25 → stock bajo (25 ≤ 30)
  await fila.getByRole("button", { name: `Ajuste de stock de ${nombre}` }).click();
  const ajuste = page.getByRole("dialog", { name: "Ajustar stock" });
  await ajuste.getByLabel("Cantidad de hojas").fill("51");
  await ajuste.getByRole("button", { name: "Ajustar stock" }).click();
  await expect(
    ajuste.getByText("No podés restar más hojas que el stock actual (50)."),
  ).toBeVisible();
  await expect(ajuste.getByText("Escribí una nota.")).toBeVisible();
  await ajuste.getByLabel("Cantidad de hojas").fill("25");
  await ajuste.getByLabel("Motivo").fill("Hojas rotas");
  await ajuste.getByRole("button", { name: "Ajustar stock" }).click();
  await expect(page.getByText(`Stock de “${nombre}” ajustado: quedan 25 hojas`)).toBeVisible();
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("25");
  await expect(fila).toContainText("Stock bajo");
  await expect(fila.locator('[data-columna="valor"]')).toHaveText("$ 50.000,00");

  // Movimientos (kardex)
  await fila.getByRole("link", { name: `Movimientos de ${nombre}` }).click();
  await expect(page.getByRole("heading", { name: `Movimientos de ${nombre}` })).toBeVisible();
  await expect(page.getByTestId("stock-actual")).toHaveText("25");
  const movimientos = page.locator('[data-testid^="movimiento-"]');
  await expect(movimientos).toHaveCount(2);
  await expect(movimientos.nth(0)).toContainText("Ajuste");
  await expect(movimientos.nth(0)).toContainText("-25");
  await expect(movimientos.nth(0)).toContainText("Hojas rotas");
  await expect(movimientos.nth(1)).toContainText("Compra");
  await expect(movimientos.nth(1)).toContainText("+50");
  await page.getByRole("link", { name: "Volver a certificados" }).click();

  // Editar: el stock mínimo nuevo cambia el estado (25 > 20 → OK)
  await fila.getByRole("button", { name: `Editar certificado ${nombre}` }).click();
  const edicion = page.getByRole("dialog", { name: "Editar certificado" });
  await expect(edicion.getByLabel("Nombre")).toHaveValue(nombre);
  await edicion.getByLabel("Stock mínimo (hojas)").fill("20");
  await edicion.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Cambios guardados")).toBeVisible();
  await expect(fila).toContainText("mínimo 20");
  await expect(fila).toContainText("OK");

  // Desactivar: no se registran compras
  await fila.getByRole("switch", { name: `Certificado ${nombre} activo` }).click();
  await expect(page.getByText(`Certificado “${nombre}” desactivado`)).toBeVisible();
  await expect(fila.getByRole("button", { name: `Registrar compra de ${nombre}` })).toBeDisabled();
  await expect(fila).toContainText("Desactivado: activalo para registrar compras.");
});

test("el admin edita la última compra: se revierte la original y se registra la corregida", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const sufijo = unico();
  const categoria = `Cat compra ${sufijo}`;
  const nombre = `Hoja compra ${sufijo}`;
  const proveedor = `Imprenta ${sufijo}`;
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");

  await page.goto("/admin/servicios");
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const dialogoCategoria = page.getByRole("dialog", { name: "Nueva categoría" });
  await dialogoCategoria.getByLabel("Nombre").fill(categoria);
  await dialogoCategoria.getByRole("button", { name: "Crear categoría" }).click();
  await expect(page.getByText(`Categoría “${categoria}” creada`)).toBeVisible();

  await page.goto("/admin/certificados");
  await page.getByRole("button", { name: "Nuevo certificado" }).click();
  const nuevo = page.getByRole("dialog", { name: "Nuevo certificado" });
  await nuevo.getByLabel("Nombre").fill(nombre);
  await nuevo.getByLabel("Hojas por unidad").fill("25");
  await nuevo.getByRole("button", { name: "Crear certificado" }).click();
  await expect(page.getByText(`Certificado “${nombre}” creado`)).toBeVisible();
  const destinos = page.getByRole("dialog", { name: `Dónde se usa “${nombre}”` });
  await destinos.getByRole("switch", { name: `Toda la categoría ${categoria}` }).click();
  await destinos.getByRole("button", { name: "Guardar" }).click();
  await expect(destinos).toBeHidden();
  const fila = page.getByTestId(`certificado-${nombre}`);

  // Compra con un error de carga: 2 cajas × $50.000
  await fila.getByRole("button", { name: `Registrar compra de ${nombre}` }).click();
  const compra = page.getByRole("dialog", { name: "Registrar compra" });
  await compra.getByLabel("Cantidad de cajas").fill("2");
  await compra.getByLabel("Costo por caja ($)").fill("50.000");
  await elegir(page, compra, "Se pagó con", "Transferencia");
  await compra.getByLabel("Proveedor (opcional)").fill(proveedor);
  await compra.getByRole("button", { name: "Registrar compra" }).click();
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("50");

  // Editar: eran 3 cajas × $40.000
  const original = page.getByRole("row").filter({ hasText: proveedor });
  await original.getByRole("button", { name: /^Editar compra #/ }).click();
  const edicion = page.getByRole("dialog", { name: /^Editar compra #/ });
  await expect(edicion.getByLabel("Cantidad de cajas")).toHaveValue("2");
  await edicion.getByRole("button", { name: "Guardar corrección" }).click();
  await expect(edicion.getByText("Escribí el motivo de la corrección.")).toBeVisible();
  await edicion.getByLabel("Cantidad de cajas").fill("3");
  await expect(edicion.getByTestId("hojas-que-entran")).toHaveText("Entran 75 hojas al stock.");
  await edicion.getByLabel("Costo por caja ($)").fill("40.000");
  await edicion.getByLabel("Motivo de la corrección").fill("Se cargó mal la cantidad");
  await edicion.getByRole("button", { name: "Guardar corrección" }).click();
  await expect(
    page.getByText(`Compra corregida: 75 hojas de “${nombre}” por $ 120.000,00`),
  ).toBeVisible();

  // Stock y costo como si la original nunca hubiera existido
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("75");
  await expect(fila.locator('[data-columna="costo"]')).toHaveText("$ 1.600,00");
  await expect(fila.locator('[data-columna="valor"]')).toHaveText("$ 120.000,00");

  // La original queda tachada y la corregida es la editable
  const filasCompra = page
    .getByRole("region", { name: "Últimas compras" })
    .getByRole("row")
    .filter({ hasText: nombre });
  await expect(filasCompra).toHaveCount(2);
  await expect(filasCompra.filter({ hasText: "Corregida" })).toContainText(
    "Se cargó mal la cantidad",
  );
  await expect(filasCompra.filter({ hasText: "Corregida" }).getByRole("button")).toHaveCount(0);
  const corregida = filasCompra.filter({ hasNotText: "Corregida" });
  await expect(corregida).toContainText("$ 120.000,00");
  await expect(corregida.getByRole("button", { name: /^Editar compra #/ })).toBeVisible();

  // Después de un ajuste ya no se puede editar
  await fila.getByRole("button", { name: `Ajuste de stock de ${nombre}` }).click();
  const ajuste = page.getByRole("dialog", { name: "Ajustar stock" });
  await ajuste.getByLabel("Cantidad de hojas").fill("1");
  await ajuste.getByLabel("Motivo").fill("Rotura");
  await ajuste.getByRole("button", { name: "Ajustar stock" }).click();
  await expect(fila.locator('[data-columna="stock"]')).toHaveText("74");
  await expect(corregida.getByRole("button", { name: /^Editar compra #/ })).toHaveCount(0);

  // Kardex: compra, reversión, compra corregida y ajuste
  await fila.getByRole("link", { name: `Movimientos de ${nombre}` }).click();
  const movimientos = page.locator('[data-testid^="movimiento-"]');
  await expect(movimientos).toHaveCount(4);
  await expect(movimientos.nth(0)).toContainText("Ajuste");
  await expect(movimientos.nth(1)).toContainText("+75");
  await expect(movimientos.nth(2)).toContainText("Compra corregida");
  await expect(movimientos.nth(2)).toContainText("-50");
  await expect(movimientos.nth(2)).toContainText("Se cargó mal la cantidad");
  await expect(movimientos.nth(3)).toContainText("+50");
});

test("un id de certificado inexistente muestra un aviso", async ({ page }) => {
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/certificados/999999999");
  await expect(page.getByText("El certificado no existe.")).toBeVisible();
});

test("el cajero no entra a certificados", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  await page.goto("/admin/certificados");
  await expect(page).not.toHaveURL("/admin/certificados");
  await expect(page.getByRole("heading", { name: "Certificados" })).toHaveCount(0);
});
