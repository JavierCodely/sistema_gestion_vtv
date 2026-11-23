import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";
import type { Perfil } from "@/compartido/tipos";

export interface ValorAuth {
  sesion: Session | null;
  /** Perfil ACTIVO del usuario logueado (null si no hay sesión, no cargó o está desactivado). */
  perfil: Perfil | null;
  /** true mientras se resuelve la sesión inicial o el perfil. */
  cargando: boolean;
  /** Mensaje para mostrar en el login (ej. usuario desactivado). */
  aviso: string | null;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

export const AuthContext = createContext<ValorAuth | null>(null);

export function useAuth(): ValorAuth {
  const valor = useContext(AuthContext);
  if (!valor) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return valor;
}
