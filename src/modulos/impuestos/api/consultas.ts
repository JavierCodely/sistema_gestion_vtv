import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clavesImpuestos } from "@/compartido/lib/claves-impuestos";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums, Tablas } from "@/compartido/tipos";
import type { Database } from "@/types/database";
import type { DatosImpuesto } from "../lib/validaciones";

type Funciones = Database["public"]["Functions"];

export type TipoImpuesto = Enums["tipo_impuesto"];
export type MedioPago = Enums["medio_pago"];

/** Impuesto del catálogo con los servicios alcanzados (si no es `todos_servicios`). */
export type Impuesto = Pick<
  Tablas["impuestos"]["Row"],
  "id" | "nombre" | "tipo" | "valor" | "medios" | "todos_servicios" | "activo"
> & {
  servicioIds: number[];
};

/** Fila de `resumen_impuestos()`: `agrupacion` = total (siempre una) · impuesto. */
export type FilaResumenImpuestos = Funciones["resumen_impuestos"]["Returns"][number];

export interface ResumenImpuestos {
  total: FilaResumenImpuestos | null;
  porImpuesto: FilaResumenImpuestos[];
}

/** Filtro del reporte: período (días de negocio) y, opcional, un turno. */
export interface FiltroImpuestos {
  rango: RangoFechas;
  turnoId: number | null;
}

/** Turno para el filtro del reporte (caja y apertura). */
export type TurnoDelPeriodo = Pick<
  Database["public"]["Views"]["v_turnos"]["Row"],
  "id" | "caja_nombre" | "abierto_en"
>;

export const TIPOS_IMPUESTO: Record<TipoImpuesto, string> = {
  porcentaje: "Porcentaje",
  monto_fijo: "Monto fijo por venta",
};

export const MEDIOS: readonly MedioPago[] = ["efectivo", "transferencia", "tarjeta"];

export const NOMBRES_MEDIOS: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

export const MENSAJES_ERROR_IMPUESTO = {
  repetido: "Ya existe un impuesto con ese nombre.",
  enUso: "El impuesto ya se aplicó en ventas: desactivalo en lugar de borrarlo.",
  restricciones: {
    impuestos_valor_valido:
      "El valor no es válido: un porcentaje va de más de 0 a menos de 100, y un monto fijo es mayor a cero.",
    impuestos_nombre_valido: "El nombre no es válido (hasta 100 caracteres).",
    impuestos_medios_validos: "Elegí al menos un medio de pago.",
  },
};

const COLUMNAS_IMPUESTO =
  "id, nombre, tipo, valor, medios, todos_servicios, activo, impuesto_servicios(servicio_id)";

type FilaImpuesto = Omit<Impuesto, "servicioIds"> & {
  impuesto_servicios: { servicio_id: number }[];
};

function aImpuesto({ impuesto_servicios, ...resto }: FilaImpuesto): Impuesto {
  return { ...resto, servicioIds: impuesto_servicios.map((s) => s.servicio_id) };
}

/** Catálogo completo (solo admin, RLS). */
export function useImpuestos() {
  return useQuery({
    queryKey: clavesImpuestos.lista,
    queryFn: async (): Promise<Impuesto[]> => {
      const { data, error } = await supabase
        .from("impuestos")
        .select(COLUMNAS_IMPUESTO)
        .order("activo", { ascending: false })
        .order("nombre");
      if (error) throw error;
      return data.map(aImpuesto);
    },
  });
}

/** Reporte: lo calcula la BD (`resumen_impuestos`), sin ventas anuladas. `filtro` null: no consulta. */
export function useResumenImpuestos(filtro: FiltroImpuestos | null) {
  return useQuery({
    queryKey: clavesImpuestos.resumen(
      filtro?.rango.desde ?? "",
      filtro?.rango.hasta ?? "",
      filtro?.turnoId ?? null,
    ),
    enabled: filtro !== null,
    queryFn: async (): Promise<ResumenImpuestos> => {
      if (!filtro) return { total: null, porImpuesto: [] };
      // Con un turno elegido se filtra solo por el turno: sus ventas pueden pasar de un día a otro.
      const { data, error } = await supabase.rpc(
        "resumen_impuestos",
        filtro.turnoId === null
          ? { p_desde: filtro.rango.desde, p_hasta: filtro.rango.hasta }
          : { p_turno_id: filtro.turnoId },
      );
      if (error) throw error;
      return {
        total: data.find((f) => f.agrupacion === "total") ?? null,
        porImpuesto: data.filter((f) => f.agrupacion === "impuesto"),
      };
    },
  });
}

/** Turnos abiertos (fecha de apertura) en el período, del más nuevo al más viejo. Solo admin. */
export function useTurnosDelPeriodo(rango: RangoFechas) {
  return useQuery({
    queryKey: clavesImpuestos.turnosDelPeriodo(rango.desde, rango.hasta),
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

function useInvalidarImpuestos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: clavesImpuestos.todo });
}

export function useCrearImpuesto() {
  const invalidar = useInvalidarImpuestos();
  return useMutation({
    mutationFn: async (datos: DatosImpuesto): Promise<Impuesto> => {
      const { data, error } = await supabase
        .from("impuestos")
        .insert(datos)
        .select(COLUMNAS_IMPUESTO)
        .single();
      if (error) throw error;
      return aImpuesto(data);
    },
    onSuccess: invalidar,
  });
}

export function useActualizarImpuesto() {
  const invalidar = useInvalidarImpuestos();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: number;
      cambios: Partial<DatosImpuesto>;
    }): Promise<Impuesto> => {
      const { data, error } = await supabase
        .from("impuestos")
        .update(cambios)
        .eq("id", id)
        .select(COLUMNAS_IMPUESTO)
        .single();
      if (error) throw error;
      return aImpuesto(data);
    },
    onSuccess: invalidar,
  });
}

/** Todos los servicios (también los futuros) o la lista elegida, de una vez (atómico en la BD). */
export function useFijarServiciosImpuesto() {
  const invalidar = useInvalidarImpuestos();
  return useMutation({
    mutationFn: async ({
      id,
      todos,
      servicioIds,
    }: {
      id: number;
      todos: boolean;
      servicioIds: number[];
    }) => {
      const { data, error } = await supabase.rpc("fijar_servicios_impuesto", {
        p_impuesto_id: id,
        p_todos: todos,
        p_servicio_ids: todos ? [] : servicioIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}
