import { LARGO_MAXIMO_NOTA } from "@/compartido/lib/validaciones";

/** Motivo de anulación: obligatorio, mismo límite que la BD. */
export function validarMotivo(motivo: string): string | undefined {
  const limpio = motivo.trim();
  if (!limpio) return "Escribí el motivo.";
  if (limpio.length > LARGO_MAXIMO_NOTA) {
    return `El motivo no puede superar los ${String(LARGO_MAXIMO_NOTA)} caracteres.`;
  }
  return undefined;
}
