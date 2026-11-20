import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import type { Rol } from "@/compartido/tipos";
import { rutaInicio } from "./lib/navegacion";
import { useAuth } from "./contexto";

/**
 * Exige sesión con perfil activo y, si se indica, uno de los roles.
 * Es solo UX: la seguridad real está en la RLS y en las RPC de la BD.
 */
export function RutaProtegida({ roles, children }: { roles?: Rol[]; children: ReactNode }) {
  const { perfil, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <Cargando />;
  if (!perfil) {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  }
  if (roles && !roles.includes(perfil.rol)) {
    return <Navigate to={rutaInicio(perfil.rol)} replace />;
  }
  return <>{children}</>;
}

/** "/" → pantalla inicial según el rol, o login. */
export function RedireccionInicial() {
  const { perfil, cargando } = useAuth();
  if (cargando) return <Cargando />;
  return <Navigate to={perfil ? rutaInicio(perfil.rol) : "/login"} replace />;
}
