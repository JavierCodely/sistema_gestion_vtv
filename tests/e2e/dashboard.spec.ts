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

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

test("dashboard: ventas de la semana, servicios, categorías y gastos del turno con su rango", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const sufijo = unico();
  const caja = `Caja dash ${sufijo}`;
  const categoria = `Cat dash ${sufijo}`;
  const auto = `Auto dash ${sufijo}`;
  const moto = `Moto dash ${sufijo}`;
  const nota = `Gasto dash ${sufijo}`;

  // --- Admin: caja, categoría y dos servicios
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
  for (const [nombre, precio] of [
    [auto, "20.000"],
    [moto, "10.000"],
  ] as const) {
    await page.getByRole("button", { name: "Nuevo servicio" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo servicio" });
    await dialogo.getByLabel("Nombre").fill(nombre);
    await elegir(page, dialogo, "Categoría", categoria);
    await dialogo.getByLabel("Precio ($)").fill(precio);
    await dialogo.getByRole("button", { name: "Crear servicio" }).click();
    await expect(page.getByText(`Servicio “${nombre}” creado`)).toBeVisible();
  }

  // --- Turno: el cajero vende 2 autos y 1 moto y carga un gasto en Comida
  await ingresarEfectivo(page, "5.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "5.000" });
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await venderEnCaja(pc, { categoria, servicio: auto, medio: "Tarjeta" });
  await venderEnCaja(pc, { categoria, servicio: auto, medio: "Transferencia" });
  await venderEnCaja(pc, { categoria, servicio: moto, medio: "Efectivo" });
  await pc.getByRole("tab", { name: "Gastos" }).click();
  await pc.getByRole("button", { name: "Registrar gasto" }).click();
  const gasto = pc.getByRole("dialog", { name: "Registrar gasto" });
  await elegir(pc, gasto, "Categoría", "Comida");
  await gasto.getByLabel("Monto ($)").fill("1.500");
  await elegir(pc, gasto, "Pagado con", "Efectivo (de la caja)");
  await gasto.getByLabel("Nota").fill(nota);
  await gasto.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(pc.getByText(/^Gasto de \$\s?1\.500,00 registrado$/)).toBeVisible();
  await contextoCajero.close();

  // --- Dashboard: portada del panel
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

  // Semana actual: de lunes a domingo; hoy tiene ventas y los días que vienen, ninguna barra
  await expect(page.getByTestId("semana-rango")).toHaveText(
    /^Del lunes \d{2}\/\d{2}\/\d{4} al domingo \d{2}\/\d{2}\/\d{4}$/,
  );
  const hoy = DIAS[new Date().getDay()] ?? "Lunes";
  await expect(page.getByTestId(`semana-${hoy}`)).toContainText(/\$\s?[\d.]+,\d{2}/);
  await expect(page.getByTestId("semana-mejor-dia")).toContainText("El día que más se vendió:");
  if (hoy !== "Domingo") {
    await expect(page.getByTestId("semana-Domingo")).toHaveText(/—$/);
  }

  // Período por defecto: el mes actual, con desde y hasta
  await expect(page.getByTestId("dashboard-rango")).toHaveText(
    /^Del 01\/\d{2}\/\d{4} al \d{2}\/\d{2}\/\d{4}$/,
  );
  await expect(page.getByTestId(`servicio-${auto}`).getByRole("cell")).toHaveText([
    auto,
    "2",
    /\$\s?40\.000,00/,
  ]);

  // Solo el año: todo el año
  await page.getByLabel("Mes", { exact: true }).click();
  await page.getByRole("option", { name: "Todo el año" }).click();
  const anio = String(new Date().getFullYear());
  await expect(page.getByTestId("dashboard-rango")).toHaveText(
    `Del 01/01/${anio} al 31/12/${anio}`,
  );
  await expect(page.getByRole("heading", { name: `Año ${anio}` })).toBeVisible();

  // Por turno: solo lo de esta caja
  await page.getByLabel("Turno", { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(`^${caja} · `) }).click();
  await expect(page.getByTestId("dashboard-rango")).toContainText(`Datos del turno: ${caja}`);
  await expect(page.getByTestId("dato-ventas")).toHaveText("3");
  await expect(page.getByTestId("dato-vendido")).toHaveText(/\$\s?50\.000,00/);
  await expect(page.getByTestId(`servicio-${moto}`).getByRole("cell")).toHaveText([
    moto,
    "1",
    /\$\s?10\.000,00/,
  ]);
  await expect(page.getByTestId(`categoria-${categoria}`).getByRole("cell")).toHaveText([
    categoria,
    "3",
    /\$\s?50\.000,00/,
  ]);
  await expect(page.getByText("No se hicieron descuentos en ese período.")).toBeVisible();
  await expect(page.getByTestId("dato-gastos")).toHaveText(/\$\s?1\.500,00/);
  await expect(page.getByTestId("dato-compra-certificados")).toHaveText(/\$\s?0,00/);
  await expect(page.getByTestId("dato-otros-gastos")).toHaveText(/\$\s?1\.500,00/);
  await expect(page.getByTestId("rubro-Comida y refrigerio").getByRole("cell")).toHaveText([
    "Comida y refrigerio",
    "1",
    /\$\s?1\.500,00/,
  ]);
  // Impuestos del mismo turno (su cálculo lo prueba impuestos.spec): la sección está con el filtro
  await expect(page.getByRole("heading", { name: "Impuestos", level: 2 })).toBeVisible();
  await expect(page.getByTestId("dato-impuestos-total")).toHaveText(/\$\s?[\d.]+,\d{2}/);

  // Scroll propio: con la rueda se desplaza el contenido hasta abajo y el menú y la barra siguen a la
  // vista (si se desplazara la ventana, se irían para arriba)
  const menu = page.getByRole("navigation", { name: "Menú de administración" });
  await page.getByTestId("contenido-admin").hover();
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 1000);
  await expect(page.getByText("Impuestos por tipo")).toBeInViewport();
  await expect(menu.getByRole("link", { name: "Dashboard" })).toBeInViewport();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Abrir turno" }),
  ).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).not.toBeInViewport();
  await page.screenshot({ path: "test-results/dashboard.png" });

  await cerrarTurnoDesdeBarra(page, { caja });
});
