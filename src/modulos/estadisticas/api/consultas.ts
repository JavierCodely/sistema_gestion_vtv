import { useQuery } from "@tanstack/react-query";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { supabase } from "@/compartido/lib/supabase";
import type { Database } from "@/types/database";

type Funciones = Database["public"]["Functions"];

export type EstadisticasVehiculos = Funciones["estadisticas_vehiculos"]["Returns"][number];
export type FilaCategoria = Funciones["estadisticas_categorias"]["Returns"][number];
export type EstadisticasCondicionales = Funciones["estadisticas_condicionales"]["Returns"][number];
export type FilaHorario = Funciones["estadisticas_horarios"]["Returns"][number];
export type FilaComparacion = Funciones["comparacion_anual"]["Returns"][number];

export const clavesEstadisticas = {
  todo: ["estadisticas"] as const,
  vehiculos: (r: RangoFechas) => ["estadisticas", "vehiculos", r.desde, r.hasta] as const,
  categorias: (r: RangoFechas) => ["estadisticas", "categorias", r.desde, r.hasta] as const,
  condicionales: (r: RangoFechas) => ["estadisticas", "condicionales", r.desde, r.hasta] as const,
  horarios: (r: RangoFechas) => ["estadisticas", "horarios", r.desde, r.hasta] as const,
  comparacion: (anio: number) => ["estadisticas", "comparacion", anio] as const,
};

/** Es un reporte: cada vez que se abre vuelve a consultar (como el Dashboard). */
const SIEMPRE_AL_ENTRAR = { staleTime: 0, refetchOnMount: "always" } as const;

const rango = (r: RangoFechas) => ({ p_desde: r.desde, p_hasta: r.hasta });

/** La BD devuelve siempre una fila; si no viene, es un error de lectura. */
function unaFila<T>(filas: T[], mensaje: string): T {
  const fila = filas[0];
  if (!fila) throw new Error(mensaje);
  return fila;
}

/** Vehículos distintos, nuevos, que vuelven, repetidos, ticket promedio y anuladas. */
export function useEstadisticasVehiculos(r: RangoFechas) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesEstadisticas.vehiculos(r),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_vehiculos", rango(r));
      if (error) throw error;
      return unaFila(data, "No se pudieron leer las estadísticas de vehículos.");
    },
  });
}

/** Tipo de vehículo (categoría): ventas, vehículos distintos y total. */
export function useEstadisticasCategorias(r: RangoFechas) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesEstadisticas.categorias(r),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_categorias", rango(r));
      if (error) throw error;
      return data;
    },
  });
}

/** Qué pasó con las condicionales vendidas en el período. */
export function useEstadisticasCondicionales(r: RangoFechas) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesEstadisticas.condicionales(r),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_condicionales", rango(r));
      if (error) throw error;
      return unaFila(data, "No se pudieron leer las estadísticas de condicionales.");
    },
  });
}

/** Ventas por día de la semana (1 = lunes) y por hora. */
export function useEstadisticasHorarios(r: RangoFechas) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesEstadisticas.horarios(r),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_horarios", rango(r));
      if (error) throw error;
      return {
        dias: data.filter((f) => f.agrupacion === "dia"),
        horas: data.filter((f) => f.agrupacion === "hora"),
      };
    },
  });
}

/** Cada mes del año contra el mismo mes del anterior. */
export function useComparacionAnual(anio: number) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesEstadisticas.comparacion(anio),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comparacion_anual", { p_anio: anio });
      if (error) throw error;
      return data;
    },
  });
}
