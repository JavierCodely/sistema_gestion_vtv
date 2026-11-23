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

const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** 1.250 — cantidades enteras (hojas, unidades). */
export function formatearNumero(valor: number): string {
  return entero.format(valor);
}

/** Hoy en hora argentina, como YYYY-MM-DD (para campos de fecha, validaciones y rangos de reportes). */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  // en-CA formatea las fechas como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

const lista = new Intl.ListFormat("es-AR", { style: "long", type: "conjunction" });

/** "Ana, Beto y Carla" (ej. quiénes atendieron un turno). Vacío si no hay nombres. */
export function formatearLista(nombres: readonly string[] | null | undefined): string {
  return lista.format(nombres ?? []);
}

/**
 * Un día de negocio (YYYY-MM-DD, ej. `fecha_local` o un campo de fecha) como 01/11/2026. Se arma
 * con el texto, sin pasar por `Date`: "2026-11-01" en UTC sería el 31/10 en hora argentina.
 */
export function formatearDia(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}
