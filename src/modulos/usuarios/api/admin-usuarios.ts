import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Rol } from "@/compartido/tipos";
import { supabase } from "@/compartido/lib/supabase";

/** Perfil tal como lo devuelve la Edge Function admin-usuarios. */
export interface UsuarioAdmin {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
}

export type AccionUsuario =
  | { accion: "crear"; nombre: string; email: string; password: string; rol: Rol }
  | { accion: "actualizar"; id: string; nombre?: string; rol?: Rol }
  | { accion: "activar"; id: string; activo: boolean }
  | { accion: "cambiar_password"; id: string; password: string };

const ERROR_GENERICO = "No se pudo completar la operación. Intentá de nuevo.";

/** Llama a la Edge Function y devuelve el usuario actualizado o lanza Error con el mensaje del servidor. */
export async function llamarAdminUsuarios(payload: AccionUsuario): Promise<UsuarioAdmin> {
  const respuesta = await supabase.functions.invoke<{ usuario: UsuarioAdmin }>("admin-usuarios", {
    body: payload,
  });
  const error: unknown = respuesta.error;
  const data = respuesta.data;

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const contexto: unknown = error.context;
      if (contexto instanceof Response) {
        const cuerpo: unknown = await contexto.json().catch(() => null);
        if (
          typeof cuerpo === "object" &&
          cuerpo !== null &&
          "error" in cuerpo &&
          typeof cuerpo.error === "string"
        ) {
          throw new Error(cuerpo.error);
        }
      }
    }
    throw new Error(ERROR_GENERICO);
  }
  if (!data) throw new Error(ERROR_GENERICO);
  return data.usuario;
}
