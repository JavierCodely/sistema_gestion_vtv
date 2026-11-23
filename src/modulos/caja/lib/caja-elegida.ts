import type { CajaAbierta } from "../api/consultas";

/** Clave de `localStorage` con la última caja elegida en `/caja` (id de la caja, no del turno). */
export const CLAVE_CAJA_ELEGIDA = "vtv-caja-elegida";

/**
 * Caja donde trabaja el usuario en `/caja`: el turno abierto elegido. `aviso` no nulo = ese turno ya no
 * sirve (la venta respondió que se cerró): hay que volver a elegir aunque la lista todavía lo muestre.
 */
export interface Eleccion {
  turnoId: number;
  cajaNombre: string;
  aviso: string | null;
}

export type EstadoEleccion =
  | { tipo: "trabajando"; caja: CajaAbierta }
  /** `aviso`: por qué hay que volver a elegir (la caja elegida se cerró). */
  | { tipo: "eligiendo"; aviso: string | null };

/** La última caja elegida (solo comodidad: si `localStorage` no está disponible, no hay). */
export function leerCajaGuardada(): number | null {
  try {
    const valor = Number(localStorage.getItem(CLAVE_CAJA_ELEGIDA));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

export function guardarCajaElegida(cajaId: number): void {
  try {
    localStorage.setItem(CLAVE_CAJA_ELEGIDA, String(cajaId));
  } catch {
    // Sin localStorage (modo privado, cuota llena) solo se pierde la comodidad de recordarla.
  }
}

/**
 * Caja que queda elegida al entrar: la última elegida si sigue abierta; si no, la única abierta. Con
 * varias abiertas y ninguna recordada, el usuario elige.
 */
export function cajaInicial(
  cajas: readonly CajaAbierta[],
  cajaGuardada: number | null,
): CajaAbierta | null {
  const guardada = cajas.find((c) => c.caja_id === cajaGuardada);
  if (guardada) return guardada;
  return cajas.length === 1 ? (cajas[0] ?? null) : null;
}

export function aEleccion(caja: CajaAbierta): Eleccion {
  return { turnoId: caja.id, cajaNombre: caja.caja_nombre, aviso: null };
}

/**
 * Dónde está el usuario: trabajando en la caja elegida si su turno sigue abierto; si se cerró (ya no
 * está en la lista o la venta lo rechazó), eligiendo de nuevo con un aviso. Nunca se pasa solo a otra
 * caja: es otro cajón de efectivo.
 */
export function estadoEleccion(
  cajas: readonly CajaAbierta[],
  eleccion: Eleccion | null,
): EstadoEleccion {
  if (eleccion === null) return { tipo: "eligiendo", aviso: null };
  if (eleccion.aviso !== null) return { tipo: "eligiendo", aviso: eleccion.aviso };
  const caja = cajas.find((c) => c.id === eleccion.turnoId);
  if (caja) return { tipo: "trabajando", caja };
  return {
    tipo: "eligiendo",
    aviso: `El turno de la caja “${eleccion.cajaNombre}” se cerró: elegí una caja abierta.`,
  };
}
