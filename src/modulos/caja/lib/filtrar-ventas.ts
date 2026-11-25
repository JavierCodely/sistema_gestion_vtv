import type { MedioPago } from "../api/consultas";
import { filtrarPorPatente } from "./buscar-patente";

/** Medio por el que se filtra una lista de ventas: uno de los medios o "mixto" (pago mixto). */
export type MedioFiltro = MedioPago | "mixto";

/**
 * Filtros de una lista de ventas ya leída (las del turno): `null` = sin filtrar por eso.
 * - `patente`: ya normalizada (`patenteABuscar`), las que empiezan así.
 * - `categoriaId`: la categoría del servicio vendido.
 * - `medio`: las que se cobraron, en todo o en parte, con ese medio (una venta mixta de efectivo +
 *   tarjeta aparece en Efectivo y en Tarjeta); "mixto", solo las de pago mixto.
 */
export interface FiltroVentas {
  patente: string | null;
  categoriaId: number | null;
  medio: MedioFiltro | null;
}

export const SIN_FILTROS: FiltroVentas = { patente: null, categoriaId: null, medio: null };

interface VentaFiltrable {
  patente: string | null;
  categoria_id: number;
  medio_pago: MedioPago | null;
  venta_pagos: { medio: MedioPago; monto: number }[];
}

function cobradaCon(venta: VentaFiltrable, medio: MedioFiltro): boolean {
  if (medio === "mixto") return venta.medio_pago === null;
  return venta.venta_pagos.some((p) => p.medio === medio && p.monto > 0);
}

/** Ventas que cumplen todos los filtros, en el mismo orden. */
export function filtrarVentas<T extends VentaFiltrable>(
  ventas: readonly T[],
  filtro: FiltroVentas,
): T[] {
  return filtrarPorPatente(ventas, filtro.patente).filter(
    (venta) =>
      (filtro.categoriaId === null || venta.categoria_id === filtro.categoriaId) &&
      (filtro.medio === null || cobradaCon(venta, filtro.medio)),
  );
}

/** Si hay algún filtro puesto. */
export function hayFiltros(filtro: FiltroVentas): boolean {
  return filtro.patente !== null || filtro.categoriaId !== null || filtro.medio !== null;
}

/** Categorías de las ventas de la lista (sin repetir, por nombre): las opciones del filtro. */
export function categoriasDeVentas(
  ventas: readonly { categoria_id: number; categorias_servicio: { nombre: string } | null }[],
): { id: number; nombre: string }[] {
  const porId = new Map<number, string>();
  for (const v of ventas) {
    if (!porId.has(v.categoria_id)) {
      porId.set(
        v.categoria_id,
        v.categorias_servicio?.nombre ?? `Categoría ${String(v.categoria_id)}`,
      );
    }
  }
  return [...porId]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
