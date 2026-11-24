import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  CAJERO,
  cerrarTurnoDesdeBarra,
  confirmarVenta,
  conFuncion,
  escribirPatente,
  ingresar,
  ingresarEfectivo,
  trabajarEnCaja,
  unico,
} from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: RegExp | string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion }).click();
}

test("descuentos: el admin crea uno y lo habilita para un servicio; el cajero vende con ese descuento y pago mixto; se ve en el historial, en el turno y en las estadísticas", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const sufijo = unico();
  const caja = `Caja desc ${sufijo}`;
  const categoria = `Cat desc ${sufijo}`;
  const servicio = `Servicio desc ${sufijo}`;
  const otroServicio = `Otro desc ${sufijo}`;
  const descuento = `Desc ${sufijo}`;
  const cajero = { email: `cajerodesc${sufijo}@vtv.local`, password: "clave1234" };

  // --- Admin: un cajero, una caja y dos servicios propios de esta corrida
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nuevoUsuario = page.getByRole("dialog", { name: "Nuevo usuario" });
  await nuevoUsuario.getByLabel("Nombre").fill("Cajero");
  await nuevoUsuario.getByLabel("Apellido").fill(`Desc ${sufijo}`);
  await nuevoUsuario.getByLabel("Email").fill(cajero.email);
  await nuevoUsuario.getByLabel("Contraseña").fill(cajero.password);
  await conFuncion(page, "admin-usuarios", () =>
    nuevoUsuario.getByRole("button", { name: "Crear usuario" }).click(),
  );
  await expect(page.getByText(`Usuario Cajero Desc ${sufijo} creado`)).toBeVisible();

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
  for (const nombre of [servicio, otroServicio]) {
    await page.getByRole("button", { name: "Nuevo servicio" }).click();
    const nuevoServicio = page.getByRole("dialog", { name: "Nuevo servicio" });
    await nuevoServicio.getByLabel("Nombre").fill(nombre);
    await elegir(page, nuevoServicio, "Categoría", categoria);
    await nuevoServicio.getByLabel("Precio ($)").fill("20.000");
    await nuevoServicio.getByLabel("Usa hoja de certificado").click();
    await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
    await expect(page.getByText(`Servicio “${nombre}” creado`)).toBeVisible();
  }

  // --- Admin: crea el descuento (10 %) y lo habilita solo para un servicio
  await page
    .getByRole("navigation", { name: "Menú de administración" })
    .getByRole("link", { name: "Descuentos" })
    .click();
  await expect(page).toHaveURL("/admin/descuentos");
  await page.getByRole("button", { name: "Nuevo descuento" }).click();
  const nuevoDescuento = page.getByRole("dialog", { name: "Nuevo descuento" });
  await nuevoDescuento.getByLabel("Nombre").fill(descuento);
  await nuevoDescuento.getByLabel("Porcentaje (%)").fill("100");
  await nuevoDescuento.getByRole("button", { name: "Crear descuento" }).click();
  await expect(nuevoDescuento.getByText("El porcentaje tiene que ser menor a 100.")).toBeVisible();
  await nuevoDescuento.getByLabel("Porcentaje (%)").fill("10");
  await nuevoDescuento.getByRole("button", { name: "Crear descuento" }).click();
  await expect(page.getByText(`Descuento “${descuento}” creado`)).toBeVisible();
  const filaDescuento = page.getByTestId(`descuento-${descuento}`);
  await expect(filaDescuento).toContainText("10 %");
  await expect(filaDescuento.getByRole("cell").nth(3)).toHaveText("0");

  await filaDescuento.getByRole("button", { name: `Servicios del descuento ${descuento}` }).click();
  const disponibilidad = page.getByRole("dialog", { name: `Servicios de “${descuento}”` });
  const grupo = disponibilidad.getByTestId(`disponibilidad-${categoria}`);
  // El switch de la categoría prende los dos; se apaga uno y queda parcial
  await grupo.getByRole("switch", { name: `Todos los servicios de ${categoria}` }).click();
  await expect(grupo.getByRole("switch", { name: otroServicio })).toBeChecked();
  await grupo.getByRole("switch", { name: otroServicio }).click();
  await expect(grupo.getByText("Parcial: 1 de 2")).toBeVisible();
  await disponibilidad.getByRole("button", { name: "Guardar servicios" }).click();
  await expect(page.getByText(`Servicios de “${descuento}” guardados`)).toBeVisible();
  await expect(filaDescuento.getByRole("cell").nth(3)).toHaveText("1");

  // --- Admin: abre la caja
  await ingresarEfectivo(page, "20.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "10.000" });

  // --- Cajero: vende con el descuento y pago mixto (efectivo + tarjeta)
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, cajero);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await escribirPatente(pc, "AA111AA");
  await pc
    .getByRole("listbox", { name: "2. Categoría" })
    .getByRole("option", { name: categoria, exact: true })
    .click();

  // El servicio sin el descuento habilitado no ofrece el paso: va directo al medio de pago
  await pc
    .getByRole("listbox", { name: /^3\. Servicio/ })
    .getByRole("option", { name: new RegExp(`^${otroServicio}`) })
    .click();
  await expect(pc.getByRole("listbox", { name: "4. Medio de pago" })).toBeFocused();

  // Mientras tanto el admin le sube el precio: la BD rechaza la venta (precio esperado), la caja
  // relee el catálogo y deja al cajero en el medio de pago con el precio nuevo; no se registra nada.
  await page.goto("/admin/servicios");
  await page
    .getByTestId(`servicio-${otroServicio}`)
    .getByRole("button", { name: `Editar servicio ${otroServicio}` })
    .click();
  const editarServicio = page.getByRole("dialog", { name: "Editar servicio" });
  await editarServicio.getByLabel("Precio ($)").fill("25.000");
  await editarServicio.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId(`servicio-${otroServicio}`)).toContainText("25.000,00");

  await expect(pc.getByTestId("precio")).toHaveText(/\$\s?20\.000,00/);
  await pc.keyboard.press("2");
  await pc.keyboard.press("Enter");
  await confirmarVenta(pc, "AA111AA");
  await expect(pc.getByRole("alert")).toHaveText(
    /^El precio cambió: ahora es \$\s?25\.000,00\. Revisá la venta\.$/,
  );
  await expect(pc.getByRole("listbox", { name: "4. Medio de pago" })).toBeFocused();
  await expect(pc.getByTestId("precio")).toHaveText(/\$\s?25\.000,00/);
  // (Que no se registró lo confirma el total del turno más abajo: solo la venta con descuento.)
  // Vuelve a la patente (Esc: medio → servicios → categoría → patente) y empieza otra venta.
  await pc.keyboard.press("Escape");
  await expect(pc.getByRole("listbox", { name: /^3\. Servicio/ })).toBeFocused();
  await pc.keyboard.press("Escape");
  await expect(pc.getByRole("listbox", { name: "2. Categoría" })).toBeFocused();
  await pc.keyboard.press("Escape");
  // La patente de antes sigue escrita: se reemplaza
  await expect(pc.getByLabel("1. Patente")).toHaveValue("AA111AA");
  await escribirPatente(pc, "ac 456 bd");
  await pc
    .getByRole("listbox", { name: "2. Categoría" })
    .getByRole("option", { name: categoria, exact: true })
    .click();

  await pc
    .getByRole("listbox", { name: /^3\. Servicio/ })
    .getByRole("option", { name: new RegExp(`^${servicio}`) })
    .click();
  const descuentos = pc.getByRole("listbox", { name: `Descuento (opcional) · ${servicio}` });
  await expect(descuentos).toBeFocused();
  const opcionDescuento = descuentos.getByRole("option", { name: new RegExp(descuento) });
  await expect(opcionDescuento).toContainText(/−\$\s?2\.000,00/);
  await expect(opcionDescuento).toContainText(/\$\s?18\.000,00/);
  await opcionDescuento.click();
  await expect(pc.getByTestId("precio")).toHaveText(/\$\s?18\.000,00/);
  await expect(pc.getByRole("listbox", { name: "4. Medio de pago" })).toBeFocused();
  await pc.keyboard.press("4");
  await pc.keyboard.press("Enter");

  const efectivoMixto = pc.getByLabel("5. Pago mixto: ¿cuánto paga en efectivo? ($)");
  await expect(efectivoMixto).toBeFocused();
  await pc.keyboard.type("5.000");
  await expect(pc.getByTestId("resto-mixto")).toHaveText(/\$\s?13\.000,00/);
  await pc.keyboard.press("Enter");
  const resto = pc.getByRole("listbox", { name: "5. ¿Con qué paga el resto?" });
  await expect(resto).toBeFocused();
  await pc.keyboard.press("ArrowRight");
  await expect(resto.getByRole("option", { name: /Débito \/ Crédito/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await pc.keyboard.press("Enter");

  await expect(pc.getByLabel("6. ¿Cuánto te entregó en efectivo? ($)")).toBeFocused();
  await expect(pc.getByTestId("efectivo-a-cobrar")).toHaveText(/\$\s?5\.000,00/);
  await pc.keyboard.type("10000");
  await expect(pc.getByTestId("vuelto")).toHaveText(/\$\s?5\.000,00/);
  await pc.keyboard.press("Enter");
  await confirmarVenta(pc, "AC456BD");
  await expect(
    pc.getByText(new RegExp(`^Venta N° \\d+: ${servicio} · \\$\\s?18\\.000,00$`)),
  ).toBeVisible();
  const ultima = pc.getByTestId("ultima-venta");
  await expect(ultima).toContainText(`Descuento ${descuento}`);
  await expect(ultima).toContainText(/Efectivo \$\s?5\.000,00 \+ Tarjeta \$\s?13\.000,00/);
  await expect(ultima).toContainText(/Vuelto \$\s?5\.000,00/);

  // Historial del cajero: "Mixto" con el detalle y el descuento
  await pc.getByRole("tab", { name: "Historial" }).click();
  const filaCajero = pc
    .getByRole("region", { name: "Ventas de la caja" })
    .getByRole("row")
    .filter({ hasText: servicio });
  await expect(filaCajero).toContainText("AC456BD");
  await expect(filaCajero).toContainText(
    /Mixto\s*Efectivo \$\s?5\.000,00 \+ Tarjeta \$\s?13\.000,00/,
  );
  await expect(filaCajero).toContainText(descuento);
  await expect(filaCajero).toContainText(/−\$\s?2\.000,00 · lista \$\s?20\.000,00/);
  await expect(filaCajero).toContainText(/\$\s?18\.000,00/);
  await contextoCajero.close();

  // --- Admin: el detalle del turno muestra la venta y reparte los totales por medio
  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: caja })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  const filaAdmin = page.getByRole("row").filter({ hasText: servicio });
  await expect(filaAdmin).toContainText(
    /Mixto\s*Efectivo \$\s?5\.000,00 \+ Tarjeta \$\s?13\.000,00/,
  );
  await expect(filaAdmin).toContainText(descuento);
  await expect(filaAdmin).toContainText(/−\$\s?2\.000,00 · lista \$\s?20\.000,00/);
  await expect(page.getByTestId("total-Efectivo")).toHaveText(/5\.000,00/);
  await expect(page.getByTestId("total-Tarjeta")).toHaveText(/13\.000,00/);
  await expect(page.getByTestId("total-Total ventas")).toHaveText(/18\.000,00/);
  // Solo la parte en efectivo entra a la caja del turno: 10.000 inicial + 5.000
  await expect(page.getByTestId("efectivo-en-caja")).toHaveText(/15\.000,00/);

  // --- Admin: las estadísticas del mes cuentan la venta y lo descontado
  await page.goto("/admin/descuentos");
  const porDescuento = page.getByRole("region", { name: "Por descuento" });
  await expect(porDescuento.getByRole("row").filter({ hasText: descuento })).toContainText(
    /1\s*\$\s?2\.000,00/,
  );
  const porServicio = page.getByRole("region", { name: "Por servicio" });
  await expect(porServicio.getByRole("row").filter({ hasText: servicio })).toContainText(
    /1\s*\$\s?2\.000,00/,
  );
  await expect(page.getByTestId("estadisticas-cantidad")).not.toHaveText("0");

  await cerrarTurnoDesdeBarra(page, { caja });
});

test("el cajero no entra a la administración de descuentos", async ({ page }) => {
  await ingresar(page, CAJERO);
  await expect(page).toHaveURL("/caja");
  await page.goto("/admin/descuentos");
  await expect(page).not.toHaveURL("/admin/descuentos");
  await expect(page.getByRole("heading", { name: "Descuentos" })).toHaveCount(0);
});
