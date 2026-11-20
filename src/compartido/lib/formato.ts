// Formatos de presentación (solo visual: los cálculos de dinero los hace la BD).

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fechaHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const soloFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** $ 20.000,00 — acepta number o string numérico (PostgREST devuelve numeric como number). */
export function formatearMoneda(valor: number | string | null | undefined): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  return moneda.format(Number.isFinite(n) ? n : 0);
}

/** 19/11/2026, 14:05 en hora argentina. */
export function formatearFechaHora(iso: string | Date): string {
  return fechaHora.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** 19/11/2026 en hora argentina. */
export function formatearFecha(iso: string | Date): string {
  return soloFecha.format(typeof iso === "string" ? new Date(iso) : iso);
}
