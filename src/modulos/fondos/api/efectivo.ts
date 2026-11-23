import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/compartido/lib/supabase";
import { claveFondos } from "./claves";

/**
 * Caja de efectivo para cambio (fila única, compartida) = la cuenta `efectivo` de Fondos. Solo el
 * admin la lee (RLS, migración 26). Todo lo que mueve efectivo (compras, gastos, ventas, turnos,
 * movimientos del admin) debe invalidar `claveEfectivo` (y `claveFondos`).
 */
export const claveEfectivo = ["efectivo"] as const;
export const claveSaldoEfectivo = [...claveEfectivo, "saldo"] as const;

/** El saldo de la caja de cambio se lee solo con este hook (también en Fondos). */
export function useSaldoEfectivo() {
  return useQuery({
    queryKey: claveSaldoEfectivo,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from("caja_efectivo").select("saldo").single();
      if (error) throw error;
      return data.saldo;
    },
  });
}

/**
 * Movimiento manual de la caja de cambio. Usa `movimiento_efectivo` (no `movimiento_fondos`, que
 * deriva en ella) porque devuelve el saldo resultante, que se muestra al confirmar.
 */
export function useMovimientoEfectivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tipo,
      monto,
      nota,
    }: {
      tipo: "fondo_inicial" | "ingreso" | "retiro";
      monto: number;
      nota: string;
    }) => {
      const { data, error } = await supabase.rpc("movimiento_efectivo", {
        p_tipo: tipo,
        p_monto: monto,
        p_nota: nota,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: claveEfectivo }),
        queryClient.invalidateQueries({ queryKey: claveFondos }),
      ]),
  });
}
