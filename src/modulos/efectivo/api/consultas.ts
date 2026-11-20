import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/compartido/lib/supabase";

/**
 * Caja de efectivo para cambio (fila única, compartida). Todo lo que mueve efectivo
 * (compras, gastos, ventas, movimientos del admin) debe invalidar `claveEfectivo`.
 */
export const claveEfectivo = ["efectivo"] as const;
export const claveSaldoEfectivo = [...claveEfectivo, "saldo"] as const;

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
