import {
  LARGO_MAXIMO_PATENTE,
  normalizarPatente,
  parsearMonto,
  type Errores,
} from "@/compartido/lib/validaciones";
import type { CobroVenta, DatosVenta } from "../api/consultas";

/** Mismo límite que el CHECK turnos_observaciones_largo (migración 014). */
export const LARGO_MAXIMO_OBSERVACIONES = 1000;

export interface FormularioVenta {
  servicioId: number | null;
  cobro: CobroVenta | null;
  patente: string;
  descuentoId: number | null;
  /** Precio final en pantalla: va a la BD para que rechace la venta si ya no es ese. */
  precioEsperado: number;
}

export type ErroresVenta = Errores<"servicioId" | "cobro" | "patente">;

/** Lo que se puede controlar antes de llamar a `registrar_venta` (el resto lo valida la BD). */
export function validarVenta(
  formulario: FormularioVenta,
): { errores: ErroresVenta; datos?: undefined } | { errores?: undefined; datos: DatosVenta } {
  const errores: ErroresVenta = {};
  const { servicioId, cobro } = formulario;
  if (servicioId === null || !Number.isInteger(servicioId) || servicioId <= 0) {
    errores.servicioId = "Elegí un servicio.";
  }
  if (!cobro) errores.cobro = "Elegí el medio de pago.";

  const patente = normalizarPatente(formulario.patente);
  if (patente === "") {
    errores.patente = "Ingresá la patente del vehículo.";
  } else if (patente.length > LARGO_MAXIMO_PATENTE) {
    errores.patente = `La patente no puede superar los ${String(LARGO_MAXIMO_PATENTE)} caracteres.`;
  }

  if (servicioId === null || !cobro || Object.keys(errores).length > 0) return { errores };
  return {
    datos: {
      servicioId,
      cobro,
      patente: patente || null,
      descuentoId: formulario.descuentoId,
      precioEsperado: formulario.precioEsperado,
    },
  };
}

/** Observaciones del cierre: opcionales. */
export function validarObservaciones(texto: string): string | undefined {
  if (texto.trim().length > LARGO_MAXIMO_OBSERVACIONES) {
    return `Las observaciones no pueden superar los ${String(LARGO_MAXIMO_OBSERVACIONES)} caracteres.`;
  }
  return undefined;
}

export interface FormularioAperturaTurno {
  cajaId: string;
  efectivoInicial: string;
}

export interface DatosAperturaTurno {
  cajaId: number;
  efectivoInicial: number;
}

export type ErroresAperturaTurno = Errores<keyof FormularioAperturaTurno>;

/** Mismas reglas que `abrir_turno`: caja y efectivo inicial mayor a cero (`_validar_monto`). */
export function validarAperturaTurno(formulario: FormularioAperturaTurno): {
  datos?: DatosAperturaTurno;
  errores?: ErroresAperturaTurno;
} {
  const errores: ErroresAperturaTurno = {};
  const cajaId = Number(formulario.cajaId);
  if (!formulario.cajaId || !Number.isInteger(cajaId) || cajaId <= 0)
    errores.cajaId = "Elegí una caja.";
  const efectivo = parsearMonto(formulario.efectivoInicial);
  if (efectivo.error !== undefined) {
    errores.efectivoInicial =
      formulario.efectivoInicial.trim() === "" ? "Ingresá el efectivo inicial." : efectivo.error;
  }
  if (efectivo.valor === undefined || Object.keys(errores).length > 0) return { errores };
  return { datos: { cajaId, efectivoInicial: efectivo.valor } };
}
