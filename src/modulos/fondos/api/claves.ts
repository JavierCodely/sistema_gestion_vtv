import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import type { Enums } from "@/compartido/tipos";

/**
 * Claves de TanStack Query de Fondos. Todo cuelga de `claveFondos`: la invalidan toda venta y su
 * anulación, todo gasto y su anulación, las compras y sus correcciones, abrir y cerrar turnos y los
 * movimientos manuales (de cualquier cuenta). La caja de cambio además tiene `claveEfectivo`.
 */
export const claveFondos = ["fondos"] as const;

export const clavesFondos = {
  resumen: ({ desde, hasta }: RangoFechas) => [...claveFondos, "resumen", desde, hasta] as const,
  libro: (cuenta: Enums["cuenta_fondos"], { desde, hasta }: RangoFechas) =>
    [...claveFondos, "libro", cuenta, desde, hasta] as const,
  resumenMixtas: ({ desde, hasta }: RangoFechas) =>
    [...claveFondos, "mixtas", "resumen", desde, hasta] as const,
  mixtas: ({ desde, hasta }: RangoFechas) =>
    [...claveFondos, "mixtas", "lista", desde, hasta] as const,
};
