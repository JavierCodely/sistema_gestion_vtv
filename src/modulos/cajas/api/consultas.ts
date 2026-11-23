import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/compartido/lib/supabase";
import type { Tablas } from "@/compartido/tipos";

export type Caja = Pick<Tablas["cajas"]["Row"], "id" | "nombre" | "activa">;
type CambiosCaja = Pick<Tablas["cajas"]["Update"], "nombre" | "activa">;

export const claveCajas = ["cajas"] as const;

export const MENSAJES_ERROR_CAJA = { repetido: "Ya existe una caja con ese nombre." };

export function useCajas() {
  return useQuery({
    queryKey: claveCajas,
    queryFn: async (): Promise<Caja[]> => {
      const { data, error } = await supabase
        .from("cajas")
        .select("id, nombre, activa")
        .order("activa", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });
}

export function useCrearCaja() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string): Promise<Caja> => {
      const { data, error } = await supabase
        .from("cajas")
        .insert({ nombre })
        .select("id, nombre, activa")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claveCajas }),
  });
}

export function useActualizarCaja() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: number; cambios: CambiosCaja }): Promise<Caja> => {
      const { data, error } = await supabase
        .from("cajas")
        .update(cambios)
        .eq("id", id)
        .select("id, nombre, activa")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claveCajas }),
  });
}
