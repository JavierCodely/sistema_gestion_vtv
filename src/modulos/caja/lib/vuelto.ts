/**
 * Vuelto que el cajero tiene que dar en una venta en efectivo. Es solo una ayuda de pantalla: no se
 * guarda ni mueve dinero (lo que entra al cajón es el precio de la venta, que registra la BD).
 * Se calcula en centavos enteros para no arrastrar errores de punto flotante.
 */
export function calcularVuelto(precio: number, recibido: number): number {
  return (Math.round(recibido * 100) - Math.round(precio * 100)) / 100;
}

/** Monto recibido: el campo acepta solo dígitos (pesos enteros). "" = no escribió nada. */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** Patente mientras se escribe: mayúsculas, solo letras y números. */
export function limpiarPatente(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
