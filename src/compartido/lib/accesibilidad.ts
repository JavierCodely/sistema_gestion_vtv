/** Props de accesibilidad para un control con posible error (ver componente Campo). */
export function propsError(id: string, error: string | undefined) {
  return error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};
}
