import { parsearMonto, validarNombre, type Errores } from "@/compartido/lib/validaciones";
import type { Enums, Tablas } from "@/compartido/tipos";

type MedioPago = Enums["medio_pago"];

/** Orden en que se muestran y se guardan los medios. */
const ORDEN: readonly MedioPago[] = ["efectivo", "transferencia", "tarjeta"];

/** Lo que se escribe en el formulario (el valor como texto, igual que en el input). */
export interface FormularioImpuesto {
  nombre: string;
  tipo: Tablas["impuestos"]["Row"]["tipo"];
  valor: string;
  medios: MedioPago[];
  activo: boolean;
}

/** Lo que se guarda en la tabla `impuestos` (columnas con grant de escritura). */
export type DatosImpuesto = Required<
  Pick<Tablas["impuestos"]["Insert"], "nombre" | "tipo" | "valor" | "medios" | "activo">
>;

export type ErroresImpuesto = Errores<"nombre" | "valor" | "medios">;

/**
 * Mismas reglas que los CHECK de `impuestos`: nombre de hasta 100 caracteres; porcentaje mayor a 0 y
 * menor a 100, con hasta 2 decimales; monto fijo con las reglas de `_validar_monto`; al menos un medio
 * de pago (se guardan sin repetidos y en orden).
 */
export function validarImpuesto(
  formulario: FormularioImpuesto,
): { errores: ErroresImpuesto; datos?: undefined } | { errores?: undefined; datos: DatosImpuesto } {
  const errores: ErroresImpuesto = {};
  const nombre = validarNombre(formulario.nombre);
  if (nombre) errores.nombre = nombre;

  const esPorcentaje = formulario.tipo === "porcentaje";
  const valor = parsearMonto(formulario.valor, { nombre: esPorcentaje ? "porcentaje" : "monto" });
  if (valor.error !== undefined) errores.valor = valor.error;
  else if (esPorcentaje && valor.valor >= 100) {
    errores.valor = "El porcentaje tiene que ser menor a 100.";
  }

  const medios = ORDEN.filter((m) => formulario.medios.includes(m));
  if (medios.length === 0) errores.medios = "Elegí al menos un medio de pago.";

  if (valor.valor === undefined || Object.keys(errores).length > 0) return { errores };
  return {
    datos: {
      nombre: formulario.nombre.trim(),
      tipo: formulario.tipo,
      valor: valor.valor,
      medios,
      activo: formulario.activo,
    },
  };
}
