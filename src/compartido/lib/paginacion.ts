/** Filas por página en los listados con "Ver más". */
export const TAMANO_PAGINA = 50;

/**
 * Paginación por cursor sobre `id` (las consultas ordenan por `id` descendente, que crece con la
 * fecha de alta): la página siguiente pide `id < último id`. A diferencia de `range`, una fila
 * nueva entre "Ver más" y "Ver más" no corre las páginas, así nada se repite ni se saltea.
 */
export function siguienteCursor(ultima: readonly { id: number }[]): number | undefined {
  return siguienteCursorDe(ultima, (fila) => fila.id);
}

/**
 * Lo mismo con otro cursor, para los listados que no se ordenan por `id` (ej. el libro de Fondos,
 * por `(fecha, clave)`): `cursor` arma el de la última fila. Sin página llena, no hay más.
 */
export function siguienteCursorDe<T, C>(
  ultima: readonly T[],
  cursor: (fila: T) => C,
): C | undefined {
  const fila = ultima.length === TAMANO_PAGINA ? ultima[ultima.length - 1] : undefined;
  return fila === undefined ? undefined : cursor(fila);
}
