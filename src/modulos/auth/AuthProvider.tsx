import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MENSAJE_DESACTIVADO, traducirErrorLogin } from "./lib/errores-login";
import { supabase } from "@/compartido/lib/supabase";
import { AuthContext, type ValorAuth } from "./contexto";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargandoSesion(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const uid = sesion?.user.id ?? null;

  const perfil = useQuery({
    queryKey: ["perfil", uid],
    enabled: uid !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfiles")
        .select("*")
        .eq("id", uid ?? "")
        .single();
      if (error) throw error;
      // Un usuario desactivado que todavía tenía sesión queda afuera.
      if (!data.activo) {
        setAviso(MENSAJE_DESACTIVADO);
        await supabase.auth.signOut();
        return null;
      }
      return data;
    },
  });

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    setAviso(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(traducirErrorLogin(error));
  }, []);

  const valor = useMemo<ValorAuth>(
    () => ({
      sesion,
      perfil: perfil.data ?? null,
      cargando: cargandoSesion || (uid !== null && perfil.isPending),
      aviso,
      iniciarSesion,
      cerrarSesion,
    }),
    [
      sesion,
      perfil.data,
      perfil.isPending,
      cargandoSesion,
      uid,
      aviso,
      iniciarSesion,
      cerrarSesion,
    ],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
