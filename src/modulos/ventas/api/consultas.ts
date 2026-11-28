import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clavesImpuestos } from "@/compartido/lib/claves-impuestos";
import { siguienteCursor, TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { supabase } from "@/compartido/lib/supabase";
import { COLUMNAS_VENTA, type MedioPago, type Venta } from "@/modulos/caja/api/consultas";
import { claveFondos } from "@/modulos/fondos/api/claves";
import { claveEfectivo } from "@/modulos/fondos/api/efectivo";
import type { Database } from "@/types/database";

type FilaTurno = Database["public"]["Views"]["v_turnos"]["Row"];

/**
 * Turno de una caja con sus totales en vivo (los calcula `v_turnos`; los anulados no suman). Solo
 * admin. El turno es de la caja: `abierto_por_nombre` es el admin que lo abrió y `atendido_por`
 * quienes vendieron o gastaron en él (más el cajero asignado de los turnos anteriores a la migración 33).
 * `efectivo_en_caja` = efectivo inicial + ventas en efectivo − gastos en efectivo: lo que vuelve a
 * la caja de cambio al cerrar; en un turno cerrado es la foto del cierre. NULL en turnos anteriores al
 * efectivo por turno (migración 27). `total_efectivo` es la foto de las ventas en efectivo que guardó
 * `cerrar_turno` (NULL mientras está abierto); `ventas_efectivo` y `gastos_efectivo` son en vivo.
 */
export type Turno = Pick<
  FilaTurno,
  | "id"
  | "caja_nombre"
  | "abierto_por_nombre"
  | "atendido_por"
  | "abierto_en"
  | "cerrado_en"
  | "abierto"
  | "observaciones"
  | "ventas_cantidad"
  | "ventas_efectivo"
  | "ventas_transferencia"
  | "ventas_total"
  | "gastos_total"
  | "neto"
  | "efectivo_inicial"
  | "gastos_efectivo"
  | "efectivo_en_caja"
  | "efectivo_cierre"
  | "total_efectivo"
>;

/**
 * Prefijo que invalidan las mutaciones de caja (`["turnos"]`): anular una venta pasada (con
 * `useAnularVenta` de caja) también refresca su lista.
 */
export const claves = {
  /** Historial por fecha de apertura (día de negocio). */
  turnos: (rango: RangoFechas) => ["turnos", "lista", rango.desde, rango.hasta] as const,
  /** Turnos abiertos con totales y efectivo (la sección "en vivo" de Ventas). */
  abiertosConTotales: ["turnos", "abiertos-con-totales"] as const,
  /** Totales sumados por la BD de los turnos abiertos en el rango (`resumen_turnos`). */
  resumen: (rango: RangoFechas) => ["turnos", "resumen", rango.desde, rango.hasta] as const,
  turno: (id: number) => ["turnos", "detalle", id] as const,
  ventasPasadas: ["turnos", "ventas-pasadas"] as const,
  /** Turnos abiertos en un período, para los filtros de los reportes (impuestos, dashboard). */
  delPeriodo: (rango: RangoFechas) => ["turnos", "periodo", rango.desde, rango.hasta] as const,
  /** Ventas de una patente (bajo `["turnos"]`: vender, anular y cargar ventas pasadas las invalidan). */
  porPatente: (patente: string) => ["turnos", "patente", patente] as const,
};

const COLUMNAS_TURNO =
  "id, caja_nombre, abierto_por_nombre, atendido_por, abierto_en, cerrado_en, abierto, observaciones, ventas_cantidad, ventas_efectivo, ventas_transferencia, ventas_total, gastos_total, neto, efectivo_inicial, gastos_efectivo, efectivo_en_caja, efectivo_cierre, total_efectivo";

/**
 * Turnos con apertura (día de negocio, hora AR: `v_turnos.fecha_apertura`) en el rango, del más
 * nuevo al más viejo. `rango` null (fechas incompletas o invertidas): no consulta.
 */
export function useTurnos(rango: RangoFechas | null) {
  return useInfiniteQuery({
    queryKey: claves.turnos(rango ?? { desde: "", hasta: "" }),
    enabled: rango !== null,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<Turno[]> => {
      if (!rango) return [];
      let consulta = supabase
        .from("v_turnos")
        .select(COLUMNAS_TURNO)
        .gte("fecha_apertura", rango.desde)
        .lte("fecha_apertura", rango.hasta)
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

/** Turnos abiertos de todas las cajas con sus totales en vivo, del más viejo al más nuevo (admin). */
export function useTurnosAbiertosConTotales() {
  return useQuery({
    queryKey: claves.abiertosConTotales,
    queryFn: async (): Promise<Turno[]> => {
      const { data, error } = await supabase
        .from("v_turnos")
        .select(COLUMNAS_TURNO)
        .eq("abierto", true)
        .order("abierto_en", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export type ResumenTurnos = Database["public"]["Functions"]["resumen_turnos"]["Returns"][number];

/** Totales de los turnos abiertos en el rango, sumados por la BD (sin anulados). Solo admin. */
export function useResumenTurnos(rango: RangoFechas | null) {
  return useQuery({
    queryKey: claves.resumen(rango ?? { desde: "", hasta: "" }),
    enabled: rango !== null,
    queryFn: async (): Promise<ResumenTurnos | null> => {
      if (!rango) return null;
      const { data, error } = await supabase.rpc("resumen_turnos", {
        p_desde: rango.desde,
        p_hasta: rango.hasta,
      });
      if (error) throw error;
      return data[0] ?? null;
    },
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

/**
 * Venta cargada con fecha pasada (sin turno): `creado_en` es la fecha y hora elegidas y `cargada_en`
 * cuándo se cargó. Solo admin.
 */
export type VentaPasada = Venta & {
  cargada_en: string | null;
  cajas: { nombre: string } | null;
};

const COLUMNAS_VENTA_PASADA = `${COLUMNAS_VENTA}, cargada_en, cajas(nombre)`;

/** En orden de carga (cursor sobre `id`); la fecha de cada venta se muestra en la tabla. */
export function useVentasPasadas() {
  return useInfiniteQuery({
    queryKey: claves.ventasPasadas,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<VentaPasada[]> => {
      let consulta = supabase
        .from("ventas")
        .select(COLUMNAS_VENTA_PASADA)
        .is("turno_id", null)
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

export interface DatosVentaPasada {
  /** YYYY-MM-DD y HH:MM, en hora argentina (la BD los interpreta así). */
  fecha: string;
  hora: string;
  cajaId: number;
  servicioId: number;
  medioPago: MedioPago;
  precio: number;
  patente: string | null;
}

/** Solo admin (lo controla la RPC). Si fue en efectivo, entra a la caja de cambio. */
export function useRegistrarVentaPasada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosVentaPasada) => {
      const { data, error } = await supabase.rpc("registrar_venta_pasada", {
        p_fecha: datos.fecha,
        p_hora: datos.hora,
        p_caja_id: datos.cajaId,
        p_servicio_id: datos.servicioId,
        p_medio_pago: datos.medioPago,
        p_precio: datos.precio,
        ...(datos.patente && { p_patente: datos.patente }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: claves.ventasPasadas }),
        queryClient.invalidateQueries({ queryKey: claveEfectivo }),
        queryClient.invalidateQueries({ queryKey: claveFondos }),
        queryClient.invalidateQueries({ queryKey: clavesImpuestos.resumenes }),
      ]),
  });
}

/** Turno para elegir en un filtro: caja y apertura (sin dinero). */
export type TurnoDelPeriodo = Pick<FilaTurno, "id" | "caja_nombre" | "abierto_en">;

/** Turnos abiertos en el período (fecha de apertura), del más nuevo al más viejo (admin). */
export function useTurnosDelPeriodo(rango: RangoFechas) {
  return useQuery({
    queryKey: claves.delPeriodo(rango),
    queryFn: async (): Promise<TurnoDelPeriodo[]> => {
      const { data, error } = await supabase
        .from("v_turnos")
        .select("id, caja_nombre, abierto_en")
        .gte("fecha_apertura", rango.desde)
        .lte("fecha_apertura", rango.hasta)
        .order("abierto_en", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Venta de una patente (`ventas_por_patente`, solo admin): servicio, certificado entregado y la
 * relación condicional ↔ vuelta (migración 40). `medio` = "mixto" en un pago mixto. Sin costos.
 */
type FilaVentaDePatente = Database["public"]["Functions"]["ventas_por_patente"]["Returns"][number];
/** Columnas que la RPC devuelve en NULL (el esquema generado las marca como no nulas). */
type ColumnasAnulables =
  | "certificado_nombre"
  | "condicional_vence"
  | "condicional_saldo"
  | "condicional_servicio"
  | "vuelta_de"
  | "vuelta_venta_id";
export type VentaDePatente = Omit<FilaVentaDePatente, ColumnasAnulables> & {
  [K in ColumnasAnulables]: FilaVentaDePatente[K] | null;
};

/** Mínimo de caracteres para buscar (mismo control que la BD). */
export const MINIMO_BUSQUEDA_PATENTE = 3;

/**
 * Ventas cuya patente empieza con `patente` (ya normalizada), de la más nueva a la más vieja (hasta
 * 500). Con menos de 3 caracteres no consulta.
 */
export function useVentasPorPatente(patente: string) {
  return useQuery({
    queryKey: claves.porPatente(patente),
    enabled: patente.length >= MINIMO_BUSQUEDA_PATENTE,
    queryFn: async (): Promise<VentaDePatente[]> => {
      const { data, error } = await supabase.rpc("ventas_por_patente", { p_patente: patente });
      if (error) throw error;
      return data;
    },
  });
}
