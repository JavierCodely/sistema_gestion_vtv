import { expect, type Locator, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@vtv.local", password: "admin1234" };
export const CAJERO = { email: "cajero@vtv.local", password: "cajero1234" };

export async function ingresar(page: Page, credenciales: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credenciales.email);
  await page.getByLabel("Contraseña").fill(credenciales.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

export async function salir(page: Page) {
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL("/login");
}

/**
 * Ejecuta `accion` y espera la respuesta de la Edge Function `nombre`. Las funciones locales
 * arrancan un worker por petición (config.toml: policy = "oneshot") y pueden tardar varios
 * segundos: las aserciones posteriores no deben depender del timeout corto de `expect`.
 */
export async function conFuncion(page: Page, nombre: string, accion: () => Promise<void>) {
  const respuesta = page.waitForResponse(
    (r) => r.url().includes(`/functions/v1/${nombre}`) && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await accion();
  await respuesta;
}

/** Sufijo único por ejecución para no chocar con datos de corridas anteriores. */
export const unico = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

/**
 * Ingreso en la caja de cambio (admin, Fondos › Efectivo), para tener de dónde sacar el efectivo
 * inicial de un turno.
 */
export async function ingresarEfectivo(page: Page, monto: string, nota: string) {
  await page.goto("/admin/fondos?pestana=efectivo");
  await page.getByRole("button", { name: "Ingreso" }).click();
  const dialogo = page.getByRole("dialog", { name: "Ingreso" });
  await dialogo.getByLabel("Monto ($)").fill(monto);
  await dialogo.getByLabel("Nota").fill(nota);
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/^Ingreso registrado\. Saldo: /)).toBeVisible();
}

/** Para armar expresiones regulares con nombres que pueden traer caracteres especiales. */
export const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * El admin abre el turno de `caja` con el efectivo inicial (sale de la caja de cambio), con "Abrir
 * turno" de la barra fija. No se elige quién atiende: cualquier usuario activo vende en ella.
 */
export async function abrirTurnoComoAdmin(
  page: Page,
  { caja, efectivo }: { caja: string; efectivo: string },
) {
  await page.goto("/admin/ventas");
  await page.getByRole("banner").getByRole("button", { name: "Abrir turno" }).click();
  const dialogo = page.getByRole("dialog", { name: "Abrir turno" });
  await dialogo.getByLabel("Caja").click();
  await page.getByRole("option", { name: caja, exact: true }).click();
  await dialogo.getByLabel("Efectivo inicial ($)").fill(efectivo);
  await dialogo.getByRole("button", { name: "Abrir turno" }).click();
  await expect(
    page.getByText(new RegExp(`^Turno abierto en “${escapar(caja)}” con`)),
  ).toBeVisible();
}

/** Opción de `caja` en la lista de turnos abiertos de "Cerrar turno" (caja, desde cuándo, quiénes). */
export function opcionTurno(contenedor: Locator, caja: string) {
  return contenedor.getByRole("radio", { name: new RegExp(`^${escapar(caja)}\\s*Desde`) });
}

/** El admin cierra, con "Cerrar turno" de la barra fija, el turno abierto de `caja`. */
export async function cerrarTurnoDesdeBarra(
  page: Page,
  { caja, observaciones = "" }: { caja: string; observaciones?: string },
) {
  await page.getByRole("banner").getByRole("button", { name: "Cerrar turno" }).click();
  const dialogo = page.getByRole("dialog", { name: "Cerrar turno" });
  await opcionTurno(dialogo, caja).check();
  if (observaciones) await dialogo.getByLabel("Observaciones (opcional)").fill(observaciones);
  await dialogo.getByRole("button", { name: "Cerrar turno" }).click();
  await expect(page.getByText(`Turno de ${caja} cerrado`, { exact: true })).toBeVisible();
}

/**
 * Entra a `/caja` y queda trabajando en `caja` (abierta): si es la única queda elegida; si hay
 * varias (de otras pruebas), la elige en la lista o con el selector de arriba.
 */
export async function trabajarEnCaja(page: Page, caja: string) {
  await page.goto("/caja");
  const eleccion = page.getByRole("heading", { name: "¿En qué caja estás trabajando?" });
  const selector = page.getByLabel("Estás trabajando en");
  const titulo = page.getByRole("heading", { name: caja, exact: true });
  await expect(eleccion.or(selector).or(titulo).first()).toBeVisible();
  if (await eleccion.isVisible()) {
    await page
      .getByRole("button", { name: new RegExp(`^${escapar(caja)}\\s*Abierta desde`) })
      .click();
  } else if ((await selector.isVisible()) && !(await selector.textContent())?.includes(caja)) {
    await selector.click();
    await page.getByRole("option", { name: caja, exact: true }).click();
  }
  await esperarCaja(page, caja);
}

/** La pantalla de la caja muestra que se trabaja en `caja` (título, o selector si hay varias). */
export async function esperarCaja(page: Page, caja: string) {
  const selector = page.getByLabel("Estás trabajando en");
  const titulo = page.getByRole("heading", { name: caja, exact: true });
  await expect(selector.or(titulo).first()).toContainText(caja);
}

const ORDEN_MEDIOS = ["Efectivo", "Transferencia", "Tarjeta"] as const;

/**
 * Venta en la caja como la hace el cajero: categoría y servicio (clic), patente, medio de pago con
 * su número y Enter, y en efectivo cuánto entregó (vacío = pagó justo). Espera el aviso de la venta.
 */
export async function venderEnCaja(
  page: Page,
  {
    categoria,
    servicio,
    medio,
    patente = "",
    recibido = "",
  }: {
    categoria: string;
    servicio: string;
    medio: (typeof ORDEN_MEDIOS)[number];
    patente?: string;
    recibido?: string;
  },
) {
  await iniciarVentaEnCaja(page, { categoria, servicio, medio, patente, recibido });
  await expect(page.getByText(new RegExp(`^Venta N° \\d+: ${servicio}`)).first()).toBeVisible();
}

/** Igual que `venderEnCaja` pero sin esperar el resultado (ej. cuando la BD la rechaza). */
export async function iniciarVentaEnCaja(
  page: Page,
  {
    categoria,
    servicio,
    medio,
    patente = "",
    recibido = "",
  }: {
    categoria: string;
    servicio: string;
    medio: (typeof ORDEN_MEDIOS)[number];
    patente?: string;
    recibido?: string;
  },
) {
  await page.getByRole("tab", { name: "Ventas" }).click();
  await page
    .getByRole("listbox", { name: "1. Categoría" })
    .getByRole("option", { name: categoria, exact: true })
    .click();
  await page
    .getByRole("listbox", { name: /^2\. Servicio/ })
    .getByRole("option", { name: new RegExp(`^${servicio}`) })
    .click();
  const campoPatente = page.getByLabel("3. Patente (opcional)");
  await expect(campoPatente).toBeFocused();
  await page.keyboard.type(patente);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "4. Medio de pago" })).toBeFocused();
  await page.keyboard.press(String(ORDEN_MEDIOS.indexOf(medio) + 1));
  await page.keyboard.press("Enter");
  if (medio === "Efectivo") {
    await expect(page.getByLabel("5. ¿Cuánto te entregó? ($)")).toBeFocused();
    await page.keyboard.type(recibido);
    await page.keyboard.press("Enter");
  }
}
