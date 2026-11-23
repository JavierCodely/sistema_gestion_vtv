import { parsearMonto, validarNota, type Errores } from "@/compartido/lib/validaciones";

export interface FormularioMovimiento {
  monto: string;
  nota: string;
}

export type ErroresMovimiento = Errores<keyof FormularioMovimiento>;

/** Mismas reglas que `movimiento_efectivo`: monto positivo (como `_validar_monto`) y nota obligatoria. */
export function validarMovimiento(formulario: FormularioMovimiento): {
  datos?: { monto: number; nota: string };
  errores?: ErroresMovimiento;
} {
  const errores: ErroresMovimiento = {};
  const monto = parsearMonto(formulario.monto);
  if (monto.error !== undefined) errores.monto = monto.error;
  const nota = validarNota(formulario.nota);
  if (nota) errores.nota = nota;
  if (monto.valor === undefined || Object.keys(errores).length > 0) return { errores };
  return { datos: { monto: monto.valor, nota: formulario.nota.trim() } };
}
