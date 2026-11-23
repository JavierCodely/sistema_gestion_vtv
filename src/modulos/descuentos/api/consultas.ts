import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clavesDescuentos } from "@/compartido/lib/claves-descuentos";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums, Tablas } from "@/compartido/tipos";
import type { Database } from "@/types/database";
import type { DatosDescuento } from "../lib/validaciones";

type Funciones = Database["public"]["Functions"];

export type TipoDescuento = Enums["tipo_descuento"];

/** Descuento del catálogo con los servicios en los que se puede usar (`descuento_servicios`). */
export type Descuento = Pick<
  Tablas["descuentos"]["Row"],
  "id" | "nombre" | "tipo" | "valor" | "activo"
> & {
  servicioIds: number[];
};

/** Descuento que se puede usar al vender un servicio, con los montos calculados por la BD. */
export type DescuentoParaServicio = Funciones["descuentos_para_servicio"]["Returns"][number];

/** Fila de `resumen_descuentos()`: `agrupacion` = total (una fila) · descuento · servicio. */
export type FilaResumenDescuentos = Funciones["resumen_descuentos"]["Returns"][number];

export interface ResumenDescuentos {
  /** null si en el rango no hubo ventas con descuento. */
  total: FilaResumenDescuentos | null;
  porDescuento: FilaResumenDescuentos[];
  porServicio: FilaResumenDescuentos[];
}

export const TIPOS_DESCUENTO: Record<TipoDescuento, string> = {
  porcentaje: "Porcentaje",
  monto_fijo: "Monto fijo",
};

export const MENSAJES_ERROR_DESCUENTO = {
  repetido: "Ya existe un descuento con ese nombre.",
  enUso: "El descuento ya se usó en ventas: desactivalo en lugar de borrarlo.",
  restricciones: {
    descuentos_valor_valido:
      "El valor no es válido: un porcentaje va de más de 0 a menos de 100, y un monto fijo es mayor a cero.",
    descuentos_nombre_valido: "El nombre no es válido (hasta 100 caracteres).",
  },
};

const COLUMNAS_DESCUENTO = "id, nombre, tipo, valor, activo, descuento_servicios(servicio_id)";

type FilaDescuento = Pick<Descuento, "id" | "nombre" | "tipo" | "valor" | "activo"> & {
  descuento_servicios: { servicio_id: number }[];
};

function aDescuento({ descuento_servicios, ...resto }: FilaDescuento): Descuento {
  return { ...resto, servicioIds: descuento_servicios.map((d) => d.servicio_id) };
}

/** Catálogo completo (solo admin: el cajero ve solo los activos por RLS y no usa esta lista). */
export function useDescuentos() {
  return useQuery({
    queryKey: clavesDescuentos.lista,
    queryFn: async (): Promise<Descuento[]> => {
      const { data, error } = await supabase
        .from("descuentos")
        .select(COLUMNAS_DESCUENTO)
        .order("activo", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data.map(aDescuento);
    },
  });
}

/** Descuentos para vender un servicio (`null`: no consulta). Montos y precio final, de la BD. */
export function useDescuentosParaServicio(servicioId: number | null) {
  return useQuery({
    queryKey: clavesDescuentos.paraServicio(servicioId ?? 0),
    enabled: servicioId !== null,
    queryFn: async (): Promise<DescuentoParaServicio[]> => {
      const { data, error } = await supabase.rpc("descuentos_para_servicio", {
        p_servicio_id: servicioId ?? 0,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Estadísticas en un rango de días de negocio (YYYY-MM-DD, ambos incluidos). Solo admin.
 * `rango` null (fechas incompletas o invertidas): no consulta.
 */
export function useResumenDescuentos(rango: { desde: string; hasta: string } | null) {
  return useQuery({
    queryKey: clavesDescuentos.resumen(rango?.desde ?? "", rango?.hasta ?? ""),
    enabled: rango !== null,
    queryFn: async (): Promise<ResumenDescuentos> => {
      const { data, error } = await supabase.rpc("resumen_descuentos", {
        p_desde: rango?.desde ?? "",
        p_hasta: rango?.hasta ?? "",
      });
      if (error) throw error;
      // La BD ya las devuelve ordenadas de mayor a menor total descontado.
      return {
        total: data.find((f) => f.agrupacion === "total") ?? null,
        porDescuento: data.filter((f) => f.agrupacion === "descuento"),
        porServicio: data.filter((f) => f.agrupacion === "servicio"),
      };
    },
  });
}

function useInvalidarDescuentos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: clavesDescuentos.todo });
}

export function useCrearDescuento() {
  const invalidar = useInvalidarDescuentos();
  return useMutation({
    mutationFn: async (datos: DatosDescuento): Promise<Descuento> => {
      const { data, error } = await supabase
        .from("descuentos")
        .insert(datos)
        .select(COLUMNAS_DESCUENTO)
        .single();
      if (error) throw error;
      return aDescuento(data);
    },
    onSuccess: invalidar,
  });
}

export function useActualizarDescuento() {
  const invalidar = useInvalidarDescuentos();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: number;
      cambios: Partial<DatosDescuento>;
    }): Promise<Descuento> => {
      const { data, error } = await supabase
        .from("descuentos")
        .update(cambios)
        .eq("id", id)
        .select(COLUMNAS_DESCUENTO)
        .single();
      if (error) throw error;
      return aDescuento(data);
    },
    onSuccess: invalidar,
  });
}

/** Reemplaza de una vez (atómico en la BD) los servicios en los que se puede usar el descuento. */
export function useFijarServiciosDescuento() {
  const invalidar = useInvalidarDescuentos();
  return useMutation({
    mutationFn: async ({ id, servicioIds }: { id: number; servicioIds: number[] }) => {
      const { data, error } = await supabase.rpc("fijar_servicios_descuento", {
        p_descuento_id: id,
        p_servicio_ids: servicioIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}
