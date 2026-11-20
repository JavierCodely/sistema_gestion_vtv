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

/** Sufijo único por ejecución para no chocar con datos de corridas anteriores. */
export const unico = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
