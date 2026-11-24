/** Patente para buscar: mayúsculas, solo letras y números (como la carga la caja). */
export function normalizarPatente(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
