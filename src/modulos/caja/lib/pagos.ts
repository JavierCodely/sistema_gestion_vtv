import { formatearMoneda } from "@/compartido/lib/formato";
import { MEDIOS_PAGO, ORDEN_MEDIOS, type PagoDeVenta, type Venta } from "../api/consultas";

/** Partes de un cobro en el orden de los medios (efectivo, transferencia, tarjeta). */
export function ordenarPagos(pagos: readonly PagoDeVenta[]): PagoDeVenta[] {
  return [...pagos].sort((a, b) => ORDEN_MEDIOS.indexOf(a.medio) - ORDEN_MEDIOS.indexOf(b.medio));
}

/** "Efectivo $ 5.000,00 + Tarjeta $ 13.000,00": detalle de un pago mixto. */
export function detallePagos(pagos: readonly PagoDeVenta[]): string {
  return ordenarPagos(pagos)
    .map((p) => `${MEDIOS_PAGO[p.medio]} ${formatearMoneda(p.monto)}`)
    .join(" + ");
}

/**
 * Cómo se muestra el medio de una venta: el medio si fue uno solo; "Mixto" con el detalle por medio
 * si `medio_pago` es NULL (los montos son los de `venta_pagos`, guardados por la BD).
 */
export function describirMedio(venta: Pick<Venta, "medio_pago" | "venta_pagos">): {
  etiqueta: string;
  detalle: string | null;
} {
  if (venta.medio_pago !== null) return { etiqueta: MEDIOS_PAGO[venta.medio_pago], detalle: null };
  return { etiqueta: "Mixto", detalle: detallePagos(venta.venta_pagos) };
}

/** Parte en efectivo de una venta (0 si no tuvo), tal como la guardó la BD. */
export function parteEnEfectivo(venta: Pick<Venta, "venta_pagos">): number {
  return venta.venta_pagos.find((p) => p.medio === "efectivo")?.monto ?? 0;
}
