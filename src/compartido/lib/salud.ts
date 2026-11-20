import { supabaseAnonKey, supabaseUrl } from "@/compartido/lib/supabase";

/** Verifica que el backend de Supabase responda (endpoint público de salud de Auth). */
export async function verificarConexion(): Promise<boolean> {
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey },
    });
    return r.ok;
  } catch {
    return false;
  }
}
