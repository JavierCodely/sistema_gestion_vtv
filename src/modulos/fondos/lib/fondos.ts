import type { Enums } from "@/compartido/tipos";

export type Cuenta = Enums["cuenta_fondos"];
export type TipoMovimientoManual = Enums["tipo_mov_fondos"];

/** Orden de las cuentas en pantalla (la tarjeta se quitó en la migración 54). */
export const CUENTAS: readonly Cuenta[] = ["efectivo", "transferencia"];

export const NOMBRE_CUENTA: Record<Cuenta, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

/** Para frases: "No alcanza el saldo de transferencias", "Ingreso registrado en …". */
export const NOMBRE_CUENTA_FRASE: Record<Cuenta, string> = {
  efectivo: "la caja de cambio",
  transferencia: "transferencias",
};

/** Botones de movimiento manual: en efectivo, "Fondo inicial" (como siempre); en las otras, "Saldo inicial". */
export function nombreMovimiento(cuenta: Cuenta, tipo: TipoMovimientoManual): string {
  if (tipo === "fondo_inicial") return cuenta === "efectivo" ? "Fondo inicial" : "Saldo inicial";
  return tipo === "ingreso" ? "Ingreso" : "Retiro";
}

export function descripcionMovimiento(cuenta: Cuenta, tipo: TipoMovimientoManual): string {
  const donde = NOMBRE_CUENTA_FRASE[cuenta];
  if (tipo === "fondo_inicial") return `Dinero con el que arranca ${donde}.`;
  if (tipo === "ingreso") return `Dinero que se agrega a ${donde}.`;
  return `Dinero que se saca de ${donde} (no puede quedar en negativo).`;
}

/** `origen` de `v_movimientos_fondos`. */
const ORIGENES = {
  venta: "Venta",
  venta_anulada: "Venta anulada",
  gasto: "Gasto",
  gasto_anulado: "Gasto anulado",
  compra: "Compra",
  compra_anulada: "Compra anulada",
  manual: "Manual",
  apertura_turno: "Apertura de turno",
  cierre_turno: "Cierre de turno",
} as const;

export type Origen = keyof typeof ORIGENES;

/** Nombre legible del origen; uno desconocido (agregado en la BD después) se muestra tal cual. */
export function nombreOrigen(origen: string): string {
  return origen in ORIGENES ? ORIGENES[origen as Origen] : origen;
}

/** Reverso de una anulación (venta o gasto anulados, compra corregida): se marca en el libro. */
export function esReverso(origen: string): boolean {
  return origen === "venta_anulada" || origen === "gasto_anulado" || origen === "compra_anulada";
}
