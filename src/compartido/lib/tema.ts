import { createContext, useContext } from "react";

/**
 * Tema claro/oscuro con la clase `dark` en <html>. La preferencia se guarda en localStorage
 * ("vtv-tema": "light" | "dark"; sin valor = la del sistema). El script de index.html aplica la
 * clase antes de pintar (sin parpadeo) y `ProveedorTema` la mantiene sincronizada.
 */
export const CLAVE_TEMA = "vtv-tema";

export type Tema = "light" | "dark";
export type Preferencia = Tema | "system";

export interface ContextoTema {
  /** Tema efectivo (la preferencia guardada o, si no hay, la del sistema). */
  tema: Tema;
  cambiarTema: (tema: Tema) => void;
}

export const ContextoDeTema = createContext<ContextoTema | null>(null);

export const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

export function useTema(): ContextoTema {
  const contexto = useContext(ContextoDeTema);
  if (!contexto) throw new Error("useTema necesita estar dentro de <ProveedorTema>");
  return contexto;
}
