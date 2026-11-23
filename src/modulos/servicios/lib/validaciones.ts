import { parsearMonto, validarNombre, type Errores } from "@/compartido/lib/validaciones";
import type { Tablas } from "@/compartido/tipos";

/** Lo que se escribe en el formulario (todo texto, como en los inputs). */
export interface FormularioServicio {
  nombre: string;
  categoriaId: string;
  precio: string;
  requiereCertificado: boolean;
}

/** Lo que se guarda en la tabla `servicios` (derivado del esquema generado). */
export type DatosServicio = Required<
  Pick<Tablas["servicios"]["Insert"], "nombre" | "categoria_id" | "precio" | "requiere_certificado">
>;

export type ErroresServicio = Errores<"nombre" | "categoriaId" | "precio">;

export function validarServicio(
  formulario: FormularioServicio,
): { errores: ErroresServicio; datos?: undefined } | { errores?: undefined; datos: DatosServicio } {
  const errores: ErroresServicio = {};
  const nombre = validarNombre(formulario.nombre);
  if (nombre) errores.nombre = nombre;

  const categoriaId = Number(formulario.categoriaId);
  if (!formulario.categoriaId || !Number.isInteger(categoriaId) || categoriaId <= 0) {
    errores.categoriaId = "Elegí una categoría.";
  }

  // Precio 0 permitido: hay servicios sin cargo (ej. reverificación).
  const precio = parsearMonto(formulario.precio, { permitirCero: true, nombre: "precio" });
  if (precio.error !== undefined) errores.precio = precio.error;

  if (precio.valor === undefined || Object.keys(errores).length > 0) return { errores };
  return {
    datos: {
      nombre: formulario.nombre.trim(),
      categoria_id: categoriaId,
      precio: precio.valor,
      requiere_certificado: formulario.requiereCertificado,
    },
  };
}
