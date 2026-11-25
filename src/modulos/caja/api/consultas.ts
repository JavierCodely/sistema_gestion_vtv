import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clavesDescuentos } from "@/compartido/lib/claves-descuentos";
import { clavesImpuestos } from "@/compartido/lib/claves-impuestos";
import { supabase } from "@/compartido/lib/supabase";
import type { Enums, Tablas } from "@/compartido/tipos";
import { claveFondos } from "@/modulos/fondos/api/claves";
import { claveEfectivo } from "@/modulos/fondos/api/efectivo";
import { claveCategorias, claveServicios } from "@/modulos/servicios/api/consultas";
import type { Database } from "@/types/database";
import type { DatosAperturaTurno } from "../lib/validaciones";

export type MedioPago = Enums["medio_pago"];

/**
 * Turno abierto de una caja, para elegir dónde trabajar (`v_turnos_abiertos`, sin dinero). El turno es
 * de la caja: cualquier usuario activo trabaja en cualquier caja abierta (migración 33).
 */
export type CajaAbierta = {
  [K in keyof Database["public"]["Views"]["v_turnos_abiertos"]["Row"]]: NonNullable<
    Database["public"]["Views"]["v_turnos_abiertos"]["Row"][K]
  >;
};

/** Mensaje si la vista devolviera una fila incompleta (los tipos de una vista salen anulables). */
const ERROR_CAJA_ABIERTA = "No se pudieron leer las cajas abiertas. Recargá la página.";

/**
 * Turno abierto tal como lo lista el admin para elegir cuál cerrar (de `v_turnos`, sin totales).
 * `atendido_por`: quienes vendieron o gastaron en él (vacío si todavía nadie).
 */
export type TurnoAbiertoResumen = Pick<
  Database["public"]["Views"]["v_turnos"]["Row"],
  "id" | "caja_nombre" | "abierto_en" | "atendido_por"
>;

/** Caja activa para abrir turno (`cajas_para_turno`, solo admin): libre u ocupada, sin persona. */
export type CajaParaTurno = Database["public"]["Functions"]["cajas_para_turno"]["Returns"][number];

/** Parte del cobro de una venta (`venta_pagos`): una por medio; dos o tres en un pago mixto. */
export type PagoDeVenta = Pick<Tablas["venta_pagos"]["Row"], "medio" | "monto">;

/**
 * Venta tal como la ve quien la puede leer (RLS: las de los turnos abiertos o, el admin, todas). Sin
 * costos. `usuario_id` = quién la hizo (el nombre se pide con `useNombreUsuario`).
 * `precio` es lo cobrado; con descuento, `precio_lista` y `monto_descuento` son la foto de la venta.
 * `medio_pago` NULL = pago mixto (el detalle está en `venta_pagos`).
 */
export type Venta = Pick<
  Tablas["ventas"]["Row"],
  | "id"
  | "creado_en"
  | "turno_id"
  | "usuario_id"
  | "servicio_nombre"
  | "precio"
  | "precio_lista"
  | "monto_descuento"
  | "descuento_nombre"
  | "medio_pago"
  | "patente"
  | "sin_stock"
  | "anulada"
  | "anulada_motivo"
  | "anulada_en"
  | "anulada_por"
  | "vuelta_de"
  | "condicional_vence"
  | "condicional_saldo"
  | "vuelta_fuera_de_plazo"
  | "condicional_vencida_de"
> & {
  venta_pagos: PagoDeVenta[];
  /** Certificado entregado (null: sin hoja, sin stock o venta con fecha pasada). */
  certificados: { nombre: string; condicional: boolean } | null;
};

/**
 * Certificado que se usará al vender un servicio (`null`: no lleva o no hay configurado). El
 * condicional trae además los días para volver (migración 42).
 */
export type CertificadoDeVenta = Pick<
  Tablas["certificados"]["Row"],
  "id" | "nombre" | "stock_hojas" | "dias_vuelta"
> | null;

export const claves = {
  cajasParaTurno: ["caja", "cajas-para-turno"] as const,
  /**
   * Bajo el prefijo `["turnos"]` (el de la lista del admin): los invalidan las mismas mutaciones
   * (abrir, cerrar, vender, gastar, anular).
   */
  cajasAbiertas: ["turnos", "cajas-abiertas"] as const,
  turnosAbiertos: ["turnos", "abiertos"] as const,
  /**
   * Efectivo del cajón de un turno abierto (migración 47; bajo `["caja"]`: vender, gastar y anular lo
   * invalidan).
   */
  efectivoEnCaja: (turnoId: number) => ["caja", "efectivo", turnoId] as const,
  /** Historial de la caja: las ventas de un turno, de todos los que vendieron. */
  ventasDeTurno: (turnoId: number) => ["caja", "ventas", turnoId] as const,
  certificadoDeServicio: (servicioId: number, condicional: boolean) =>
    ["caja", "certificado", servicioId, condicional ? "condicional" : "de-siempre"] as const,
  /** Condicionales vigentes de una patente (bajo `["caja"]`: vender y anular las invalidan). */
  condicionales: (patente: string) => ["caja", "condicionales", patente] as const,
  /** Ventas anteriores de una patente (aviso de patente repetida; vender y anular las invalidan). */
  ventasAnteriores: (patente: string) => ["caja", "ventas-anteriores", patente] as const,
  nombreUsuario: (usuarioId: string) => ["nombre-usuario", usuarioId] as const,
};

/** Columnas de `ventas` que se leen (nunca `*`: los costos no son legibles por columna). */
export const COLUMNAS_VENTA =
  "id, creado_en, turno_id, usuario_id, servicio_nombre, precio, precio_lista, monto_descuento, descuento_nombre, medio_pago, patente, sin_stock, anulada, anulada_motivo, anulada_en, anulada_por, vuelta_de, condicional_vence, condicional_saldo, vuelta_fuera_de_plazo, condicional_vencida_de, venta_pagos(medio, monto), certificados(nombre, condicional)";

/**
 * Condicional sin usar de una patente (`condicionales_de_patente`, sin costos): vigentes primero.
 * Si `vigente` y el vehículo aprobó, la venta de `servicio_id` cobra `saldo` ($ 0 si pagó el total; el
 * 50% restante si pagó la mitad) y descuenta la hoja de siempre (migraciones 40 a 42). Vencida, lo pagado
 * queda en la patente y se cobra entero (o se hace otra condicional del mismo servicio).
 * `condicional_nombre` = el certificado condicional que se entregó.
 */
export type CondicionalDePatente =
  Database["public"]["Functions"]["condicionales_de_patente"]["Returns"][number];

/**
 * Opciones para leer las condicionales de una patente al pasar el paso de la patente. Siempre se
 * consultan de nuevo (`staleTime: 0`): la vuelta la decide la BD al vender.
 */
export function consultaCondicionales(patente: string) {
  return {
    queryKey: claves.condicionales(patente),
    staleTime: 0,
    queryFn: async (): Promise<CondicionalDePatente[]> => {
      const { data, error } = await supabase.rpc("condicionales_de_patente", {
        p_patente: patente,
      });
      if (error) throw error;
      return data;
    },
  };
}

/**
 * Venta de hoy (sin anular) de una patente (`ventas_anteriores_de_patente`, migraciones 45 y 49): solo
 * la fecha, el servicio y el certificado entregado (`null` en una venta con fecha pasada). Sin montos
 * ni quién vendió. La caja la muestra para avisar que la patente ya se vendió hoy.
 */
export type VentaAnteriorDePatente = Omit<
  Database["public"]["Functions"]["ventas_anteriores_de_patente"]["Returns"][number],
  "certificado_nombre"
> & {
  /** El esquema generado lo tipa como `string`, pero es NULL si la venta no entregó certificado. */
  certificado_nombre: string | null;
};

/** Ventas anteriores de una patente, leídas de nuevo cada vez que se pasa el paso de la patente. */
export function consultaVentasAnteriores(patente: string) {
  return {
    queryKey: claves.ventasAnteriores(patente),
    staleTime: 0,
    queryFn: async (): Promise<VentaAnteriorDePatente[]> => {
      const { data, error } = await supabase.rpc("ventas_anteriores_de_patente", {
        p_patente: patente,
      });
      if (error) throw error;
      return data;
    },
  };
}

export const MEDIOS_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

/** Orden en que se ofrecen y se muestran los medios de pago. */
export const ORDEN_MEDIOS: readonly MedioPago[] = ["efectivo", "transferencia", "tarjeta"];

export const MENSAJES_ERROR_VENTA = {
  restricciones: { ventas_patente_largo: "La patente no puede superar los 10 caracteres." },
};

/** Cada cuánto se reconsultan las cajas abiertas en `/caja` (se abre una, se cierra la elegida). */
export const INTERVALO_CAJAS_ABIERTAS_MS = 15_000;

/** Cuánto se considera vigente el nombre de un usuario (cambia muy poco). */
const VIGENCIA_NOMBRE_MS = 5 * 60_000;

/**
 * Cajas con turno abierto, por nombre (las leen todos los usuarios activos). `reconsultar`: cada 15 s,
 * para que la pantalla de la caja se entere sola si el admin abre una o cierra la elegida.
 */
export function useCajasAbiertas({ reconsultar = false }: { reconsultar?: boolean } = {}) {
  return useQuery({
    queryKey: claves.cajasAbiertas,
    refetchInterval: reconsultar ? INTERVALO_CAJAS_ABIERTAS_MS : false,
    queryFn: async (): Promise<CajaAbierta[]> => {
      const { data, error } = await supabase
        .from("v_turnos_abiertos")
        .select("id, caja_id, caja_nombre, abierto_en")
        .order("caja_nombre", { ascending: true });
      if (error) throw error;
      // El esquema generado marca anulables todas las columnas de una vista; ninguna lo es.
      return data.map(({ id, caja_id, caja_nombre, abierto_en }) => {
        if (id === null || caja_id === null || caja_nombre === null || abierto_en === null) {
          throw new Error(ERROR_CAJA_ABIERTA);
        }
        return { id, caja_id, caja_nombre, abierto_en };
      });
    },
  });
}

/** Turnos abiertos de todas las cajas, del más viejo al más nuevo, con quiénes atendieron (admin). */
export function useTurnosAbiertos() {
  return useQuery({
    queryKey: claves.turnosAbiertos,
    queryFn: async (): Promise<TurnoAbiertoResumen[]> => {
      const { data, error } = await supabase
        .from("v_turnos")
        .select("id, caja_nombre, abierto_en, atendido_por")
        .eq("abierto", true)
        .order("abierto_en", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Solo admin (lo controla la RPC): cajas activas, libres u ocupadas, para abrir un turno. */
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

/**
 * Nombre completo de quien hizo una venta (`nombre_usuario`: el cajero no lee perfiles ajenos; la BD
 * le devuelve el de quien vendió o gastó en un turno abierto). `null` si no corresponde mostrarlo.
 */
export function useNombreUsuario(usuarioId: string) {
  return useQuery({
    queryKey: claves.nombreUsuario(usuarioId),
    staleTime: VIGENCIA_NOMBRE_MS,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("nombre_usuario", { p_usuario_id: usuarioId });
      if (error) throw error;
      // El esquema generado la tipa como `string`, pero devuelve NULL si no corresponde mostrarlo.
      return typeof data === "string" ? data : null;
    },
  });
}

/** Ventas de un turno, de todos los que vendieron. `turnoId` inválido (≤ 0): no se consulta. */
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
 * Efectivo del cajón de la caja donde se trabaja (`efectivo_en_caja_de_turno`: inicial + parte en
 * efectivo de las ventas − gastos en efectivo, sin anulados). Es lo único de dinero del turno que ve el
 * cajero. Se reconsulta cada 15 s: otros usuarios venden en la misma caja.
 */
export function useEfectivoEnCaja(turnoId: number) {
  return useQuery({
    queryKey: claves.efectivoEnCaja(turnoId),
    enabled: turnoId > 0,
    staleTime: 0,
    refetchInterval: INTERVALO_CAJAS_ABIERTAS_MS,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("efectivo_en_caja_de_turno", {
        p_turno_id: turnoId,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * `certificado_para_servicio` / `certificado_condicional_para_servicio` devuelven null cuando no hay
 * certificado, pero el esquema generado las tipa como `number`: se valida el valor real.
 */
function idOpcional(valor: unknown): number | null {
  return typeof valor === "number" ? valor : null;
}

/**
 * Certificado del servicio: el de siempre o (`condicional`) el de condicional, que la caja ofrece
 * como alternativa solo si existe.
 */
export function useCertificadoDeServicio(servicioId: number | null, condicional = false) {
  return useQuery({
    queryKey: claves.certificadoDeServicio(servicioId ?? 0, condicional),
    enabled: servicioId !== null,
    queryFn: async (): Promise<CertificadoDeVenta> => {
      const { data: id, error } = await supabase.rpc(
        condicional ? "certificado_condicional_para_servicio" : "certificado_para_servicio",
        { p_servicio_id: servicioId ?? 0 },
      );
      if (error) throw error;
      const certificadoId = idOpcional(id);
      if (certificadoId === null) return null;
      const { data, error: errorCert } = await supabase
        .from("certificados")
        .select("id, nombre, stock_hojas, dias_vuelta")
        .eq("id", certificadoId)
        .single();
      if (errorCert) throw errorCert;
      return data;
    },
  });
}

/**
 * Todo lo que cambia con un turno o una venta. `["caja"]` cubre cajas para turno, el historial de
 * cada caja (ventas del turno) y el certificado de cada servicio; `["turnos"]` cubre `v_turnos`
 * (lista, detalle y turnos abiertos) y las cajas abiertas de `/caja`; `["certificados"]`, el stock;
 * `claveEfectivo`, la caja de cambio (de ahí sale el efectivo inicial y ahí vuelve al cerrar);
 * `claveFondos`, saldos y libros de Fondos (ventas por transferencia/tarjeta, mixtas, anulaciones,
 * apertura y cierre);
 * `clavesDescuentos.resumenes`, las estadísticas de descuentos (una venta con descuento o su
 * anulación las cambia); `clavesImpuestos.resumenes`, el reporte de impuestos (ídem).
 */
function useInvalidarCaja() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["caja"] }),
      queryClient.invalidateQueries({ queryKey: ["turnos"] }),
      queryClient.invalidateQueries({ queryKey: ["certificados"] }),
      queryClient.invalidateQueries({ queryKey: claveEfectivo }),
      queryClient.invalidateQueries({ queryKey: claveFondos }),
      queryClient.invalidateQueries({ queryKey: clavesDescuentos.resumenes }),
      queryClient.invalidateQueries({ queryKey: clavesImpuestos.resumenes }),
    ]);
}

/**
 * Lo de `useInvalidarCaja` más lo que el cajero usa para armar una venta: servicios, categorías y
 * los descuentos de todos los servicios (`descuentos_para_servicio`). Así, si el admin cambió un
 * precio, un descuento o desactivó algo, la próxima venta se arma con el catálogo actual.
 */
function useInvalidarVenta() {
  const queryClient = useQueryClient();
  const invalidarCaja = useInvalidarCaja();
  return () =>
    Promise.all([
      invalidarCaja(),
      queryClient.invalidateQueries({ queryKey: claveServicios }),
      queryClient.invalidateQueries({ queryKey: claveCategorias }),
      queryClient.invalidateQueries({ queryKey: clavesDescuentos.paraServicios }),
    ]);
}

/**
 * Solo admin (lo controla la RPC). El turno es de la caja (no se elige quién atiende): el efectivo
 * inicial sale de la caja de cambio.
 */
export function useAbrirTurno() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: async ({ cajaId, efectivoInicial }: DatosAperturaTurno) => {
      const { data, error } = await supabase.rpc("abrir_turno", {
        p_caja_id: cajaId,
        p_efectivo_inicial: efectivoInicial,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // Si otro admin la abrió entre que se listó y se eligió, la lista tiene que reflejarlo.
    onError: invalidar,
  });
}

/** Solo admin (lo controla la RPC): cierra el turno de una caja; el efectivo vuelve a la caja de cambio. */
export function useCerrarTurno() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: async ({ observaciones, turnoId }: { observaciones: string; turnoId: number }) => {
      const { data, error } = await supabase.rpc("cerrar_turno", {
        p_turno_id: turnoId,
        ...(observaciones && { p_observaciones: observaciones }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // Si otro admin ya lo cerró, la lista de turnos abiertos se actualiza.
    onError: invalidar,
  });
}

/** Un solo medio, o pago mixto (2 o 3 medios distintos que suman el precio final; lo valida la BD). */
export type CobroVenta = { medio: MedioPago } | { pagos: PagoDeVenta[] };

export interface DatosVenta {
  servicioId: number;
  cobro: CobroVenta;
  patente: string | null;
  /** Descuento elegido (activo y habilitado para el servicio: lo controla la BD). */
  descuentoId: number | null;
  /**
   * Precio final que vio el cajero (el del descuento elegido o el del servicio). Si la BD calcula
   * otro, rechaza la venta (`esPrecioCambiado`) en vez de cobrar un importe que el cajero no vio.
   */
  precioEsperado: number;
  /** Con el certificado condicional del servicio (migración 42). */
  condicional: boolean;
  /** Condicional pagada al 50% (sin descuento): el resto se cobra al volver dentro del plazo. */
  condicionalMitad: boolean;
  /**
   * Vuelta fuera de plazo (migración 46): id de la condicional vencida que se honra. Cobra su saldo
   * ($ 0 si se pagó entera) con el certificado de siempre, como una vuelta dentro del plazo.
   */
  vueltaVencida: number | null;
}

/** Mensajes de `_turno_para_trabajar` cuando el turno elegido ya no sirve para trabajar. */
const MENSAJES_TURNO_NO_DISPONIBLE = [
  "ya se cerró: elegí una caja abierta",
  "El turno elegido no existe",
] as const;

/**
 * `registrar_venta` / `registrar_gasto` rechazaron porque el turno de la caja elegida ya se cerró (o
 * no existe): hay que volver a elegir la caja.
 */
export function esTurnoNoDisponible(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { message } = error as { message?: unknown };
  return (
    typeof message === "string" && MENSAJES_TURNO_NO_DISPONIBLE.some((m) => message.includes(m))
  );
}

/** Mensaje con el que `registrar_venta` rechaza una venta cuyo precio final no es el esperado. */
const PREFIJO_PRECIO_CAMBIADO = "El precio cambió";

/** `registrar_venta` rechazó la venta porque el precio final ya no es el que vio el cajero. */
export function esPrecioCambiado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "P0001" && typeof message === "string" && message.startsWith(PREFIJO_PRECIO_CAMBIADO)
  );
}

/**
 * `registrar_venta` rechaza cobrar una vuelta de condicional, o hacer otra condicional cuando la patente
 * ya tiene una vigente del servicio (la caja no la vio: se usó o se vendió otra mientras tanto), o la
 * vuelta fuera de plazo de una condicional que ya no sirve (usada, anulada). Se vuelve a la patente
 * para revisarla.
 */
export function esVueltaDeCondicional(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === "P0001" &&
    typeof message === "string" &&
    (message.includes("vuelve de la condicional") ||
      message.includes("registrá la vuelta") ||
      message.includes("La condicional elegida") ||
      message.includes("ya se usó en otra venta"))
  );
}

/** `turnoId`: el turno de la caja elegida en `/caja` (la BD controla que siga abierto). */
export function useRegistrarVenta() {
  const invalidar = useInvalidarVenta();
  return useMutation({
    mutationFn: async ({
      turnoId,
      servicioId,
      cobro,
      patente,
      descuentoId,
      precioEsperado,
      condicional,
      condicionalMitad,
      vueltaVencida,
    }: DatosVenta & { turnoId: number }) => {
      const { data, error } = await supabase.rpc("registrar_venta", {
        p_turno_id: turnoId,
        p_servicio_id: servicioId,
        ...("medio" in cobro
          ? { p_medio_pago: cobro.medio }
          : { p_pagos: cobro.pagos.map(({ medio, monto }) => ({ medio, monto })) }),
        ...(patente && { p_patente: patente }),
        ...(descuentoId !== null && { p_descuento_id: descuentoId }),
        p_precio_esperado: precioEsperado,
        ...(condicional && { p_condicional: true }),
        ...(condicionalMitad && { p_condicional_mitad: true }),
        ...(vueltaVencida !== null && { p_vuelta_vencida: vueltaVencida }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
    // El rechazo puede venir de un cambio ajeno (caja cerrada por el admin, servicio, categoría o
    // descuento desactivados, precio cambiado): se vuelven a leer las cajas abiertas, las ventas, el
    // catálogo y los descuentos para mostrar el estado real. onError se espera antes de que
    // `mutateAsync` rechace: la pantalla ya tiene los datos nuevos cuando muestra el error.
    onError: invalidar,
  });
}

/**
 * El admin, cualquier venta; el cajero, solo las suyas de un turno abierto (lo controla la RPC,
 * migración 47). Si fue en efectivo, sale del turno abierto o de la caja de cambio.
 */
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
