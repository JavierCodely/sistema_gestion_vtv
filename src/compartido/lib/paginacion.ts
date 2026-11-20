/** Filas por página en los listados con "Ver más". */
export const TAMANO_PAGINA = 50;

/**
 * Paginación por cursor sobre `id` (las consultas ordenan por `id` descendente, que crece con la
 * fecha de alta): la página siguiente pide `id < último id`. A diferencia de `range`, una fila
 * nueva entre "Ver más" y "Ver más" no corre las páginas, así nada se repite ni se saltea.
 */
export function siguienteCursor(ultima: readonly { id: number }[]): number | undefined {
  return ultima.length === TAMANO_PAGINA ? ultima[ultima.length - 1]?.id : undefined;
}
