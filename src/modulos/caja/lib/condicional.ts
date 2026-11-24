/*
 * Condicional al 50% (migración 41): vista previa de la caja. Lo que se cobra lo decide
 * `registrar_venta` (misma cuenta: la mitad redondeada a centavos ahora, el resto al volver).
 */

/** La mitad que se paga ahora (redondeada a centavos, como `round(precio / 2, 2)` en la BD). */
export function mitadCondicional(precio: number): number {
  return Math.round(Math.round(precio * 100) / 2) / 100;
}

/** Lo que queda para la vuelta: el precio menos la mitad cobrada. */
export function saldoCondicional(precio: number): number {
  return Math.round(precio * 100 - mitadCondicional(precio) * 100) / 100;
}
