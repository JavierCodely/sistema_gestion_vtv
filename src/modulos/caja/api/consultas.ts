import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums, Tablas } from "@/compartido/tipos";
import { claveEfectivo } from "@/modulos/efectivo/api/consultas";

export type MedioPago = Enums["medio_pago"];

/** Turno abierto del usuario. Sin totales: el cajero no los ve (los ve el admin en Ventas). */
export type TurnoActual = Pick<Tablas["turnos"]["Row"], "id" | "caja_id" | "abierto_en"> & {
  cajas: { nombre: string } | null;
};

export interface CajaParaTurno {
  id: number;
  nombre: string;
  ocupada: boolean;
  ocupada_por: string | null;
}

/** Venta tal como la ve quien la puede leer (RLS: las propias o el admin). Sin costos. */
export type Venta = Pick<
  Tablas["ventas"]["Row"],
  | "id"
  | "creado_en"
  | "turno_id"
  | "servicio_nombre"
  | "precio"
  | "medio_pago"
  | "patente"
  | "sin_stock"
  | "anulada"
  | "anulada_motivo"
  | "anulada_en"
>;

/** Certificado que se usará al vender un servicio (`null`: no lleva o no hay configurado). */
export type CertificadoDeVenta = Pick<
  Tablas["certificados"]["Row"],
  "id" | "nombre" | "stock_hojas"
> | null;

export const claves = {
  turnoActual: ["caja", "turno-actual"] as const,
  cajasParaTurno: ["caja", "cajas-para-turno"] as const,
  ventasDeTurno: (turnoId: number) => ["caja", "ventas", turnoId] as const,
  certificadoDeServicio: (servicioId: number) => ["caja", "certificado", servicioId] as const,
};

/** Columnas de `ventas` que se leen (nunca `*`: los costos no son legibles por columna). */
export const COLUMNAS_VENTA =
  "id, creado_en, turno_id, servicio_nombre, precio, medio_pago, patente, sin_stock, anulada, anulada_motivo, anulada_en";

export const MEDIOS_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

export const MENSAJES_ERROR_VENTA = {
  restricciones: { ventas_patente_largo: "La patente no puede superar los 10 caracteres." },
};

export function useTurnoActual(usuarioId: string) {
  return useQuery({
    queryKey: [...claves.turnoActual, usuarioId],
    queryFn: async (): Promise<TurnoActual | null> => {
      const { data, error } = await supabase
        .from("turnos")
        .select("id, caja_id, abierto_en, cajas(nombre)")
        .eq("usuario_id", usuarioId)
        .is("cerrado_en", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCajasParaTurno() {
  return useQuery({
    queryKey: claves.cajasParaTurno,
    queryFn: async (): Promise<CajaParaTurno[]> => {
      const { data, error } = await supabase.rpc("cajas_para_turno");
      if (error) throw error;
      return data;
    },
  });
}

/** `turnoId` inválido (≤ 0): la consulta no se ejecuta. */
export function useVentasDeTurno(turnoId: number) {
  return useQuery({
    queryKey: claves.ventasDeTurno(turnoId),
    enabled: turnoId > 0,
    queryFn: async (): Promise<Venta[]> => {
      const { data, error } = await supabase
        .from("ventas")
        .select(COLUMNAS_VENTA)
        .eq("turno_id", turnoId)
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * `certificado_para_servicio` devuelve null cuando no hay certificado, pero el esquema generado
 * la tipa como `number`: se valida el valor real en vez de confiar en el tipo.
 */
function idOpcional(valor: unknown): number | null {
  return typeof valor === "number" ? valor : null;
}

export function useCertificadoDeServicio(servicioId: number | null) {
  return useQuery({
    queryKey: claves.certificadoDeServicio(servicioId ?? 0),
    enabled: servicioId !== null,
    queryFn: async (): Promise<CertificadoDeVenta> => {
      const { data: id, error } = await supabase.rpc("certificado_para_servicio", {
        p_servicio_id: servicioId ?? 0,
      });
      if (error) throw error;
      const certificadoId = idOpcional(id);
      if (certificadoId === null) return null;
      const { data, error: errorCert } = await supabase
        .from("certificados")
        .select("id, nombre, stock_hojas")
        .eq("id", certificadoId)
        .single();
      if (errorCert) throw errorCert;
      return data;
    },
  });
}

/** Todo lo que cambia con un turno o una venta: turno, cajas, ventas, stock, efectivo, admin. */
function useInvalidarCaja() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["caja"] }),
      queryClient.invalidateQueries({ queryKey: ["turnos"] }),
      queryClient.invalidateQueries({ queryKey: ["certificados"] }),
      queryClient.invalidateQueries({ queryKey: claveEfectivo }),
    ]);
}

export function useAbrirTurno() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: async (cajaId: number) => {
      const { data, error } = await supabase.rpc("abrir_turno", { p_caja_id: cajaId });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // Si otro la ocupó entre que se listó y se eligió, la lista tiene que reflejarlo.
    onError: invalidar,
  });
}

/** Sin `turnoId` cierra el turno propio; con `turnoId` (admin) cierra cualquiera. */
export function useCerrarTurno() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: async ({ observaciones, turnoId }: { observaciones: string; turnoId?: number }) => {
      const { data, error } = await supabase.rpc("cerrar_turno", {
        ...(observaciones && { p_observaciones: observaciones }),
        ...(turnoId !== undefined && { p_turno_id: turnoId }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // Si el admin ya lo cerró, la pantalla vuelve sola a "Abrir turno".
    onError: invalidar,
  });
}

export interface DatosVenta {
  servicioId: number;
  medioPago: MedioPago;
  patente: string | null;
}

export function useRegistrarVenta() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: async ({ servicioId, medioPago, patente }: DatosVenta) => {
      const { data, error } = await supabase.rpc("registrar_venta", {
        p_servicio_id: servicioId,
        p_medio_pago: medioPago,
        ...(patente && { p_patente: patente }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // El rechazo puede venir de un cambio ajeno (turno cerrado por el admin, servicio o caja
    // desactivados): se vuelve a leer todo para que la pantalla muestre el estado real.
    onError: invalidar,
  });
}

/** Solo admin (lo controla la RPC). Si fue en efectivo, el monto sale de la caja de cambio. */
export function useAnularVenta() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: async ({ ventaId, motivo }: { ventaId: number; motivo: string }) => {
      const { data, error } = await supabase.rpc("anular_venta", {
        p_venta_id: ventaId,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // Ej. otro admin la anuló recién: el detalle se actualiza.
    onError: invalidar,
  });
}
