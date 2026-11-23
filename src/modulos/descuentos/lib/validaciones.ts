import { parsearMonto, validarNombre, type Errores } from "@/compartido/lib/validaciones";
import type { Tablas } from "@/compartido/tipos";

/** Lo que se escribe en el formulario (el valor como texto, igual que en el input). */
export interface FormularioDescuento {
  nombre: string;
  tipo: Tablas["descuentos"]["Row"]["tipo"];
  valor: string;
  activo: boolean;
}

/** Lo que se guarda en la tabla `descuentos` (columnas con grant de escritura). */
export type DatosDescuento = Required<
  Pick<Tablas["descuentos"]["Insert"], "nombre" | "tipo" | "valor" | "activo">
>;

export type ErroresDescuento = Errores<"nombre" | "valor">;

/** Mismo tope que el CHECK descuentos_valor_valido: un porcentaje es menor a 100. */
export const PORCENTAJE_MAXIMO_EXCLUIDO = 100;

/**
 * Mismas reglas que los CHECK de `descuentos`: nombre de hasta 100 caracteres; porcentaje mayor a 0
 * y menor a 100, con hasta 2 decimales; monto fijo con las reglas de `_validar_monto`.
 */
export function validarDescuento(
  formulario: FormularioDescuento,
):
  | { errores: ErroresDescuento; datos?: undefined }
  | { errores?: undefined; datos: DatosDescuento } {
  const errores: ErroresDescuento = {};
  const nombre = validarNombre(formulario.nombre);
  if (nombre) errores.nombre = nombre;

  const esPorcentaje = formulario.tipo === "porcentaje";
  const valor = parsearMonto(formulario.valor, { nombre: esPorcentaje ? "porcentaje" : "monto" });
  if (valor.error !== undefined) errores.valor = valor.error;
  else if (esPorcentaje && valor.valor >= PORCENTAJE_MAXIMO_EXCLUIDO) {
    errores.valor = "El porcentaje tiene que ser menor a 100.";
  }

  if (valor.valor === undefined || Object.keys(errores).length > 0) return { errores };
  return {
    datos: {
      nombre: formulario.nombre.trim(),
      tipo: formulario.tipo,
      valor: valor.valor,
      activo: formulario.activo,
    },
  };
}
