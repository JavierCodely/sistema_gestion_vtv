import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siguienteCursor, siguienteCursorDe, TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { supabase } from "@/compartido/lib/supabase";
import type { Database } from "@/types/database";
import type { Cuenta, TipoMovimientoManual } from "../lib/fondos";
import { claveFondos, clavesFondos } from "./claves";
import { claveEfectivo } from "./efectivo";

type Funciones = Database["public"]["Functions"];
type Vistas = Database["public"]["Views"];

/** Fila de `resumen_fondos()`: saldo de todos los tiempos; ingresos, egresos (positivo) y neto del rango. */
export type ResumenCuenta = Funciones["resumen_fondos"]["Returns"][number];
/** Fila única de `resumen_ventas_mixtas()`. Informativa: ya está incluida en las cuentas. */
export type ResumenVentasMixtas = Funciones["resumen_ventas_mixtas"]["Returns"][number];

const COLUMNAS_LIBRO =
  "cuenta, clave, fecha, fecha_local, origen, tipo, sentido, descripcion, nota, monto, usuario_nombre, venta_id, gasto_id, compra_id, movimiento_id, caja_nombre, pago_mixto, venta_pasada";

type FilaLibro = Pick<
  Vistas["v_movimientos_fondos"]["Row"],
  | "cuenta"
  | "clave"
  | "fecha"
  | "fecha_local"
  | "origen"
  | "tipo"
  | "sentido"
  | "descripcion"
  | "nota"
  | "monto"
  | "usuario_nombre"
  | "venta_id"
  | "gasto_id"
  | "compra_id"
  | "movimiento_id"
  | "caja_nombre"
  | "pago_mixto"
  | "venta_pasada"
>;

/** Una fila del libro de una cuenta (`v_movimientos_fondos`), con `monto` con signo. */
export type MovimientoFondos = Omit<
  FilaLibro,
  "cuenta" | "clave" | "fecha" | "origen" | "monto" | "pago_mixto" | "venta_pasada"
> & {
  cuenta: Cuenta;
  clave: string;
  fecha: string;
  origen: string;
  monto: number;
  pago_mixto: boolean;
  venta_pasada: boolean;
  /** Solo en efectivo: saldo de la caja de cambio después del movimiento (`movimientos_efectivo`). */
  saldo_resultante: number | null;
};

/** Cursor del libro: `(fecha, clave)` de la última fila (la vista no tiene un `id` propio). */
interface CursorLibro {
  fecha: string;
  clave: string;
}

function aMovimiento(fila: FilaLibro): MovimientoFondos {
  const { cuenta, clave, fecha, origen, monto } = fila;
  // Son NOT NULL en todas las ramas de la vista; el tipo generado de una vista no lo sabe.
  if (cuenta === null || clave === null || fecha === null || origen === null || monto === null) {
    throw new Error("El libro de Fondos devolvió un movimiento incompleto.");
  }
  return {
    ...fila,
    cuenta,
    clave,
    fecha,
    origen,
    monto,
    pago_mixto: fila.pago_mixto ?? false,
    venta_pasada: fila.venta_pasada ?? false,
    saldo_resultante: null,
  };
}

/**
 * Saldos y totales de las tres cuentas en el rango (`resumen_fondos`). Solo admin. `rango` null
 * (fechas incompletas o invertidas): no consulta.
 */
export function useResumenFondos(rango: RangoFechas | null) {
  return useQuery({
    queryKey: clavesFondos.resumen(rango ?? { desde: "", hasta: "" }),
    enabled: rango !== null,
    queryFn: async (): Promise<Partial<Record<Cuenta, ResumenCuenta>>> => {
      const { data, error } = await supabase.rpc("resumen_fondos", {
        p_desde: rango?.desde ?? "",
        p_hasta: rango?.hasta ?? "",
      });
      if (error) throw error;
      return Object.fromEntries(data.map((fila) => [fila.cuenta, fila]));
    },
  });
}

/**
 * Libro de una cuenta en el rango (`fecha_local` entre desde y hasta), del más nuevo al más viejo,
 * con "Ver más". Se pagina por `(fecha desc, clave desc)`: la fecha viaja tal cual llega (con
 * microsegundos), entre comillas. En efectivo suma el saldo resultante de cada movimiento.
 */
export function useLibroFondos(cuenta: Cuenta, rango: RangoFechas | null) {
  return useInfiniteQuery({
    queryKey: clavesFondos.libro(cuenta, rango ?? { desde: "", hasta: "" }),
    enabled: rango !== null,
    initialPageParam: null as CursorLibro | null,
    queryFn: async ({ pageParam }): Promise<MovimientoFondos[]> => {
      let consulta = supabase
        .from("v_movimientos_fondos")
        .select(COLUMNAS_LIBRO)
        .eq("cuenta", cuenta)
        .gte("fecha_local", rango?.desde ?? "")
        .lte("fecha_local", rango?.hasta ?? "")
        .order("fecha", { ascending: false })
        .order("clave", { ascending: false })
        .limit(TAMANO_PAGINA);
      if (pageParam !== null) {
        consulta = consulta.or(
          `fecha.lt."${pageParam.fecha}",and(fecha.eq."${pageParam.fecha}",clave.lt."${pageParam.clave}")`,
        );
      }
      const { data, error } = await consulta;
      if (error) throw error;
      const movimientos = data.map(aMovimiento);
      return cuenta === "efectivo" ? conSaldoResultante(movimientos) : movimientos;
    },
    getNextPageParam: (ultima) =>
      siguienteCursorDe(ultima, ({ fecha, clave }): CursorLibro => ({ fecha, clave })),
  });
}

/** El libro de efectivo mostraba (y sigue mostrando) el saldo después de cada movimiento. */
async function conSaldoResultante(movimientos: MovimientoFondos[]): Promise<MovimientoFondos[]> {
  const ids = movimientos.flatMap((m) => (m.movimiento_id === null ? [] : [m.movimiento_id]));
  if (ids.length === 0) return movimientos;
  const { data, error } = await supabase
    .from("v_movimientos_efectivo")
    .select("id, saldo_resultante")
    .in("id", ids);
  if (error) throw error;
  const saldos = new Map(data.map((fila) => [fila.id, fila.saldo_resultante]));
  return movimientos.map((m) => ({
    ...m,
    saldo_resultante: m.movimiento_id === null ? null : (saldos.get(m.movimiento_id) ?? null),
  }));
}

/** Totales de las ventas mixtas del rango (sin anuladas). Informativos: no se suman a las cuentas. */
export function useResumenVentasMixtas(rango: RangoFechas | null) {
  return useQuery({
    queryKey: clavesFondos.resumenMixtas(rango ?? { desde: "", hasta: "" }),
    enabled: rango !== null,
    queryFn: async (): Promise<ResumenVentasMixtas | null> => {
      const { data, error } = await supabase.rpc("resumen_ventas_mixtas", {
        p_desde: rango?.desde ?? "",
        p_hasta: rango?.hasta ?? "",
      });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

const COLUMNAS_MIXTA =
  "id, creado_en, caja_nombre, servicio_nombre, patente, usuario_nombre, precio, pago_efectivo, pago_transferencia, anulada, anulada_motivo";

export type VentaMixta = Pick<
  Vistas["v_ventas_mixtas"]["Row"],
  | "id"
  | "creado_en"
  | "caja_nombre"
  | "servicio_nombre"
  | "patente"
  | "usuario_nombre"
  | "precio"
  | "pago_efectivo"
  | "pago_transferencia"
  | "anulada"
  | "anulada_motivo"
>;

/** Ventas con pago mixto del rango (anuladas incluidas, se tachan), con "Ver más" por `id`. */
export function useVentasMixtas(rango: RangoFechas | null) {
  return useInfiniteQuery({
    queryKey: clavesFondos.mixtas(rango ?? { desde: "", hasta: "" }),
    enabled: rango !== null,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<VentaMixta[]> => {
      let consulta = supabase
        .from("v_ventas_mixtas")
        .select(COLUMNAS_MIXTA)
        .gte("fecha_local", rango?.desde ?? "")
        .lte("fecha_local", rango?.hasta ?? "")
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

/**
 * Movimiento manual de transferencia (`movimiento_fondos`). Un retiro que deja la
 * cuenta en negativo lo rechaza la BD (P0001, con el saldo disponible).
 */
export function useMovimientoFondos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cuenta,
      tipo,
      monto,
      nota,
    }: {
      cuenta: Cuenta;
      tipo: TipoMovimientoManual;
      monto: number;
      nota: string;
    }) => {
      const { data, error } = await supabase.rpc("movimiento_fondos", {
        p_cuenta: cuenta,
        p_tipo: tipo,
        p_monto: monto,
        p_nota: nota,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: claveFondos }),
        queryClient.invalidateQueries({ queryKey: claveEfectivo }),
      ]),
  });
}
