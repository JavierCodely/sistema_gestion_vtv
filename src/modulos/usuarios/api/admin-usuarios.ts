import type { Rol } from "@/compartido/tipos";
import { invocarFuncion } from "@/compartido/lib/funciones";

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

/** Llama a la Edge Function y devuelve el usuario actualizado o lanza Error con el mensaje del servidor. */
export async function llamarAdminUsuarios(payload: AccionUsuario): Promise<UsuarioAdmin> {
  return (await invocarFuncion<{ usuario: UsuarioAdmin }>("admin-usuarios", payload)).usuario;
}
