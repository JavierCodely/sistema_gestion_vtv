import { useQuery } from "@tanstack/react-query";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { supabase } from "@/compartido/lib/supabase";
import type { Database } from "@/types/database";

type Funciones = Database["public"]["Functions"];

/** Un día de `ventas_por_dia` (los días que todavía no llegaron no vienen). */
export type VentasDelDia = Funciones["ventas_por_dia"]["Returns"][number];
export type FilaResumenVentas = Funciones["resumen_dashboard"]["Returns"][number];
export type FilaResumenGastos = Funciones["resumen_gastos"]["Returns"][number];

/** Filtro del dashboard: un turno (solo ese turno) o el rango del período. */
export interface FiltroDashboard {
  rango: RangoFechas;
  turnoId: number | null;
}

export const clavesDashboard = {
  todo: ["dashboard"] as const,
  semana: (rango: RangoFechas) => ["dashboard", "semana", rango.desde, rango.hasta] as const,
  ventas: ({ rango, turnoId }: FiltroDashboard) =>
    ["dashboard", "ventas", rango.desde, rango.hasta, turnoId] as const,
  gastos: ({ rango, turnoId }: FiltroDashboard) =>
    ["dashboard", "gastos", rango.desde, rango.hasta, turnoId] as const,
};

/**
 * El dashboard es un reporte: cada vez que se abre vuelve a consultar (las ventas, gastos y
 * anulaciones de las otras pantallas cambian sus números).
 */
const SIEMPRE_AL_ENTRAR = { staleTime: 0, refetchOnMount: "always" } as const;

/** Con turno se filtra solo por el turno; si no, por el rango del período. */
function argumentos({ rango, turnoId }: FiltroDashboard) {
  return turnoId === null
    ? { p_desde: rango.desde, p_hasta: rango.hasta }
    : { p_turno_id: turnoId };
}

/** Cantidad y total vendido por día (la BD trae solo hasta hoy). */
export function useVentasPorDia(rango: RangoFechas) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesDashboard.semana(rango),
    queryFn: async (): Promise<VentasDelDia[]> => {
      const { data, error } = await supabase.rpc("ventas_por_dia", {
        p_desde: rango.desde,
        p_hasta: rango.hasta,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Ventas del período o turno: total, por servicio, por categoría y por descuento (`resumen_dashboard`). */
export function useResumenVentas(filtro: FiltroDashboard) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesDashboard.ventas(filtro),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resumen_dashboard", argumentos(filtro));
      if (error) throw error;
      const de = (agrupacion: string) => data.filter((f) => f.agrupacion === agrupacion);
      return {
        total: de("total")[0] ?? null,
        servicios: de("servicio"),
        categorias: de("categoria"),
        descuentos: de("descuento"),
      };
    },
  });
}

/** Gastos del período o turno: total, compra de certificados / otros, por rubro y subcategoría. */
export function useResumenGastos(filtro: FiltroDashboard) {
  return useQuery({
    ...SIEMPRE_AL_ENTRAR,
    queryKey: clavesDashboard.gastos(filtro),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resumen_gastos", argumentos(filtro));
      if (error) throw error;
      const de = (agrupacion: string) => data.filter((f) => f.agrupacion === agrupacion);
      return {
        total: de("total")[0] ?? null,
        compraCertificados: de("compra_certificados")[0] ?? null,
        otrosGastos: de("otros_gastos")[0] ?? null,
        rubros: de("rubro"),
        subcategorias: de("subcategoria"),
      };
    },
  });
}
