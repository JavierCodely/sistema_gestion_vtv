import { formatearLista, formatearMoneda } from "@/compartido/lib/formato";
import { MEDIOS, NOMBRES_MEDIOS, type Impuesto } from "../api/consultas";

const porcentaje = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "3 %" o "3,5 %" en un porcentaje; "$ 150,00 por venta" en un monto fijo. */
export function formatearValorImpuesto({ tipo, valor }: Pick<Impuesto, "tipo" | "valor">) {
  return tipo === "porcentaje"
    ? `${porcentaje.format(valor)} %`
    : `${formatearMoneda(valor)} por venta`;
}

/** "Todos" si alcanza a los tres medios; si no, "Efectivo y Tarjeta". */
export function formatearMedios(medios: Impuesto["medios"]) {
  if (MEDIOS.every((m) => medios.includes(m))) return "Todos";
  return formatearLista(MEDIOS.filter((m) => medios.includes(m)).map((m) => NOMBRES_MEDIOS[m]));
}

/** "Todos" o "3 servicios" / "1 servicio" / "Ninguno". */
export function formatearServicios({
  todos_servicios,
  servicioIds,
}: Pick<Impuesto, "todos_servicios" | "servicioIds">) {
  if (todos_servicios) return "Todos";
  if (servicioIds.length === 0) return "Ninguno";
  return servicioIds.length === 1 ? "1 servicio" : `${String(servicioIds.length)} servicios`;
}
