import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invocarFuncion } from "@/compartido/lib/funciones";
import { siguienteCursor, TAMANO_PAGINA } from "@/compartido/lib/paginacion";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums } from "@/compartido/tipos";
import type { Database } from "@/types/database";

type FilaVista = Database["public"]["Views"]["v_comprobantes"]["Row"];

export type EstadoComprobante = Enums["estado_comprobante"];
export type Ambiente = Enums["ambiente_arca"];

/** Comprobante tal como lo arma `v_comprobantes` (la BD calcula importes y QR). */
export interface Comprobante {
  id: number;
  venta_id: number;
  turno_id: number;
  tipo: Enums["tipo_comprobante"];
  clase: "A" | "B";
  cbte_tipo: number;
  ambiente: Ambiente;
  cuit_emisor: string;
  punto_venta: number;
  numero: number | null;
  estado: EstadoComprobante;
  fecha: string | null;
  fecha_servicio: string;
  doc_tipo: number;
  doc_nro: number;
  receptor_nombre: string | null;
  condicion_iva_receptor: string;
  neto: number;
  iva: number;
  total: number;
  cae: string | null;
  cae_vencimiento: string | null;
  mensaje: string | null;
  intentos: number;
  a_reconciliar: boolean;
  creado_en: string;
  servicio_nombre: string;
  patente: string | null;
  asociado_cbte_tipo: number | null;
  asociado_punto_venta: number | null;
  asociado_numero: number | null;
  asociado_fecha: string | null;
  qr_url: string | null;
  /** Datos del emisor guardados al enviar el comprobante (no cambian con la configuración). */
  emisor_razon_social: string | null;
  emisor_domicilio: string | null;
  emisor_iibb: string | null;
  emisor_inicio_actividades: string | null;
}

const COLUMNAS_COMPROBANTE =
  "id, venta_id, turno_id, tipo, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta, numero, estado, fecha, fecha_servicio, doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor, neto, iva, total, cae, cae_vencimiento, mensaje, intentos, a_reconciliar, creado_en, servicio_nombre, patente, asociado_cbte_tipo, asociado_punto_venta, asociado_numero, asociado_fecha, qr_url, emisor_razon_social, emisor_domicilio, emisor_iibb, emisor_inicio_actividades";

/** Las columnas de una vista salen anulables en los tipos generados: se validan al leer. */
const ERROR_LECTURA = "No se pudo leer el comprobante. Recargá la página.";

function requerido<T>(valor: T | null, campo: string): T {
  if (valor === null) throw new Error(ERROR_LECTURA, { cause: `Falta ${campo}` });
  return valor;
}

export function convertirComprobante(f: Pick<FilaVista, keyof Comprobante>): Comprobante {
  const clase = requerido(f.clase, "la clase");
  if (clase !== "A" && clase !== "B") {
    throw new Error(ERROR_LECTURA, { cause: `Clase inválida: ${clase}` });
  }
  return {
    id: requerido(f.id, "el id"),
    venta_id: requerido(f.venta_id, "la venta"),
    turno_id: requerido(f.turno_id, "el turno"),
    tipo: requerido(f.tipo, "el tipo"),
    clase,
    cbte_tipo: requerido(f.cbte_tipo, "el tipo de comprobante"),
    ambiente: requerido(f.ambiente, "el ambiente"),
    cuit_emisor: requerido(f.cuit_emisor, "el CUIT"),
    punto_venta: requerido(f.punto_venta, "el punto de venta"),
    numero: f.numero,
    estado: requerido(f.estado, "el estado"),
    fecha: f.fecha,
    fecha_servicio: requerido(f.fecha_servicio, "la fecha del servicio"),
    doc_tipo: requerido(f.doc_tipo, "el tipo de documento"),
    doc_nro: requerido(f.doc_nro, "el documento"),
    receptor_nombre: f.receptor_nombre,
    condicion_iva_receptor: requerido(f.condicion_iva_receptor, "la condición de IVA"),
    neto: requerido(f.neto, "el neto"),
    iva: requerido(f.iva, "el IVA"),
    total: requerido(f.total, "el total"),
    cae: f.cae,
    cae_vencimiento: f.cae_vencimiento,
    mensaje: f.mensaje,
    intentos: requerido(f.intentos, "los intentos"),
    a_reconciliar: requerido(f.a_reconciliar, "el estado de reconciliación"),
    creado_en: requerido(f.creado_en, "la fecha"),
    servicio_nombre: requerido(f.servicio_nombre, "el servicio"),
    patente: f.patente,
    asociado_cbte_tipo: f.asociado_cbte_tipo,
    asociado_punto_venta: f.asociado_punto_venta,
    asociado_numero: f.asociado_numero,
    asociado_fecha: f.asociado_fecha,
    qr_url: f.qr_url,
    emisor_razon_social: f.emisor_razon_social,
    emisor_domicilio: f.emisor_domicilio,
    emisor_iibb: f.emisor_iibb,
    emisor_inicio_actividades: f.emisor_inicio_actividades,
  };
}

export type ConfiguracionArca = Pick<
  Database["public"]["Tables"]["arca_configuracion"]["Row"],
  | "cuit"
  | "razon_social"
  | "domicilio"
  | "inicio_actividades"
  | "iibb"
  | "punto_venta"
  | "ambiente"
  | "tope_identificacion"
  | "certificado_cuit"
  | "certificado_sujeto"
  | "certificado_vence"
  | "certificado_cargado_en"
  | "condiciones_actualizadas_en"
>;

const COLUMNAS_CONFIGURACION =
  "cuit, razon_social, domicilio, inicio_actividades, iibb, punto_venta, ambiente, tope_identificacion, certificado_cuit, certificado_sujeto, certificado_vence, certificado_cargado_en, condiciones_actualizadas_en";

export type CondicionIva = Pick<
  Database["public"]["Tables"]["arca_condiciones_iva"]["Row"],
  "id" | "descripcion" | "clases"
>;

export type Intento = Pick<
  Database["public"]["Tables"]["arca_intentos"]["Row"],
  | "id"
  | "comprobante_id"
  | "operacion"
  | "ambiente"
  | "exito"
  | "mensaje"
  | "solicitud"
  | "respuesta"
  | "duracion_ms"
  | "creado_en"
> & { perfiles: { nombre_completo: string } | null };

export const claves = {
  todo: ["facturacion"] as const,
  configuracion: ["facturacion", "configuracion"] as const,
  condiciones: ["facturacion", "condiciones"] as const,
  deTurno: (turnoId: number) => ["facturacion", "turno", turnoId] as const,
  comprobante: (id: number) => ["facturacion", "comprobante", id] as const,
  sinAutorizar: ["facturacion", "sin-autorizar"] as const,
  intentos: ["facturacion", "intentos"] as const,
};

export function useConfiguracionArca() {
  return useQuery({
    queryKey: claves.configuracion,
    queryFn: async (): Promise<ConfiguracionArca> => {
      const { data, error } = await supabase
        .from("arca_configuracion")
        .select(COLUMNAS_CONFIGURACION)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCondicionesIva() {
  return useQuery({
    queryKey: claves.condiciones,
    queryFn: async (): Promise<CondicionIva[]> => {
      const { data, error } = await supabase
        .from("arca_condiciones_iva")
        .select("id, descripcion, clases")
        .order("id");
      if (error) throw error;
      return data;
    },
  });
}

/** Comprobantes de las ventas de un turno. `turnoId` ≤ 0: no consulta. */
export function useComprobantesDeTurno(turnoId: number) {
  return useQuery({
    queryKey: claves.deTurno(turnoId),
    enabled: turnoId > 0,
    queryFn: async (): Promise<Comprobante[]> => {
      const { data, error } = await supabase
        .from("v_comprobantes")
        .select(COLUMNAS_COMPROBANTE)
        .eq("turno_id", turnoId)
        .order("id");
      if (error) throw error;
      return data.map(convertirComprobante);
    },
  });
}

/** `id` ≤ 0: no consulta. Devuelve null si no existe o no se puede ver. */
export function useComprobante(id: number) {
  return useQuery({
    queryKey: claves.comprobante(id),
    enabled: id > 0,
    queryFn: async (): Promise<Comprobante | null> => {
      const { data, error } = await supabase
        .from("v_comprobantes")
        .select(COLUMNAS_COMPROBANTE)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? convertirComprobante(data) : null;
    },
  });
}

/** Comprobantes que todavía no tienen CAE (pendientes, rechazados, en emisión). Solo admin. */
export function useComprobantesSinAutorizar() {
  return useInfiniteQuery({
    queryKey: claves.sinAutorizar,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<Comprobante[]> => {
      let consulta = supabase
        .from("v_comprobantes")
        .select(COLUMNAS_COMPROBANTE)
        .in("estado", ["pendiente", "rechazado", "procesando"])
        .order("id", { ascending: false })
        .limit(TAMANO_PAGINA);
      if (pageParam !== null) consulta = consulta.lt("id", pageParam);
      const { data, error } = await consulta;
      if (error) throw error;
      return data.map(convertirComprobante);
    },
    getNextPageParam: siguienteCursor,
  });
}

export function useIntentos() {
  return useInfiniteQuery({
    queryKey: claves.intentos,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<Intento[]> => {
      let consulta = supabase
        .from("arca_intentos")
        .select(
          "id, comprobante_id, operacion, ambiente, exito, mensaje, solicitud, respuesta, duracion_ms, creado_en, perfiles(nombre_completo)",
        )
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

/** Facturar o emitir cambia comprobantes, el log y (con una NC) nada de dinero: solo ["facturacion"]. */
function useInvalidarFacturacion() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: claves.todo });
}

/** Pide a ARCA (Edge Function) el CAE de un comprobante ya preparado en la BD. */
async function emitir(comprobanteId: number): Promise<Comprobante> {
  const { comprobante } = await invocarFuncion<{
    comprobante: Parameters<typeof convertirComprobante>[0];
  }>("arca", { accion: "emitir", comprobante_id: comprobanteId });
  return convertirComprobante(comprobante);
}

export interface DatosCliente {
  condicionIvaId: number;
  docTipo: 80 | 96 | 99;
  docNro: number;
  nombre: string | null;
}

/**
 * Factura una venta: la BD prepara el comprobante (clase, importes, permisos) y la Edge Function
 * lo emite. Devuelve el comprobante con el resultado (autorizado, rechazado o pendiente).
 */
export function useFacturar() {
  const invalidar = useInvalidarFacturacion();
  return useMutation({
    mutationFn: async ({ ventaId, cliente }: { ventaId: number; cliente: DatosCliente }) => {
      const { data, error } = await supabase.rpc("preparar_factura", {
        p_venta_id: ventaId,
        p_condicion_iva_id: cliente.condicionIvaId,
        p_doc_tipo: cliente.docTipo,
        p_doc_nro: cliente.docNro,
        ...(cliente.nombre && { p_receptor_nombre: cliente.nombre }),
      });
      if (error) throw error;
      return emitir(data.id);
    },
    onSettled: invalidar,
  });
}

/** Reintenta la emisión (o la reconciliación) de un comprobante sin CAE. */
export function useEmitir() {
  const invalidar = useInvalidarFacturacion();
  return useMutation({ mutationFn: emitir, onSettled: invalidar });
}

/**
 * Tras anular una venta facturada, la BD deja la nota de crédito pendiente: se emite enseguida.
 * Devuelve null si la venta no tenía factura autorizada (no hay NC que emitir).
 */
export function useEmitirNotaDeCredito() {
  const invalidar = useInvalidarFacturacion();
  return useMutation({
    mutationFn: async (ventaId: number): Promise<Comprobante | null> => {
      const { data, error } = await supabase
        .from("comprobantes")
        .select("id, estado")
        .eq("venta_id", ventaId)
        .eq("tipo", "nota_credito")
        .maybeSingle();
      if (error) throw error;
      if (!data || data.estado === "autorizado") return null;
      return emitir(data.id);
    },
    onSettled: invalidar,
  });
}

export type CambiosConfiguracion = Pick<
  Database["public"]["Tables"]["arca_configuracion"]["Update"],
  | "cuit"
  | "razon_social"
  | "domicilio"
  | "inicio_actividades"
  | "iibb"
  | "punto_venta"
  | "ambiente"
  | "tope_identificacion"
>;

export function useGuardarConfiguracion() {
  const invalidar = useInvalidarFacturacion();
  return useMutation({
    mutationFn: async (cambios: CambiosConfiguracion) => {
      // Fila única: el WHERE es obligatorio (pg-safeupdate).
      const { error } = await supabase.from("arca_configuracion").update(cambios).eq("id", true);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useGuardarCertificado() {
  const invalidar = useInvalidarFacturacion();
  return useMutation({
    mutationFn: ({ certificado, clave }: { certificado: string; clave: string }) =>
      invocarFuncion<{ configuracion: unknown }>("arca", {
        accion: "guardar_certificado",
        certificado,
        clave,
      }),
    onSuccess: invalidar,
  });
}

export interface ResultadoPrueba {
  ok: boolean;
  mensaje: string;
}

export function useProbarConexion() {
  const invalidar = useInvalidarFacturacion();
  return useMutation({
    mutationFn: async () =>
      (await invocarFuncion<{ prueba: ResultadoPrueba }>("arca", { accion: "probar_conexion" }))
        .prueba,
    onSettled: invalidar,
  });
}
