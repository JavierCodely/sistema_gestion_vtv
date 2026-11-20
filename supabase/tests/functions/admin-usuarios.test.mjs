// Tests de integración de la Edge Function admin-usuarios contra Supabase local.
// Requiere `supabase start` y el seed (admin@vtv.local / cajero@vtv.local).
// Ejecutar: npm run test:functions
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const env = JSON.parse(
  execSync("npx supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const API = env.API_URL;
const ANON = env.ANON_KEY;
const SERVICE = env.SERVICE_ROLE_KEY;
const FN = `${env.FUNCTIONS_URL}/admin-usuarios`;
const sufijo = Date.now();
const creados = [];

async function login(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json();
  return { status: r.status, token: body.access_token, body };
}

async function llamar(token, payload) {
  const r = await fetch(FN, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token ?? ANON}`,
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json() };
}

let tokenAdmin;
let tokenCajero;

before(async () => {
  tokenAdmin = (await login("admin@vtv.local", "admin1234")).token;
  tokenCajero = (await login("cajero@vtv.local", "cajero1234")).token;
  assert.ok(tokenAdmin, "el admin del seed debe poder iniciar sesión");
  assert.ok(tokenCajero, "el cajero del seed debe poder iniciar sesión");
});

after(async () => {
  for (const id of creados) {
    await fetch(`${API}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
  }
});

test("un cajero no puede gestionar usuarios", async () => {
  const r = await llamar(tokenCajero, {
    accion: "crear",
    nombre: "X",
    email: `x${sufijo}@t.local`,
    password: "12345678",
    rol: "cajero",
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "Solo un administrador puede gestionar usuarios");
});

test("sin sesión válida se rechaza", async () => {
  const r = await llamar(undefined, { accion: "crear" });
  assert.equal(r.status, 401);
});

test("valida datos obligatorios, rol y contraseña", async () => {
  let r = await llamar(tokenAdmin, {
    accion: "crear",
    nombre: "",
    email: "a@b.c",
    password: "12345678",
    rol: "cajero",
  });
  assert.equal(r.body.error, "El nombre es obligatorio");
  r = await llamar(tokenAdmin, {
    accion: "crear",
    nombre: "A",
    email: "a@b.c",
    password: "12345678",
    rol: "jefe",
  });
  assert.equal(r.body.error, "El rol debe ser admin o cajero");
  r = await llamar(tokenAdmin, {
    accion: "crear",
    nombre: "A",
    email: "a@b.c",
    password: "123",
    rol: "cajero",
  });
  assert.equal(r.body.error, "La contraseña debe tener al menos 8 caracteres");
  r = await llamar(tokenAdmin, { accion: "volar" });
  assert.equal(r.body.error, "Acción desconocida");
});

test("ciclo completo: crear, login, editar, desactivar, reactivar, cambiar contraseña", async () => {
  const email = `cajero${sufijo}@t.local`;

  let r = await llamar(tokenAdmin, {
    accion: "crear",
    nombre: "Ana Pérez",
    email,
    password: "clave1234",
    rol: "cajero",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const { id } = r.body.usuario;
  creados.push(id);
  assert.deepEqual(
    { nombre: r.body.usuario.nombre, rol: r.body.usuario.rol, activo: r.body.usuario.activo },
    { nombre: "Ana Pérez", rol: "cajero", activo: true },
  );

  r = await llamar(tokenAdmin, {
    accion: "crear",
    nombre: "Otra",
    email,
    password: "clave1234",
    rol: "cajero",
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Ya existe un usuario con ese email");

  assert.equal(
    (await login(email, "clave1234")).status,
    200,
    "el usuario creado puede iniciar sesión",
  );

  r = await llamar(tokenAdmin, { accion: "actualizar", id, nombre: "Ana P.", rol: "admin" });
  assert.equal(r.status, 200);
  assert.equal(r.body.usuario.nombre, "Ana P.");
  assert.equal(r.body.usuario.rol, "admin");

  r = await llamar(tokenAdmin, { accion: "activar", id, activo: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.usuario.activo, false);
  assert.equal(
    (await login(email, "clave1234")).status,
    400,
    "un usuario desactivado no puede iniciar sesión",
  );

  r = await llamar(tokenAdmin, { accion: "activar", id, activo: true });
  assert.equal(r.body.usuario.activo, true);

  r = await llamar(tokenAdmin, { accion: "cambiar_password", id, password: "nueva12345" });
  assert.equal(r.status, 200);
  assert.equal(
    (await login(email, "clave1234")).status,
    400,
    "la contraseña vieja deja de funcionar",
  );
  assert.equal((await login(email, "nueva12345")).status, 200, "la contraseña nueva funciona");
});

test("el admin no puede desactivarse ni quitarse el rol a sí mismo", async () => {
  const yo = JSON.parse(Buffer.from(tokenAdmin.split(".")[1], "base64url").toString()).sub;
  let r = await llamar(tokenAdmin, { accion: "activar", id: yo, activo: false });
  assert.equal(r.body.error, "No podés desactivarte a vos mismo");
  r = await llamar(tokenAdmin, { accion: "actualizar", id: yo, rol: "cajero" });
  assert.equal(r.body.error, "No podés quitarte el rol de administrador a vos mismo");
});

test("usuario inexistente", async () => {
  const r = await llamar(tokenAdmin, {
    accion: "cambiar_password",
    id: "00000000-0000-0000-0000-000000000999",
    password: "12345678",
  });
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "El usuario no existe");
});
