import type { Cuenta } from "./fondos";

/** Pestañas de Fondos: las dos cuentas y "Mixto" (informativa). */
export type Pestana = Cuenta | "mixto";

export const PESTANAS: readonly Pestana[] = ["efectivo", "transferencia", "mixto"];

export const NOMBRE_PESTANA: Record<Pestana, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mixto: "Mixto",
};

/** Parámetro de la URL con la pestaña elegida (`/admin/fondos?pestana=transferencia`). */
export const PARAMETRO_PESTANA = "pestana";
/** Última pestaña elegida, para volver a ella al entrar sin parámetro. Solo comodidad. */
export const CLAVE_PESTANA = "vtv-fondos-pestana";

export function esPestana(valor: string | null | undefined): valor is Pestana {
  return PESTANAS.some((p) => p === valor);
}

/** La pestaña a mostrar: la de la URL; si no hay, la última elegida; si no, Efectivo. */
export function pestanaInicial(deLaUrl: string | null): Pestana {
  if (esPestana(deLaUrl)) return deLaUrl;
  const guardada = leerPestanaGuardada();
  return guardada ?? "efectivo";
}

export function leerPestanaGuardada(): Pestana | null {
  try {
    const valor = localStorage.getItem(CLAVE_PESTANA);
    return esPestana(valor) ? valor : null;
  } catch {
    // Sin localStorage (modo privado estricto, cuota): se arranca en Efectivo.
    return null;
  }
}

export function guardarPestana(pestana: Pestana): void {
  try {
    localStorage.setItem(CLAVE_PESTANA, pestana);
  } catch {
    // Recordarla es solo comodidad: si no se puede guardar, no pasa nada.
  }
}
