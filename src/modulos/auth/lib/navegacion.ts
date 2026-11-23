import type { Rol } from "@/compartido/tipos";

/** Pantalla inicial según el rol. */
export function rutaInicio(rol: Rol): string {
  return rol === "admin" ? "/admin" : "/caja";
}
