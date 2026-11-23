import { hoyEnArgentina } from "./formato";

/** Rango de días de negocio (YYYY-MM-DD, ambos incluidos, hora argentina). */
export interface RangoFechas {
  desde: string;
  hasta: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Rango por defecto de los reportes: del 1° del mes actual a hoy (hora argentina). */
export function mesActual(ahora: Date = new Date()): RangoFechas {
  const hoy = hoyEnArgentina(ahora);
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
}

/**
 * Revisa el rango que eligió el usuario antes de consultar: `rango` es null si falta una fecha o
 * están invertidas, y `error` explica por qué (null si solo están incompletas).
 */
export function revisarRango({ desde, hasta }: RangoFechas): {
  rango: RangoFechas | null;
  error: string | null;
} {
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return { rango: null, error: null };
  if (desde > hasta) {
    return { rango: null, error: "La fecha “desde” no puede ser posterior a “hasta”." };
  }
  return { rango: { desde, hasta }, error: null };
}
