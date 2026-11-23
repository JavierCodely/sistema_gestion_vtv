import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siguienteCursor, TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums, Tablas } from "@/compartido/tipos";
import type { Database } from "@/types/database";
import { claveFondos } from "@/modulos/fondos/api/claves";
import { claveEfectivo } from "@/modulos/fondos/api/efectivo";

export type FuenteFondos = Enums["fuente_fondos"];

export const FUENTES: Record<FuenteFondos, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

export type CategoriaGasto = Pick<
  Tablas["categorias_gasto"]["Row"],
  "id" | "nombre" | "padre_id" | "habilitada_caja" | "activa" | "sistema"
>;

type FilaMovimiento = Database["public"]["Views"]["v_movimientos_caja"]["Row"];

/**
 * Gasto tal como se lista (de `v_movimientos_caja` con tipo gasto): `monto` viene negativo,
 * `concepto` es la subcategoría y `detalle` el rubro; `usuario_nombre`, quién lo cargó. RLS: el cajero
 * ve los de los turnos abiertos (de todos los que trabajan en la caja), el admin todos.
 */
export type Gasto = { id: number } & Pick<
  FilaMovimiento,
  | "fecha"
  | "turno_id"
  | "caja_nombre"
  | "usuario_nombre"
  | "concepto"
  | "detalle"
  | "medio"
  | "monto"
  | "nota"
  | "anulada"
  | "motivo_anulacion"
  | "categoria_gasto_id"
>;

export interface DatosGasto {
  categoriaId: number;
  monto: number;
  fuente: FuenteFondos;
  nota: string;
}

export interface DatosCategoriaGasto {
  nombre: string;
  padre_id: number | null;
  habilitada_caja: boolean;
}

export const MENSAJES_ERROR_CATEGORIA_GASTO = {
  repetido: "Ya existe una categoría con ese nombre en ese rubro.",
  enUso: "La categoría ya tiene gastos o subcategorías: desactivala en vez de borrarla.",
};

/** Prefijo de todo lo de gastos. Las mutaciones también invalidan `["turnos"]` (totales del admin). */
export const claveGastos = ["gastos"] as const;
export const claves = {
  categorias: [...claveGastos, "categorias"] as const,
  lista: [...claveGastos, "lista"] as const,
  deTurno: (turnoId: number) => [...claveGastos, "turno", turnoId] as const,
};

const COLUMNAS_GASTO =
  "id, fecha, turno_id, caja_nombre, usuario_nombre, concepto, detalle, medio, monto, nota, anulada, motivo_anulacion, categoria_gasto_id";
const COLUMNAS_CATEGORIA = "id, nombre, padre_id, habilitada_caja, activa, sistema";

/** Todas las categorías (rubros y subcategorías). Las leen todos los usuarios activos. */
export function useCategoriasGasto() {
  return useQuery({
    queryKey: claves.categorias,
    queryFn: async (): Promise<CategoriaGasto[]> => {
      const { data, error } = await supabase
        .from("categorias_gasto")
        .select(COLUMNAS_CATEGORIA)
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });
}

async function paginaGastos(turnoId: number | null, antesDe: number | null): Promise<Gasto[]> {
  let consulta = supabase
    .from("v_movimientos_caja")
    .select(COLUMNAS_GASTO)
    .eq("tipo", "gasto")
    .order("id", { ascending: false })
    .limit(TAMANO_PAGINA);
  if (turnoId !== null) consulta = consulta.eq("turno_id", turnoId);
  if (antesDe !== null) consulta = consulta.lt("id", antesDe);
  const { data, error } = await consulta;
  if (error) throw error;
  // El esquema generado marca anulables todas las columnas de una vista; el id de un gasto nunca lo es.
  return data.map((fila) => {
    if (fila.id === null) throw new Error("Un gasto llegó sin número");
    return { ...fila, id: fila.id };
  });
}

/** Listado del admin (todos los gastos), con "Ver más". */
export function useGastos() {
  return useInfiniteQuery({
    queryKey: claves.lista,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => paginaGastos(null, pageParam),
    getNextPageParam: siguienteCursor,
  });
}

/** Gastos de un turno, de todos los que trabajan en la caja (el cajero, sin totales). */
export function useGastosDeTurno(turnoId: number) {
  return useInfiniteQuery({
    queryKey: claves.deTurno(turnoId),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => paginaGastos(turnoId, pageParam),
    getNextPageParam: siguienteCursor,
  });
}

/** Un gasto cambia los listados, los totales de turnos y (si fue en efectivo) la caja del turno o la de cambio. */
function useInvalidarGastos() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: claveGastos }),
      queryClient.invalidateQueries({ queryKey: ["turnos"] }),
      queryClient.invalidateQueries({ queryKey: claveEfectivo }),
      queryClient.invalidateQueries({ queryKey: claveFondos }),
      // Historial de la caja (prefijo de caja/api); las cajas abiertas de /caja están bajo ["turnos"]:
      // si el admin cerró la caja, la pantalla se entera.
      queryClient.invalidateQueries({ queryKey: ["caja"] }),
    ]);
}

export function useRegistrarGasto() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    /**
     * `turnoId`: el turno de la caja elegida en `/caja` (queda en ese turno y, en efectivo, se paga con
     * ese cajón; el cajero siempre lo manda). `null` (Gastos del admin): sin turno, caja de cambio.
     */
    mutationFn: async ({
      categoriaId,
      monto,
      fuente,
      nota,
      turnoId,
    }: DatosGasto & { turnoId: number | null }) => {
      const { data, error } = await supabase.rpc("registrar_gasto", {
        p_categoria_id: categoriaId,
        p_monto: monto,
        p_fuente: fuente,
        p_nota: nota,
        ...(turnoId !== null && { p_turno_id: turnoId }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    onError: invalidar,
  });
}

export function useAnularGasto() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) => {
      const { data, error } = await supabase.rpc("anular_gasto", {
        p_gasto_id: id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // Ej. otro admin lo anuló recién o el efectivo no alcanza: la lista muestra el estado real.
    onError: invalidar,
  });
}

export function useCrearCategoriaGasto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosCategoriaGasto): Promise<CategoriaGasto> => {
      const { data, error } = await supabase
        .from("categorias_gasto")
        .insert(datos)
        .select(COLUMNAS_CATEGORIA)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.categorias }),
  });
}

export type CambiosCategoriaGasto = Partial<
  Pick<CategoriaGasto, "nombre" | "habilitada_caja" | "activa">
>;

export function useActualizarCategoriaGasto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: number;
      cambios: CambiosCategoriaGasto;
    }): Promise<CategoriaGasto> => {
      const { data, error } = await supabase
        .from("categorias_gasto")
        .update(cambios)
        .eq("id", id)
        .select(COLUMNAS_CATEGORIA)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: claves.categorias }),
  });
}
