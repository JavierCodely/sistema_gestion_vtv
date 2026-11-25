import { normalizarPatente } from "@/compartido/lib/validaciones";

/** Caracteres desde los que el historial de la caja filtra por patente. */
export const MINIMO_BUSQUEDA_PATENTE = 3;

/**
 * Patente a buscar en el historial de la caja (normalizada como la guarda la BD), o null si todavía
 * no llega a `MINIMO_BUSQUEDA_PATENTE` caracteres: se muestran todas las ventas del turno.
 */
export function patenteABuscar(texto: string): string | null {
  const patente = normalizarPatente(texto);
  return patente.length >= MINIMO_BUSQUEDA_PATENTE ? patente : null;
}

/** Ventas del turno cuya patente empieza con lo buscado (null: todas). */
export function filtrarPorPatente<T extends { patente: string | null }>(
  ventas: readonly T[],
  patente: string | null,
): T[] {
  if (patente === null) return [...ventas];
  return ventas.filter((venta) => venta.patente?.startsWith(patente) ?? false);
}
