import { parsearMonto, validarNota, type Errores } from "@/compartido/lib/validaciones";
import type { DatosGasto, FuenteFondos } from "../api/consultas";

export interface FormularioGasto {
  categoriaId: string;
  monto: string;
  fuente: FuenteFondos | "";
  nota: string;
}

export type ErroresGasto = Errores<keyof FormularioGasto>;

/** Mismas reglas que `registrar_gasto` (monto como `_validar_monto`, nota obligatoria). */
export function validarGasto(formulario: FormularioGasto): {
  datos?: DatosGasto;
  errores?: ErroresGasto;
} {
  const errores: ErroresGasto = {};
  const categoriaId = Number(formulario.categoriaId);
  if (!formulario.categoriaId || !Number.isInteger(categoriaId) || categoriaId <= 0) {
    errores.categoriaId = "Elegí una categoría.";
  }
  const monto = parsearMonto(formulario.monto);
  if (monto.error !== undefined) errores.monto = monto.error;
  if (!formulario.fuente) errores.fuente = "Elegí de dónde sale el dinero.";
  const nota = validarNota(formulario.nota);
  if (nota) errores.nota = nota;

  if (Object.keys(errores).length > 0 || monto.valor === undefined || !formulario.fuente) {
    return { errores };
  }
  return {
    datos: {
      categoriaId,
      monto: monto.valor,
      fuente: formulario.fuente,
      nota: formulario.nota.trim(),
    },
  };
}
