import { expect, type Page } from "@playwright/test";

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
