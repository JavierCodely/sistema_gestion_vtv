import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  CAJERO,
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

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

test("estadísticas: vehículos distintos por tipo, horarios y año contra año", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const sufijo = unico();
  const caja = `Caja est ${sufijo}`;
  const categoria = `Cat est ${sufijo}`;
  const servicio = `Auto est ${sufijo}`;
  // Dos ventas a la misma patente y una a otra: 3 ventas, 2 vehículos en la categoría.
  const patente1 = `E${sufijo.slice(-8)}A`;
  const patente2 = `E${sufijo.slice(-8)}B`;

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
  const dialogo = page.getByRole("dialog", { name: "Nuevo servicio" });
  await dialogo.getByLabel("Nombre").fill(servicio);
  await elegir(page, dialogo, "Categoría", categoria);
  await dialogo.getByLabel("Precio ($)").fill("20.000");
  await dialogo.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();

  await ingresarEfectivo(page, "5.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "5.000" });
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await venderEnCaja(pc, { categoria, servicio, medio: "Transferencia", patente: patente1 });
  await venderEnCaja(pc, { categoria, servicio, medio: "Transferencia", patente: patente1 });
  await venderEnCaja(pc, { categoria, servicio, medio: "Transferencia", patente: patente2 });
  await contextoCajero.close();

  // --- Desde el menú
  await page.goto("/admin");
  await page
    .getByRole("navigation", { name: "Menú de administración" })
    .getByRole("link", { name: "Estadísticas" })
    .click();
  await expect(page).toHaveURL("/admin/estadisticas");
  await expect(page.getByRole("heading", { name: "Estadísticas", level: 1 })).toBeVisible();

  // Por defecto, el año actual (sin turno)
  const ahora = new Date();
  const anio = String(ahora.getFullYear());
  await expect(page.getByRole("heading", { name: `Año ${anio}` })).toBeVisible();
  await expect(page.getByTestId("estadisticas-rango")).toHaveText(
    `Del 01/01/${anio} al 31/12/${anio}`,
  );
  await expect(page.getByLabel("Turno", { exact: true })).toHaveCount(0);

  // Tipo de vehículo: 2 vehículos distintos en la categoría (3 ventas)
  await expect(page.getByTestId(`tipo-${categoria}`).getByRole("cell")).toHaveText([
    categoria,
    "2",
    /\$\s?60\.000,00/,
  ]);
  await expect(page.getByTestId("dato-vehiculos")).toHaveText(/^\d[\d.]*$/);

  // Mes actual
  const mes = MESES[ahora.getMonth()] ?? "Enero";
  await page.getByLabel("Mes", { exact: true }).click();
  await page.getByRole("option", { name: mes, exact: true }).click();
  await expect(page.getByRole("heading", { name: `${mes} de ${anio}` })).toBeVisible();
  await expect(page.getByTestId(`tipo-${categoria}`).getByRole("cell")).toHaveText([
    categoria,
    "2",
    /\$\s?60\.000,00/,
  ]);

  // Horarios: las 7 filas de días; año contra año: el mes actual tiene ventas
  await expect(page.getByTestId(/^dia-/)).toHaveCount(7);
  await expect(
    page.getByRole("heading", { name: `${anio} contra ${String(ahora.getFullYear() - 1)}` }),
  ).toBeVisible();
  await expect(page.getByTestId(`comparacion-${mes}`).getByRole("cell").nth(1)).not.toHaveText("0");
});
