/**
 * Claves de TanStack Query de los descuentos. Viven en `compartido/` porque las invalidan tres
 * módulos: `descuentos` (su catálogo), `caja` (una venta o su rechazo) y `servicios` (un cambio de
 * precio o de categoría cambia los descuentos que se ofrecen); así `servicios` no depende de
 * `descuentos`, que ya usa el catálogo de `servicios` (sin ciclos entre módulos).
 *
 * Todo bajo `["descuentos"]`: lo invalidan juntas las mutaciones del catálogo.
 */
export const clavesDescuentos = {
  todo: ["descuentos"] as const,
  lista: ["descuentos", "lista"] as const,
  /** Prefijo de todos los `descuentos_para_servicio` (los invalida una venta, ok o rechazada). */
  paraServicios: ["descuentos", "para-servicio"] as const,
  paraServicio: (servicioId: number) => ["descuentos", "para-servicio", servicioId] as const,
  /** Prefijo de las estadísticas (las invalidan también las ventas y anulaciones). */
  resumenes: ["descuentos", "resumen"] as const,
  resumen: (desde: string, hasta: string) => ["descuentos", "resumen", desde, hasta] as const,
};
