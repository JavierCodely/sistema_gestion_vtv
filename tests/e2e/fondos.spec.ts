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

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: RegExp | string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion }).click();
}

const normal = (texto: string | null) => (texto ?? "").replace(/\s/g, " ").trim();
const moneda = (valor: number) =>
  normal(new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(valor));

/** "$ 1.234,50" / "-$ 2.500,00" → número. Solo para comparar en la prueba lo que mostró la pantalla. */
function aNumero(texto: string | null): number {
  const limpio = normal(texto)
    .replace(/[^\d,-]/g, "")
    .replace(",", ".");
  return Number(limpio);
}

async function leer(page: Page, testId: string): Promise<number> {
  const celda = page.getByTestId(testId);
  await expect(celda).toHaveText(/\d/);
  return aNumero(await celda.textContent());
}

/** Espera que la tarjeta muestre `valor` (los resúmenes se releen tras cada operación). */
async function esperarMonto(page: Page, testId: string, valor: number) {
  await expect
    .poll(async () => normal(await page.getByTestId(testId).textContent()))
    .toBe(moneda(valor));
}

test("fondos: ventas por transferencia, tarjeta y mixta, un gasto y un saldo inicial se ven en cada pestaña; un retiro mayor al saldo se rechaza", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const sufijo = unico();
  const caja = `Caja fondos ${sufijo}`;
  const categoria = `Cat fondos ${sufijo}`;
  const servicio = `Servicio fondos ${sufijo}`;
  const subcategoria = `Sub fondos ${sufijo}`;
  const notaGasto = `Gasto transferencia ${sufijo}`;
  const notaSaldo = `Saldo banco ${sufijo}`;
  const patente = (letra: string) => `F${letra}${sufijo.slice(-5)}`;
  const [patenteTransferencia, patenteTarjeta, patenteMixta] = ["T", "J", "M"].map(patente);

  // --- Admin: caja, servicio de $ 20.000, subcategoría de gasto y la caja abierta
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
  await nuevoServicio.getByLabel("Precio ($)").fill("20.000");
  await nuevoServicio.getByLabel("Usa hoja de certificado").click();
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();

  await page.goto("/admin/gastos");
  await page.getByTestId("rubro-Varios").getByRole("button", { name: "Subcategoría" }).click();
  const nuevaSub = page.getByRole("dialog", { name: "Nueva subcategoría" });
  await nuevaSub.getByLabel("Nombre").fill(subcategoria);
  await nuevaSub.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(`Categoría «${subcategoria}» creada`)).toBeVisible();

  await ingresarEfectivo(page, "5.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "5.000" });

  // --- Admin: lo que hay antes en Fondos (otras pruebas también mueven las cuentas)
  await page.goto("/admin/fondos");
  await expect(page.getByRole("heading", { name: "Fondos", level: 1 })).toBeVisible();
  const antes = {
    transferenciaSaldo: await leer(page, "resumen-transferencia-saldo"),
    transferenciaIngresos: await leer(page, "resumen-transferencia-ingresos"),
    transferenciaEgresos: await leer(page, "resumen-transferencia-egresos"),
    tarjetaSaldo: await leer(page, "resumen-tarjeta-saldo"),
    tarjetaIngresos: await leer(page, "resumen-tarjeta-ingresos"),
  };
  await page.getByRole("tab", { name: "Mixto" }).click();
  await expect(page).toHaveURL("/admin/fondos?pestana=mixto");
  const mixtasAntes = await leer(page, "mixtas-cantidad");

  // --- Cajero: una venta por transferencia, una con tarjeta y una mixta (transferencia + tarjeta)
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await venderEnCaja(pc, {
    categoria,
    servicio,
    medio: "Transferencia",
    patente: patenteTransferencia,
  });
  await venderEnCaja(pc, { categoria, servicio, medio: "Tarjeta", patente: patenteTarjeta });

  await pc
    .getByRole("listbox", { name: "1. Categoría" })
    .getByRole("option", { name: categoria, exact: true })
    .click();
  await pc
    .getByRole("listbox", { name: /^2\. Servicio/ })
    .getByRole("option", { name: new RegExp(`^${servicio}`) })
    .click();
  await expect(pc.getByLabel("3. Patente (opcional)")).toBeFocused();
  await pc.keyboard.type(patenteMixta);
  await pc.keyboard.press("Enter");
  await expect(pc.getByRole("listbox", { name: "4. Medio de pago" })).toBeFocused();
  await pc.keyboard.press("4");
  await pc.keyboard.press("Enter");
  await pc.getByLabel("Transferencia ($)").fill("8.000");
  await pc.getByLabel("Tarjeta ($)").fill("12.000");
  await expect(pc.getByText("Cierra justo")).toBeVisible();
  await pc.keyboard.press("Enter");
  // (Los avisos de las ventas anteriores pueden seguir en pantalla: se mira la "Última venta".)
  const ultima = pc.getByTestId("ultima-venta");
  await expect(ultima).toContainText(servicio);
  await expect(ultima).toContainText(/Transferencia \$\s?8\.000,00 \+ Tarjeta \$\s?12\.000,00/);
  await contextoCajero.close();

  // --- Admin: un gasto por transferencia ($ 3.000) desde Gastos
  await page.goto("/admin/gastos");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  const gasto = page.getByRole("dialog", { name: "Registrar gasto" });
  await elegir(page, gasto, "Categoría", subcategoria);
  await gasto.getByLabel("Monto ($)").fill("3.000");
  await elegir(page, gasto, "Pagado con", "Transferencia");
  await gasto.getByLabel("Nota").fill(notaGasto);
  await gasto.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page.getByText(/^Gasto de \$\s?3\.000,00 registrado$/)).toBeVisible();

  // --- Admin: saldo inicial de transferencias ($ 50.000) desde Fondos
  await page.goto("/admin/fondos?pestana=transferencia");
  await expect(page.getByRole("tab", { name: "Transferencia" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Saldo inicial" }).click();
  const saldoInicial = page.getByRole("dialog", { name: "Saldo inicial" });
  await saldoInicial.getByRole("button", { name: "Guardar" }).click();
  await expect(saldoInicial.getByText("Ingresá un monto.")).toBeVisible();
  await saldoInicial.getByLabel("Monto ($)").fill("50.000");
  await saldoInicial.getByLabel("Nota").fill(notaSaldo);
  await saldoInicial.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Saldo inicial registrado en transferencias.")).toBeVisible();

  // --- Totales: transferencia +20.000 (venta) +8.000 (mixta) +50.000 (saldo inicial) −3.000 (gasto)
  await esperarMonto(
    page,
    "resumen-transferencia-ingresos",
    antes.transferenciaIngresos + 20_000 + 8_000 + 50_000,
  );
  await esperarMonto(page, "resumen-transferencia-egresos", antes.transferenciaEgresos + 3_000);
  await esperarMonto(page, "resumen-transferencia-saldo", antes.transferenciaSaldo + 75_000);
  await esperarMonto(page, "saldo-transferencia", antes.transferenciaSaldo + 75_000);
  // Tarjeta: +20.000 (venta) +12.000 (mixta)
  await esperarMonto(page, "resumen-tarjeta-ingresos", antes.tarjetaIngresos + 32_000);
  await esperarMonto(page, "resumen-tarjeta-saldo", antes.tarjetaSaldo + 32_000);

  // --- Libro de transferencias: cada movimiento con su signo y la mixta marcada
  await expect(page.getByTestId("periodo-libro-transferencia")).toHaveText(
    /^Del \d{2}\/\d{2}\/\d{4} al \d{2}\/\d{2}\/\d{4}$/,
  );
  const libro = page.getByRole("region", { name: "Movimientos de Transferencia" });
  const ventaTransferencia = libro.getByRole("row").filter({ hasText: patenteTransferencia });
  await expect(ventaTransferencia).toContainText("Venta");
  await expect(ventaTransferencia).toContainText(caja);
  await expect(ventaTransferencia).toContainText(/\+\$\s?20\.000,00/);
  const ventaMixta = libro.getByRole("row").filter({ hasText: patenteMixta });
  await expect(ventaMixta).toContainText("Mixto");
  await expect(ventaMixta).toContainText(/\+\$\s?8\.000,00/);
  const filaGasto = libro.getByRole("row").filter({ hasText: notaGasto });
  await expect(filaGasto).toContainText("Gasto");
  await expect(filaGasto).toContainText(subcategoria);
  await expect(filaGasto).toContainText(/−\$\s?3\.000,00/);
  const filaSaldo = libro.getByRole("row").filter({ hasText: notaSaldo });
  await expect(filaSaldo).toContainText("Manual");
  await expect(filaSaldo).toContainText(/\+\$\s?50\.000,00/);
  await expect(libro.getByRole("row").filter({ hasText: patenteTarjeta })).toHaveCount(0);

  // --- Un retiro mayor al saldo se rechaza con el mensaje de la BD
  await page.getByRole("button", { name: "Retiro" }).click();
  const retiro = page.getByRole("dialog", { name: "Retiro" });
  await retiro.getByLabel("Monto ($)").fill("9.000.000.000");
  await retiro.getByLabel("Nota").fill(`Retiro imposible ${sufijo}`);
  await retiro.getByRole("button", { name: "Guardar" }).click();
  await expect(retiro.getByText(/^No alcanza el saldo de transferencias/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(retiro).toBeHidden();
  await expect(
    libro.getByRole("row").filter({ hasText: `Retiro imposible ${sufijo}` }),
  ).toHaveCount(0);

  // --- Crédito/Débito: la venta con tarjeta y la parte de la mixta
  await page.getByRole("tab", { name: "Crédito/Débito" }).click();
  await expect(page).toHaveURL("/admin/fondos?pestana=tarjeta");
  const libroTarjeta = page.getByRole("region", { name: "Movimientos de Crédito/Débito" });
  await expect(libroTarjeta.getByRole("row").filter({ hasText: patenteTarjeta })).toContainText(
    /\+\$\s?20\.000,00/,
  );
  const mixtaTarjeta = libroTarjeta.getByRole("row").filter({ hasText: patenteMixta });
  await expect(mixtaTarjeta).toContainText("Mixto");
  await expect(mixtaTarjeta).toContainText(/\+\$\s?12\.000,00/);
  await expect(libroTarjeta.getByRole("row").filter({ hasText: patenteTransferencia })).toHaveCount(
    0,
  );

  // --- Efectivo: la caja de cambio, con el efectivo inicial del turno
  await page.getByRole("tab", { name: "Efectivo" }).click();
  const libroEfectivo = page.getByRole("region", { name: "Movimientos de Efectivo" });
  await expect(libroEfectivo.getByRole("row").filter({ hasText: `(${caja})` })).toContainText(
    /−\$\s?5\.000,00/,
  );
  await expect(
    libroEfectivo.getByRole("row").filter({ hasText: patenteTransferencia }),
  ).toHaveCount(0);

  // --- Mixto: aviso, una venta más y su reparto
  await page.getByRole("tab", { name: "Mixto" }).click();
  await expect(page.getByTestId("aviso-mixto")).toContainText(
    "Ya están incluidas en las otras pestañas",
  );
  await expect
    .poll(async () => aNumero(await page.getByTestId("mixtas-cantidad").textContent()))
    .toBe(mixtasAntes + 1);
  const filaMixta = page
    .getByRole("region", { name: "Ventas con pago mixto" })
    .getByRole("row")
    .filter({ hasText: patenteMixta });
  await expect(filaMixta).toContainText(caja);
  await expect(filaMixta).toContainText(/\$\s?8\.000,00/);
  await expect(filaMixta).toContainText(/\$\s?12\.000,00/);
  await expect(filaMixta).toContainText(/\$\s?20\.000,00/);

  // --- La pestaña elegida se recuerda al volver a entrar
  await page.goto("/admin/gastos");
  await page
    .getByRole("navigation", { name: "Menú de administración" })
    .getByRole("link", { name: "Fondos" })
    .click();
  await expect(page.getByRole("tab", { name: "Mixto" })).toHaveAttribute("aria-selected", "true");

  // La dirección vieja abre la pestaña Efectivo.
  await page.goto("/admin/efectivo");
  await expect(page).toHaveURL("/admin/fondos?pestana=efectivo");
  await expect(page.getByRole("tab", { name: "Efectivo" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await cerrarTurnoDesdeBarra(page, { caja });
});
