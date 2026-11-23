import type { Venta } from "../api/consultas";
import { describirMedio } from "../lib/pagos";

/** Medio de pago de una venta en una lista: el medio, o "Mixto" con el detalle por medio debajo. */
export function MedioDeVenta({ venta }: { venta: Pick<Venta, "medio_pago" | "venta_pagos"> }) {
  const { etiqueta, detalle } = describirMedio(venta);
  return (
    <>
      <div>{etiqueta}</div>
      {detalle && <div className="text-xs whitespace-nowrap text-muted-foreground">{detalle}</div>}
    </>
  );
}
