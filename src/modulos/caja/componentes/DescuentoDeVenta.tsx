import { formatearMoneda } from "@/compartido/lib/formato";
import type { Venta } from "../api/consultas";

/**
 * Descuento de una venta en una lista, con la foto que guardó la BD al venderla: nombre, monto
 * descontado y precio de lista. "—" si se vendió sin descuento.
 */
export function DescuentoDeVenta({
  venta,
}: {
  venta: Pick<Venta, "descuento_nombre" | "monto_descuento" | "precio_lista">;
}) {
  if (venta.descuento_nombre === null) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <div>{venta.descuento_nombre}</div>
      <div className="text-xs whitespace-nowrap text-muted-foreground">
        −{formatearMoneda(venta.monto_descuento)} · lista {formatearMoneda(venta.precio_lista)}
      </div>
    </>
  );
}
