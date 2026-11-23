import { hoyEnArgentina } from "@/compartido/lib/formato";
import {
  LARGO_MAXIMO_PATENTE,
  normalizarPatente,
  parsearMonto,
  type Errores,
} from "@/compartido/lib/validaciones";
import type { MedioPago } from "@/modulos/caja/api/consultas";
import type { DatosVentaPasada } from "../api/consultas";

/** Igual que `registrar_venta_pasada`: no antes de esta fecha. */
/**
 * Hora que se usa si no se elige ninguna: el comienzo del día. La venta queda en el día de negocio
 * elegido y, aunque sea hoy, siempre es anterior a este momento (lo exige la BD).
 */
export const HORA_SIN_ELEGIR = "00:00";

export const FECHA_MINIMA_VENTA_PASADA = "2000-01-01";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface FormularioVentaPasada {
  fecha: string;
  hora: string;
  cajaId: string;
  servicioId: string;
  medioPago: MedioPago | "";
  precio: string;
  patente: string;
}

export type ErroresVentaPasada = Errores<keyof FormularioVentaPasada>;

function idValido(texto: string): number | undefined {
  const id = Number(texto);
  return texto && Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Mismas reglas que `registrar_venta_pasada`. Que la fecha y hora sean anteriores a este momento
 * lo controla la BD con su reloj; acá solo se rechaza una fecha posterior a hoy.
 */
export function validarVentaPasada(
  formulario: FormularioVentaPasada,
  hoy: string = hoyEnArgentina(),
): { datos?: DatosVentaPasada; errores?: ErroresVentaPasada } {
  const errores: ErroresVentaPasada = {};

  if (!FECHA.test(formulario.fecha)) errores.fecha = "Elegí la fecha de la venta.";
  else if (formulario.fecha > hoy) errores.fecha = "La fecha no puede ser posterior a hoy.";
  else if (formulario.fecha < FECHA_MINIMA_VENTA_PASADA)
    errores.fecha = "La fecha no puede ser anterior al 01/01/2000.";

  // La hora es opcional: vacía = comienzo del día.
  const hora = formulario.hora.trim() === "" ? HORA_SIN_ELEGIR : formulario.hora;
  if (!HORA.test(hora)) errores.hora = "La hora no es válida.";

  const cajaId = idValido(formulario.cajaId);
  if (cajaId === undefined) errores.cajaId = "Elegí una caja.";
  const servicioId = idValido(formulario.servicioId);
  if (servicioId === undefined) errores.servicioId = "Elegí un servicio.";
  if (!formulario.medioPago) errores.medioPago = "Elegí el medio de pago.";

  const precio = parsearMonto(formulario.precio, { permitirCero: true, nombre: "precio" });
  if (precio.error !== undefined) errores.precio = precio.error;

  const patente = normalizarPatente(formulario.patente);
  if (patente.length > LARGO_MAXIMO_PATENTE) {
    errores.patente = `La patente no puede superar los ${String(LARGO_MAXIMO_PATENTE)} caracteres.`;
  }

  if (
    Object.keys(errores).length > 0 ||
    cajaId === undefined ||
    servicioId === undefined ||
    !formulario.medioPago ||
    precio.valor === undefined
  ) {
    return { errores };
  }
  return {
    datos: {
      fecha: formulario.fecha,
      hora,
      cajaId,
      servicioId,
      medioPago: formulario.medioPago,
      precio: precio.valor,
      patente: patente || null,
    },
  };
}
