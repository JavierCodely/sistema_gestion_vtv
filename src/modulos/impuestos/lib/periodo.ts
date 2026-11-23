import { hoyEnArgentina } from "@/compartido/lib/formato";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";

/** Período del reporte: un año entero (`mes` null) o un mes de un año (1 = enero). */
export interface Periodo {
  anio: number;
  mes: number | null;
}

export const NOMBRES_MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Primer año que se ofrece: las ventas con fecha pasada se cargan desde el 2000. */
export const PRIMER_ANIO = 2000;

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** Días de negocio (YYYY-MM-DD) que abarca el período: del 1/1 al 31/12, o del 1° al último del mes. */
export function rangoDePeriodo({ anio, mes }: Periodo): RangoFechas {
  if (mes === null) return { desde: `${String(anio)}-01-01`, hasta: `${String(anio)}-12-31` };
  // Día 0 del mes siguiente = último día del mes (en UTC, sin husos horarios).
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    desde: `${String(anio)}-${dosCifras(mes)}-01`,
    hasta: `${String(anio)}-${dosCifras(mes)}-${dosCifras(ultimo)}`,
  };
}

/** Período por defecto: el mes actual (hora argentina). */
export function periodoActual(ahora: Date = new Date()): Periodo {
  const [anio, mes] = hoyEnArgentina(ahora).split("-").map(Number);
  return { anio: anio ?? PRIMER_ANIO, mes: mes ?? 1 };
}

/** Años del filtro, del siguiente al actual hacia atrás hasta `PRIMER_ANIO`. */
export function aniosDisponibles(ahora: Date = new Date()): number[] {
  const actual = periodoActual(ahora).anio;
  const anios: number[] = [];
  for (let a = actual + 1; a >= PRIMER_ANIO; a--) anios.push(a);
  return anios;
}

/** "Año 2027" o "Marzo de 2026". */
export function nombreDePeriodo({ anio, mes }: Periodo): string {
  return mes === null
    ? `Año ${String(anio)}`
    : `${NOMBRES_MESES[mes - 1] ?? ""} de ${String(anio)}`;
}
