import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { llamarAdminUsuarios, type AccionUsuario } from "./admin-usuarios";
import { supabase } from "@/compartido/lib/supabase";

export const claveUsuarios = ["usuarios"] as const;

export function useUsuarios() {
  return useQuery({
    queryKey: claveUsuarios,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfiles")
        .select("id, nombre, email, rol, activo, creado_en")
        .order("activo", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });
}

export function useAccionUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accion: AccionUsuario) => llamarAdminUsuarios(accion),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: claveUsuarios }),
        // El admin puede haber editado su propio nombre.
        queryClient.invalidateQueries({ queryKey: ["perfil"] }),
      ]);
    },
  });
}
