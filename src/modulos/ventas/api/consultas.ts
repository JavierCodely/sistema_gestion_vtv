import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { siguienteCursor, TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { supabase } from "@/compartido/lib/supabase";
import type { Database } from "@/types/database";

type FilaTurno = Database["public"]["Views"]["v_turnos"]["Row"];

/** Turno con sus totales en vivo (los calcula `v_turnos`; los anulados no suman). Solo admin. */
export type Turno = Pick<
  FilaTurno,
  | "id"
  | "caja_nombre"
  | "usuario_nombre"
  | "abierto_en"
  | "cerrado_en"
  | "abierto"
  | "observaciones"
  | "ventas_cantidad"
  | "ventas_efectivo"
  | "ventas_transferencia"
  | "ventas_tarjeta"
  | "ventas_total"
  | "gastos_total"
  | "neto"
>;

/** Prefijo que invalidan las mutaciones de caja (`["turnos"]`). */
export const claves = {
  turnos: ["turnos", "lista"] as const,
  turno: (id: number) => ["turnos", "detalle", id] as const,
};

const COLUMNAS_TURNO =
  "id, caja_nombre, usuario_nombre, abierto_en, cerrado_en, abierto, observaciones, ventas_cantidad, ventas_efectivo, ventas_transferencia, ventas_tarjeta, ventas_total, gastos_total, neto";

export function useTurnos() {
  return useInfiniteQuery({
    queryKey: claves.turnos,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<Turno[]> => {
      let consulta = supabase
        .from("v_turnos")
        .select(COLUMNAS_TURNO)
        .order("id", { ascending: false })
        .limit(TAMANO_PAGINA);
      if (pageParam !== null) consulta = consulta.lt("id", pageParam);
      const { data, error } = await consulta;
      if (error) throw error;
      return data;
    },
    getNextPageParam: siguienteCursor,
  });
}

/** `id` inválido (≤ 0): la consulta no se ejecuta. */
export function useTurno(id: number) {
  return useQuery({
    queryKey: claves.turno(id),
    enabled: id > 0,
    queryFn: async (): Promise<Turno | null> => {
      const { data, error } = await supabase
        .from("v_turnos")
        .select(COLUMNAS_TURNO)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
