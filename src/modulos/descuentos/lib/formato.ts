import { formatearMoneda } from "@/compartido/lib/formato";
import type { Descuento } from "../api/consultas";

const porcentaje = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "10 %" o "12,5 %" en un porcentaje; "$ 2.000,00" en un monto fijo. */
export function formatearValorDescuento({ tipo, valor }: Pick<Descuento, "tipo" | "valor">) {
  return tipo === "porcentaje" ? `${porcentaje.format(valor)} %` : formatearMoneda(valor);
}
