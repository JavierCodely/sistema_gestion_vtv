import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siguienteCursor, TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums, Tablas } from "@/compartido/tipos";
import { claveFondos } from "@/modulos/fondos/api/claves";
import { claveEfectivo } from "@/modulos/fondos/api/efectivo";
import type { Database } from "@/types/database";
import type { DatosAjuste, DatosCertificado, DatosCompra } from "../lib/validaciones";

type FilaValorizada =
  Database["public"]["Functions"]["stock_certificados_valorizado"]["Returns"][number];

/**
 * Stock con costos (solo admin). Dónde se usa: `todos_servicios` o las categorías enteras
 * (`categoria_ids`) y los servicios sueltos (`servicio_ids`); `aplica_a` es el texto para mostrar.
 */
export type CertificadoConStock = Omit<FilaValorizada, "semaforo"> & {
  semaforo: "ok" | "bajo" | "sin_stock";
};

type FilaCompra = Database["public"]["Views"]["v_compras_certificado"]["Row"];

/** Compra tal como la devuelve `v_compras_certificado` (`editable` lo decide la BD). */
export type Compra = Omit<FilaCompra, "editable" | "hojas_por_unidad"> & {
  editable: boolean;
  hojas_por_unidad: number;
};

export type Movimiento = Pick<
  Tablas["movimientos_certificado"]["Row"],
  | "id"
  | "creado_en"
  | "tipo"
  | "hojas"
  | "costo_unitario"
  | "costo_total"
  | "stock_resultante"
  | "costo_promedio_resultante"
  | "nota"
  | "venta_id"
  | "compra_id"
> & { perfiles: { nombre_completo: string } | null };

export type FuenteFondos = Enums["fuente_fondos"];

export const claves = {
  stock: ["certificados", "stock"] as const,
  compras: ["certificados", "compras"] as const,
  movimientos: (id: number) => ["certificados", "movimientos", id] as const,
};

/** Columnas que se leen de `certificados` (nunca `*`: los costos no son legibles por columna). */
const COLUMNAS_CERTIFICADO =
  "id, nombre, unidad_compra, hojas_por_unidad, todos_servicios, stock_minimo, stock_hojas, activo";

export const MENSAJES_ERROR_CERTIFICADO = {
  repetido: "Ya existe un certificado con ese nombre.",
  restricciones: {
    // La BD avisa antes con nombres (P0001); estos quedan para dos cambios simultáneos.
    certificados_un_global_activo:
      "Ya hay un certificado activo para todos los servicios. Desactivalo antes de activar otro.",
    certificados_uno_por_categoria:
      "Una de las categorías ya tiene otro certificado activo. Desactivalo antes de activar este.",
    certificados_uno_por_servicio:
      "Uno de los servicios ya tiene otro certificado activo. Desactivalo antes de activar este.",
  },
};

function convertirFila(fila: FilaValorizada): CertificadoConStock {
  const semaforo = fila.semaforo === "bajo" || fila.semaforo === "sin_stock" ? fila.semaforo : "ok";
  return { ...fila, semaforo };
}

export function useStockCertificados() {
  return useQuery({
    queryKey: claves.stock,
    queryFn: async (): Promise<CertificadoConStock[]> => {
      const { data, error } = await supabase.rpc("stock_certificados_valorizado");
      if (error) throw error;
      return data.map(convertirFila);
    },
  });
}

const COLUMNAS_COMPRA =
  "id, creado_en, certificado_id, certificado, unidad_compra, hojas_por_unidad, unidades, costo_unidad, hojas, costo_total, fuente, proveedor, usuario, anulada, anulada_motivo, anulada_en, anulada_por, reemplazada_por, editable";

function convertirCompra(fila: FilaCompra): Compra {
  // La vista siempre los calcula; el esquema generado los marca opcionales por ser expresiones.
  if (fila.hojas_por_unidad === null) {
    throw new Error(`La compra ${String(fila.id)} llegó incompleta`);
  }
  return { ...fila, hojas_por_unidad: fila.hojas_por_unidad, editable: fila.editable === true };
}

async function paginaCompras(antesDe: number | null): Promise<Compra[]> {
  let consulta = supabase
    .from("v_compras_certificado")
    .select(COLUMNAS_COMPRA)
    .order("id", { ascending: false })
    .limit(TAMANO_PAGINA);
  if (antesDe !== null) consulta = consulta.lt("id", antesDe);
  const { data, error } = await consulta;
  if (error) throw error;
  return data.map(convertirCompra);
}

export function useCompras() {
  return useInfiniteQuery({
    queryKey: claves.compras,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => paginaCompras(pageParam),
    getNextPageParam: siguienteCursor,
  });
}

/** `id` inválido (≤ 0): la consulta no se ejecuta. */
export function useCertificado(id: number) {
  return useQuery({
    queryKey: [...claves.stock, id],
    enabled: id > 0,
    queryFn: async (): Promise<CertificadoConStock | null> => {
      const { data, error } = await supabase
        .rpc("stock_certificados_valorizado")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? convertirFila(data) : null;
    },
  });
}

async function paginaMovimientos(id: number, antesDe: number | null): Promise<Movimiento[]> {
  let consulta = supabase
    .from("movimientos_certificado")
    .select(
      "id, creado_en, tipo, hojas, costo_unitario, costo_total, stock_resultante, costo_promedio_resultante, nota, venta_id, compra_id, perfiles(nombre_completo)",
    )
    .eq("certificado_id", id)
    .order("id", { ascending: false })
    .limit(TAMANO_PAGINA);
  if (antesDe !== null) consulta = consulta.lt("id", antesDe);
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

/** `id` inválido (≤ 0): la consulta no se ejecuta. */
export function useMovimientos(id: number) {
  return useInfiniteQuery({
    queryKey: claves.movimientos(id),
    enabled: id > 0,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => paginaMovimientos(id, pageParam),
    getNextPageParam: siguienteCursor,
  });
}

/**
 * Compras y ajustes cambian stock, kardex, compras y (si fue en efectivo) el saldo; activar o
 * cambiar los destinos cambia qué hoja usa cada servicio en la caja (`["caja", "certificado"]`).
 */
function useInvalidarCertificados() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["certificados"] }),
      queryClient.invalidateQueries({ queryKey: ["caja", "certificado"] }),
      queryClient.invalidateQueries({ queryKey: claveEfectivo }),
      queryClient.invalidateQueries({ queryKey: claveFondos }),
    ]);
}

export function useCrearCertificado() {
  const invalidar = useInvalidarCertificados();
  return useMutation({
    mutationFn: async (datos: DatosCertificado) => {
      const { data, error } = await supabase
        .from("certificados")
        .insert(datos)
        .select(COLUMNAS_CERTIFICADO)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useActualizarCertificado() {
  const invalidar = useInvalidarCertificados();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: number;
      cambios: Partial<DatosCertificado> & Pick<Tablas["certificados"]["Update"], "activo">;
    }) => {
      const { data, error } = await supabase
        .from("certificados")
        .update(cambios)
        .eq("id", id)
        .select(COLUMNAS_CERTIFICADO)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

/** Fija de una vez dónde se usa el certificado (`fijar_destinos_certificado`, atómica). */
export function useFijarDestinosCertificado() {
  const invalidar = useInvalidarCertificados();
  return useMutation({
    mutationFn: async ({
      id,
      todos,
      categoriaIds,
      servicioIds,
    }: {
      id: number;
      todos: boolean;
      categoriaIds: number[];
      servicioIds: number[];
    }) => {
      const { error } = await supabase.rpc("fijar_destinos_certificado", {
        p_certificado_id: id,
        p_todos: todos,
        p_categoria_ids: categoriaIds,
        p_servicio_ids: servicioIds,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useRegistrarCompra() {
  const invalidar = useInvalidarCertificados();
  return useMutation({
    mutationFn: async ({ certificadoId, datos }: { certificadoId: number; datos: DatosCompra }) => {
      const { data, error } = await supabase.rpc("registrar_compra_certificado", {
        p_certificado_id: certificadoId,
        p_unidades: datos.unidades,
        p_costo_unidad: datos.costoUnidad,
        p_fuente: datos.fuente,
        ...(datos.proveedor && { p_proveedor: datos.proveedor }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

/** Corrige una compra: la BD anula la original (revierte todo) y registra la corregida. */
export function useCorregirCompra() {
  const invalidar = useInvalidarCertificados();
  return useMutation({
    mutationFn: async ({
      compraId,
      datos,
      motivo,
    }: {
      compraId: number;
      datos: DatosCompra;
      motivo: string;
    }) => {
      const { data, error } = await supabase.rpc("corregir_compra_certificado", {
        p_compra_id: compraId,
        p_unidades: datos.unidades,
        p_costo_unidad: datos.costoUnidad,
        p_fuente: datos.fuente,
        p_proveedor: datos.proveedor ?? "",
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useAjustarStock() {
  const invalidar = useInvalidarCertificados();
  return useMutation({
    mutationFn: async ({ certificadoId, datos }: { certificadoId: number; datos: DatosAjuste }) => {
      const { data, error } = await supabase.rpc("ajustar_stock_certificado", {
        p_certificado_id: certificadoId,
        p_hojas: datos.hojas,
        p_nota: datos.nota,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}
