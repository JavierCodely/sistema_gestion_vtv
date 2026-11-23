import { writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { generarCertificado } from "../arca/certificado.mjs";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  cerrarTurnoDesdeBarra,
  conFuncion,
  esperarCaja,
  ingresar,
  ingresarEfectivo,
  trabajarEnCaja,
  unico,
  venderEnCaja,
} from "./utilidades";

// Siempre contra el simulador de ARCA (webServer de playwright.config.ts): nunca ARCA real.

const CUIT_EMISOR = "30712345671";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: RegExp | string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion }).click();
}

test("facturación ARCA: configurar, facturar B y A desde la caja, ver el comprobante y emitir la NC al anular", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const sufijo = unico();
  const caja = `Caja fact ${sufijo}`;
  const categoria = `Cat fact ${sufijo}`;
  const servicio = `Servicio fact ${sufijo}`;
  const cajero = { email: `cajerof${sufijo}@vtv.local`, password: "clave1234" };
  // Punto de venta propio de la corrida: la numeración de la BD no choca con corridas anteriores.
  const puntoVenta = String(100 + Math.floor(Math.random() * 9000));

  // --- Admin: datos fiscales, certificado y prueba de conexión
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link", { name: "Configuración ARCA" }).click();
  await expect(page.getByRole("heading", { name: "Configuración ARCA" })).toBeVisible();
  await page.getByLabel("CUIT").fill("30-71234567-2");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("El CUIT no es válido.")).toBeVisible();
  await page.getByLabel("CUIT").fill(CUIT_EMISOR);
  await page.getByLabel("Razón social").fill(`VTV E2E ${sufijo}`);
  await page.getByLabel("Domicilio comercial").fill("Av. de Prueba 123, CABA");
  await page.getByLabel("Inicio de actividades").fill("2020-01-01");
  await page.getByLabel("Punto de venta").fill(puntoVenta);
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos fiscales guardados")).toBeVisible();

  const { certificado, clave } = generarCertificado({ cuit: CUIT_EMISOR });
  const rutaCrt = testInfo.outputPath("arca.crt");
  const rutaKey = testInfo.outputPath("arca.key");
  await writeFile(rutaCrt, certificado);
  await writeFile(rutaKey, clave);
  await page.getByLabel("Certificado (.crt)").setInputFiles(rutaCrt);
  await page.getByLabel("Clave privada (.key)").setInputFiles(rutaKey);
  await conFuncion(page, "arca", () =>
    page.getByRole("button", { name: "Guardar certificado" }).click(),
  );
  await expect(page.getByText("Certificado guardado")).toBeVisible();
  await expect(page.getByTestId("certificado-actual")).toContainText("30-71234567-1");

  await conFuncion(page, "arca", () =>
    page.getByRole("button", { name: "Probar conexión" }).click(),
  );
  await expect(page.getByTestId("resultado-prueba")).toContainText("Conexión correcta");
  await expect(page.getByText("Consumidor Final · Factura B o C")).toBeVisible();

  // --- Admin: cajero, caja y servicio de la corrida
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nuevoUsuario = page.getByRole("dialog", { name: "Nuevo usuario" });
  await nuevoUsuario.getByLabel("Nombre").fill("Cajero F");
  await nuevoUsuario.getByLabel("Apellido").fill(sufijo);
  await nuevoUsuario.getByLabel("Email").fill(cajero.email);
  await nuevoUsuario.getByLabel("Contraseña").fill(cajero.password);
  await conFuncion(page, "admin-usuarios", () =>
    nuevoUsuario.getByRole("button", { name: "Crear usuario" }).click(),
  );
  await expect(page.getByText(`Usuario Cajero F ${sufijo} creado`)).toBeVisible();

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
  await nuevoServicio.getByLabel("Precio ($)").fill("30.000");
  await nuevoServicio.getByLabel("Usa hoja de certificado").click();
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();

  // --- Admin abre la caja; el cajero vende dos veces en ella
  await ingresarEfectivo(page, "1.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "1.000" });
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, cajero);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  for (const patente of ["AA111AA", "BB222BB"]) {
    await venderEnCaja(pc, { categoria, servicio, medio: "Efectivo", patente });
  }
  await pc.getByRole("tab", { name: "Historial" }).click();
  const ventas = pc.getByRole("region", { name: "Ventas de la caja" });
  const ventaB = ventas.getByRole("row").filter({ hasText: "AA111AA" });
  const ventaA = ventas.getByRole("row").filter({ hasText: "BB222BB" });

  // Factura B a consumidor final (valores por defecto)
  await ventaB.getByRole("button", { name: /^Facturar venta/ }).click();
  const dialogoB = pc.getByRole("dialog", { name: /^Facturar venta/ });
  await expect(dialogoB.getByTestId("clase-factura")).toHaveText("Se emite Factura B.");
  await conFuncion(pc, "arca", () =>
    dialogoB.getByRole("button", { name: "Emitir factura" }).click(),
  );
  await expect(dialogoB).toBeHidden();
  const enlaceB = ventaB.getByRole("link", {
    name: new RegExp(`^Ver Factura B ${puntoVenta.padStart(5, "0")}-00000001$`),
  });
  await expect(enlaceB).toBeVisible();

  // Factura A a un responsable inscripto: exige CUIT
  await ventaA.getByRole("button", { name: /^Facturar venta/ }).click();
  const dialogoA = pc.getByRole("dialog", { name: /^Facturar venta/ });
  await elegir(pc, dialogoA, "Condición frente al IVA", "IVA Responsable Inscripto");
  await expect(dialogoA.getByTestId("clase-factura")).toHaveText(
    "Se emite Factura A (requiere CUIT).",
  );
  await dialogoA.getByLabel("Número de CUIT").fill("20-12345678-6");
  await dialogoA.getByLabel("Nombre o razón social").fill("Cliente RI SA");
  await conFuncion(pc, "arca", () =>
    dialogoA.getByRole("button", { name: "Emitir factura" }).click(),
  );
  await expect(dialogoA).toBeHidden();
  await expect(ventaA.getByRole("link", { name: /^Ver Factura A \d{5}-00000001$/ })).toBeVisible();

  // Representación impresa con CAE y QR
  await enlaceB.click();
  await expect(pc).toHaveURL(/\/comprobantes\/\d+$/);
  const impreso = pc.getByRole("article", { name: /^Factura B/ });
  await expect(impreso.getByTestId("comprobante-cae")).toHaveText(/^\d{14}$/);
  await expect(impreso.getByTestId("comprobante-total")).toHaveText(/30\.000,00/);
  await expect(impreso.getByText("Consumidor final", { exact: true })).toBeVisible();
  await expect(
    impreso.getByRole("img", { name: "Código QR para verificar en ARCA" }),
  ).toBeVisible();
  await expect(impreso.getByText(/sin validez fiscal/)).toBeVisible();
  await pc.getByRole("button", { name: "Volver" }).click();
  await esperarCaja(pc, caja);

  // --- Admin: anula la venta con Factura B y se emite la nota de crédito B
  await page.goto("/admin/ventas");
  await page
    .getByRole("row")
    .filter({ hasText: caja })
    .getByRole("link", { name: /^Ver turno/ })
    .click();
  const filaB = page.getByRole("row").filter({ hasText: "AA111AA" });
  await filaB.getByRole("button", { name: /^Anular venta/ }).click();
  const anular = page.getByRole("dialog", { name: /^Anular venta/ });
  await anular.getByLabel("Motivo").fill("Error de cobro");
  await conFuncion(page, "arca", () =>
    anular.getByRole("button", { name: "Anular venta" }).click(),
  );
  await expect(filaB).toContainText("Anulada");
  await expect(
    filaB.getByRole("link", { name: /^Ver Nota de crédito B \d{5}-00000001$/ }),
  ).toBeVisible();

  // El log registra las comunicaciones
  await page.getByRole("link", { name: "Facturación" }).click();
  // (la BD es compartida con otros tests: se miran solo las filas de esta corrida)
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Pedido de CAE" })
      .filter({ hasText: `Cajero F ${sufijo}` }),
  ).toHaveCount(2);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Prueba de conexión" })
      .filter({ hasText: `punto de venta ${puntoVenta}:` }),
  ).toBeVisible();

  // --- El admin cierra el turno de la caja (el cajero no cierra turnos)
  await contextoCajero.close();
  await cerrarTurnoDesdeBarra(page, { caja });
});

test("el cajero no entra a la configuración ni al log de ARCA", async ({ browser }) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await ingresar(page, { email: "cajero@vtv.local", password: "cajero1234" });
  await expect(page).toHaveURL("/caja");
  for (const ruta of ["/admin/arca", "/admin/facturacion"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL("/caja");
  }
  await contexto.close();
});
