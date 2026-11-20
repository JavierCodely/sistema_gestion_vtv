import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/compartido/lib/supabase";
import type { Tablas } from "@/compartido/tipos";
import type { DatosServicio } from "../lib/validaciones";

export type Categoria = Pick<Tablas["categorias_servicio"]["Row"], "id" | "nombre" | "activa">;
export type Servicio = Pick<
  Tablas["servicios"]["Row"],
  "id" | "nombre" | "categoria_id" | "precio" | "requiere_certificado" | "activo"
>;
type CambiosCategoria = Pick<Tablas["categorias_servicio"]["Update"], "nombre" | "activa">;
type CambiosServicio = Partial<DatosServicio> & Pick<Tablas["servicios"]["Update"], "activo">;

export const claveCategorias = ["categorias-servicio"] as const;
export const claveServicios = ["servicios"] as const;

export const MENSAJES_ERROR_CATEGORIA = { repetido: "Ya existe una categoría con ese nombre." };
export const MENSAJES_ERROR_SERVICIO = { repetido: "Ya existe un servicio con ese nombre." };

const COLUMNAS_SERVICIO = "id, nombre, categoria_id, precio, requiere_certificado, activo";

export function useCategorias() {
  return useQuery({
    queryKey: claveCategorias,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from("categorias_servicio")
        .select("id, nombre, activa")
        .order("activa", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });
}

export function useServicios() {
  return useQuery({
    queryKey: claveServicios,
    queryFn: async (): Promise<Servicio[]> => {
      const { data, error } = await supabase
        .from("servicios")
        .select(COLUMNAS_SERVICIO)
        .order("activo", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidarCatalogo() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: claveCategorias }),
      queryClient.invalidateQueries({ queryKey: claveServicios }),
    ]);
}

export function useCrearCategoria() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async (nombre: string): Promise<Categoria> => {
      const { data, error } = await supabase
        .from("categorias_servicio")
        .insert({ nombre })
        .select("id, nombre, activa")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useActualizarCategoria() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: number;
      cambios: CambiosCategoria;
    }): Promise<Categoria> => {
      const { data, error } = await supabase
        .from("categorias_servicio")
        .update(cambios)
        .eq("id", id)
        .select("id, nombre, activa")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useCrearServicio() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async (datos: DatosServicio): Promise<Servicio> => {
      const { data, error } = await supabase
        .from("servicios")
        .insert(datos)
        .select(COLUMNAS_SERVICIO)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useActualizarServicio() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: number;
      cambios: CambiosServicio;
    }): Promise<Servicio> => {
      const { data, error } = await supabase
        .from("servicios")
        .update(cambios)
        .eq("id", id)
        .select(COLUMNAS_SERVICIO)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}
