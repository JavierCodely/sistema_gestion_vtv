/**
 * Claves de TanStack Query de los impuestos. Viven en `compartido/` porque las invalidan tres
 * módulos: `impuestos` (su catálogo), `caja` (una venta o su anulación suman o restan en el reporte)
 * y `ventas` (una venta con fecha pasada); así ninguno depende de `impuestos`.
 *
 * Todo bajo `["impuestos"]`: lo invalidan juntas las mutaciones del catálogo.
 */
export const clavesImpuestos = {
  todo: ["impuestos"] as const,
  lista: ["impuestos", "lista"] as const,
  /** Prefijo del reporte (lo invalidan también las ventas y anulaciones). */
  resumenes: ["impuestos", "resumen"] as const,
  resumen: (desde: string, hasta: string, turnoId: number | null) =>
    ["impuestos", "resumen", desde, hasta, turnoId] as const,
};
