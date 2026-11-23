// Edge Function: administración de usuarios (solo admin).
//
// POST { accion: "crear", nombre, apellido, email, password, rol }
// POST { accion: "actualizar", id, nombre?, apellido?, rol? }
// POST { accion: "activar", id, activo }
// POST { accion: "cambiar_password", id, password }
//
// Respuesta: 200 { usuario } | 4xx { error } con mensaje en español.
// El perfil se crea por trigger (tg_crear_perfil) a partir de user_metadata.nombre/apellido
// y app_metadata.rol. Las reglas de "último admin activo" las aplica la BD.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

type Rol = "admin" | "cajero";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ErrorHttp extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function texto(valor: unknown, campo: string, largoMaximo: number): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    throw new ErrorHttp(400, `${campo} es obligatorio`);
  }
  if (valor.trim().length > largoMaximo) {
    throw new ErrorHttp(400, `${campo} no puede superar los ${largoMaximo} caracteres`);
  }
  return valor.trim().replace(/\s+/g, " ");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idUsuario(valor: unknown): string {
  if (typeof valor !== "string" || !UUID.test(valor)) {
    throw new ErrorHttp(400, "El id del usuario no es válido");
  }
  return valor;
}

function rol(valor: unknown): Rol {
  if (valor !== "admin" && valor !== "cajero") {
    throw new ErrorHttp(400, "El rol debe ser admin o cajero");
  }
  return valor;
}

function password(valor: unknown): string {
  if (typeof valor !== "string" || valor.length < 8) {
    throw new ErrorHttp(400, "La contraseña debe tener al menos 8 caracteres");
  }
  // bcrypt solo usa los primeros 72 bytes: más largo daría una falsa sensación de seguridad.
  if (new TextEncoder().encode(valor).length > 72) {
    throw new ErrorHttp(400, "La contraseña no puede superar los 72 caracteres");
  }
  return valor;
}

function traducirError(mensaje: string): string {
  if (/already (been )?registered|already exists/i.test(mensaje)) {
    return "Ya existe un usuario con ese email";
  }
  if (/invalid.*email|unable to validate email/i.test(mensaje)) return "El email no es válido";
  if (/password/i.test(mensaje)) return "La contraseña no cumple los requisitos";
  // No exponer mensajes internos de Auth al cliente.
  console.error("admin-usuarios (auth):", mensaje);
  return "No se pudo completar la operación";
}

async function perfil(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from("perfiles")
    .select("id, nombre, apellido, nombre_completo, email, rol, activo")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("admin-usuarios (leer perfil):", error.message);
    throw new ErrorHttp(500, "No se pudo leer el usuario");
  }
  if (!data) throw new ErrorHttp(404, "El usuario no existe");
  return data;
}

async function actualizarPerfil(
  admin: SupabaseClient,
  id: string,
  cambios: Record<string, unknown>,
) {
  const { error } = await admin.from("perfiles").update(cambios).eq("id", id);
  if (error) {
    // Las reglas de negocio de la BD (P0001, ej. último admin) ya vienen en español.
    if (error.code === "P0001") throw new ErrorHttp(400, error.message);
    console.error("admin-usuarios (actualizar perfil):", error.message);
    throw new ErrorHttp(500, "No se pudieron guardar los cambios");
  }
}

async function manejar(req: Request): Promise<Response> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Quién llama: debe ser un admin activo.
  const authHeader = req.headers.get("Authorization") ?? "";
  const llamador = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: sesion } = await llamador.auth.getUser();
  if (!sesion.user) throw new ErrorHttp(401, "Sesión inválida o vencida");

  const { data: esAdmin, error: errRol } = await llamador.rpc("es_admin");
  if (errRol || esAdmin !== true) {
    throw new ErrorHttp(403, "Solo un administrador puede gestionar usuarios");
  }
  const yo = sesion.user.id;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => {
    throw new ErrorHttp(400, "Cuerpo de la solicitud inválido");
  });

  switch (body?.accion) {
    case "crear": {
      const nombre = texto(body.nombre, "El nombre", 100);
      const apellido = texto(body.apellido, "El apellido", 100);
      const email = texto(body.email, "El email", 254).toLowerCase();
      const r = rol(body.rol);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: password(body.password),
        email_confirm: true,
        user_metadata: { nombre, apellido },
        app_metadata: { rol: r },
      });
      if (error) throw new ErrorHttp(400, traducirError(error.message));
      return json(200, { usuario: await perfil(admin, data.user.id) });
    }

    case "actualizar": {
      const id = idUsuario(body.id);
      const actual = await perfil(admin, id);
      const cambios: Record<string, unknown> = {};
      if (body.nombre !== undefined) cambios.nombre = texto(body.nombre, "El nombre", 100);
      if (body.apellido !== undefined) cambios.apellido = texto(body.apellido, "El apellido", 100);
      if (body.rol !== undefined) cambios.rol = rol(body.rol);
      if (Object.keys(cambios).length === 0)
        throw new ErrorHttp(400, "No hay cambios para guardar");
      // Nombre y apellido son obligatorios: quien viene sin apellido lo completa al editarse.
      if (actual.apellido === null && cambios.apellido === undefined) {
        throw new ErrorHttp(400, "Completá el apellido");
      }
      if (id === yo && cambios.rol && cambios.rol !== "admin") {
        throw new ErrorHttp(400, "No podés quitarte el rol de administrador a vos mismo");
      }
      await actualizarPerfil(admin, id, cambios);
      const { error } = await admin.auth.admin.updateUserById(id, {
        user_metadata: {
          nombre: cambios.nombre ?? actual.nombre,
          apellido: cambios.apellido ?? actual.apellido,
        },
        app_metadata: { rol: cambios.rol ?? actual.rol },
      });
      if (error) throw new ErrorHttp(500, traducirError(error.message));
      return json(200, { usuario: await perfil(admin, id) });
    }

    case "activar": {
      const id = idUsuario(body.id);
      if (typeof body.activo !== "boolean")
        throw new ErrorHttp(400, "Indicá si el usuario queda activo");
      if (id === yo && !body.activo) throw new ErrorHttp(400, "No podés desactivarte a vos mismo");
      await perfil(admin, id);
      await actualizarPerfil(admin, id, { activo: body.activo });
      // Bloquea el login (y la renovación de sesión) del usuario desactivado.
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: body.activo ? "none" : "876000h",
      });
      if (error) throw new ErrorHttp(500, traducirError(error.message));
      return json(200, { usuario: await perfil(admin, id) });
    }

    case "cambiar_password": {
      const id = idUsuario(body.id);
      await perfil(admin, id);
      const { error } = await admin.auth.admin.updateUserById(id, {
        password: password(body.password),
      });
      if (error) throw new ErrorHttp(400, traducirError(error.message));
      return json(200, { usuario: await perfil(admin, id) });
    }

    default:
      throw new ErrorHttp(400, "Acción desconocida");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  try {
    return await manejar(req);
  } catch (e) {
    if (e instanceof ErrorHttp) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Error inesperado en el servidor" });
  }
});
