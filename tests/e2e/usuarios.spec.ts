import { expect, test } from "@playwright/test";
import { ADMIN, ingresar, salir, unico } from "./utilidades";

test("ciclo completo de un usuario: crear, editar, contraseña, desactivar y reactivar", async ({
  page,
  browser,
}) => {
  const email = `ana${unico()}@vtv.local`;
  await ingresar(page, ADMIN);
  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();

  // Validación en el formulario
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const nuevo = page.getByRole("dialog", { name: "Nuevo usuario" });
  await nuevo.getByRole("button", { name: "Crear usuario" }).click();
  await expect(nuevo.getByText("Ingresá el nombre.")).toBeVisible();
  await expect(nuevo.getByText("Ingresá el email.")).toBeVisible();

  // Crear
  await nuevo.getByLabel("Nombre").fill("Ana Pérez");
  await nuevo.getByLabel("Email").fill(email);
  await nuevo.getByLabel("Contraseña").fill("clave1234");
  await nuevo.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByText("Usuario Ana Pérez creado")).toBeVisible();
  const fila = page.getByTestId(`usuario-${email}`);
  await expect(fila).toContainText("Ana Pérez");
  await expect(fila).toContainText("Cajero");

  // Email repetido: error del servidor en español
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  await nuevo.getByLabel("Nombre").fill("Otra");
  await nuevo.getByLabel("Email").fill(email);
  await nuevo.getByLabel("Contraseña").fill("clave1234");
  await nuevo.getByRole("button", { name: "Crear usuario" }).click();
  await expect(nuevo.getByRole("alert")).toHaveText("Ya existe un usuario con ese email");
  await page.keyboard.press("Escape");

  // Editar nombre y rol
  await fila.getByRole("button", { name: "Editar Ana Pérez" }).click();
  const editar = page.getByRole("dialog", { name: "Editar usuario" });
  await editar.getByLabel("Nombre").fill("Ana P.");
  await editar.getByLabel("Rol").click();
  await page.getByRole("option", { name: "Administrador" }).click();
  await editar.getByRole("button", { name: "Guardar" }).click();
  await expect(fila).toContainText("Ana P.");
  await expect(fila).toContainText("Administrador");

  // Cambiar contraseña
  await fila.getByRole("button", { name: "Cambiar contraseña de Ana P." }).click();
  const clave = page.getByRole("dialog", { name: "Cambiar contraseña" });
  await clave.getByLabel("Nueva contraseña").fill("nueva12345");
  await clave.getByLabel("Repetir contraseña").fill("otra12345");
  await clave.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(clave.getByText("Las contraseñas no coinciden.")).toBeVisible();
  await clave.getByLabel("Repetir contraseña").fill("nueva12345");
  await clave.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText("Contraseña de Ana P. actualizada")).toBeVisible();

  // Desactivar: no puede ingresar y ve un mensaje claro
  await fila.getByRole("switch", { name: "Usuario Ana P. activo" }).click();
  await expect(page.getByText("Ana P. desactivado")).toBeVisible();
  await expect(fila.getByRole("switch")).not.toBeChecked();

  const otro = await browser.newContext();
  const paginaAna = await otro.newPage();
  await ingresar(paginaAna, { email, password: "nueva12345" });
  await expect(
    paginaAna.getByText("Tu usuario está desactivado. Consultá con el administrador."),
  ).toBeVisible();

  // Reactivar: ahora sí ingresa (como admin, por el cambio de rol)
  await fila.getByRole("switch", { name: "Usuario Ana P. activo" }).click();
  await expect(fila.getByRole("switch")).toBeChecked();
  await ingresar(paginaAna, { email, password: "nueva12345" });
  await expect(paginaAna).toHaveURL("/admin");
  await otro.close();

  await salir(page);
});

test("el admin no puede desactivarse ni cambiarse el rol a sí mismo", async ({ page }) => {
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/usuarios");
  const fila = page.getByTestId(`usuario-${ADMIN.email}`);
  await expect(fila).toContainText("(vos)");
  await expect(fila.getByRole("switch")).toBeDisabled();
  await fila.getByRole("button", { name: /^Editar/ }).click();
  const editar = page.getByRole("dialog", { name: "Editar usuario" });
  await expect(editar.getByLabel("Rol")).toBeDisabled();
  await expect(editar.getByText("No podés cambiar tu propio rol.")).toBeVisible();
});
