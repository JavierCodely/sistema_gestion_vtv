import { formatearNumero } from "@/compartido/lib/formato";

export type Errores<K extends string> = Partial<Record<K, string>>;

export const LARGO_MINIMO_PASSWORD = 8;
/** bcrypt (Supabase Auth) solo usa los primeros 72 bytes. */
export const LARGO_MAXIMO_PASSWORD = 72;
/** Mismos límites que los CHECK de la BD (migración 014). */
export const LARGO_MAXIMO_NOMBRE = 100;
export const LARGO_MAXIMO_EMAIL = 254;
/** Mismo límite que el CHECK ventas_patente_largo (migración 014). */
export const LARGO_MAXIMO_PATENTE = 10;

/** Igual que `registrar_venta` y `registrar_venta_pasada`: sin espacios y en mayúsculas ("ab 123 cd" → "AB123CD"). */
export function normalizarPatente(texto: string): string {
  return texto.replace(/\s/g, "").toUpperCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarEmail(email: string): string | undefined {
  if (!email.trim()) return "Ingresá el email.";
  if (email.trim().length > LARGO_MAXIMO_EMAIL) return "El email es demasiado largo.";
  if (!EMAIL.test(email.trim())) return "El email no es válido.";
  return undefined;
}

export function validarPassword(password: string, confirmacion?: string): string | undefined {
  if (password.length < LARGO_MINIMO_PASSWORD) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`;
  }
  if (new TextEncoder().encode(password).length > LARGO_MAXIMO_PASSWORD) {
    return `La contraseña no puede superar los ${LARGO_MAXIMO_PASSWORD} caracteres.`;
  }
  if (confirmacion !== undefined && password !== confirmacion) {
    return "Las contraseñas no coinciden.";
  }
  return undefined;
}

export function validarNombre(nombre: string): string | undefined {
  if (!nombre.trim()) return "Ingresá el nombre.";
  if (nombre.trim().length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  }
  return undefined;
}

export function hayErrores(errores: Record<string, string | undefined>): boolean {
  return Object.values(errores).some(Boolean);
}

/** Igual que _validar_monto en la BD: numeric(12,2). */
export const MONTO_MAXIMO = 9_999_999_999.99;

export type ResultadoMonto =
  { valor: number; error?: undefined } | { valor?: undefined; error: string };

const MILES_CON_PUNTO = /^\d{1,3}(\.\d{3})+$/;
const NUMERO = /^\d+(\.\d+)?$/;

/**
 * Convierte lo que escribe el usuario en un monto, aceptando el formato argentino:
 * "20000", "20.000", "20000,50", "20.000,50" y también "20000.50".
 * Solo valida y convierte: los cálculos de dinero los hace la BD.
 */
export function parsearMonto(
  texto: string,
  {
    permitirCero = false,
    nombre = "monto",
  }: {
    permitirCero?: boolean;
    /** Sustantivo masculino para los mensajes: "monto", "precio", "costo"… */
    nombre?: string;
  } = {},
): ResultadoMonto {
  const invalido = { error: `El ${nombre} no es válido.` };
  let limpio = texto
    .trim()
    .replace(/^\$\s*/, "")
    .replace(/\s/g, "");
  if (!limpio) return { error: `Ingresá un ${nombre}.` };

  if (limpio.includes(",")) {
    // Coma decimal: los puntos solo pueden ser separadores de miles.
    const [entero = "", decimales, ...resto] = limpio.split(",");
    if (resto.length > 0 || (entero.includes(".") && !MILES_CON_PUNTO.test(entero))) {
      return invalido;
    }
    limpio = `${entero.replace(/\./g, "")}.${decimales ?? ""}`;
  } else if (MILES_CON_PUNTO.test(limpio)) {
    limpio = limpio.replace(/\./g, "");
  }

  if (!NUMERO.test(limpio)) return invalido;
  if ((limpio.split(".")[1] ?? "").length > 2) {
    return { error: `El ${nombre} no puede tener más de 2 decimales.` };
  }
  const valor = Number(limpio);
  if (valor === 0 && !permitirCero) return { error: `El ${nombre} debe ser mayor a cero.` };
  if (valor > MONTO_MAXIMO) return { error: `El ${nombre} es demasiado grande.` };
  return { valor };
}

/** Monto para precargar un input: 20000 → "20000", 1500.5 → "1500,50". */
export function montoComoTexto(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(".", ",");
}

/** Mismos límites que los CHECK de la BD (migración 014). */
export const LARGO_MAXIMO_NOTA = 500;
export const LARGO_MAXIMO_PROVEEDOR = 200;

export type ResultadoEntero =
  { valor: number; error?: undefined } | { valor?: undefined; error: string };

/**
 * Entero escrito por el usuario dentro de [minimo, maximo]. Acepta "1000" y "1.000" (miles con
 * punto bien agrupados); rechaza "2.5" o "1.0.0" en vez de convertirlos en otro número.
 * `nombre` es lo que se pide, con artículo: "la cantidad", "las hojas por unidad".
 */
export function parsearEntero(
  texto: string,
  { minimo, maximo, nombre }: { minimo: number; maximo: number; nombre: string },
): ResultadoEntero {
  const limpio = texto.trim();
  if (!limpio) return { error: `Ingresá ${nombre}.` };
  if (!/^\d+$/.test(limpio) && !MILES_CON_PUNTO.test(limpio)) {
    return { error: `Ingresá un número entero en ${nombre}.` };
  }
  const valor = Number(limpio.replace(/\./g, ""));
  if (valor < minimo || valor > maximo) {
    return {
      error: `Ingresá un valor entre ${formatearNumero(minimo)} y ${formatearNumero(maximo)} en ${nombre}.`,
    };
  }
  return { valor };
}

/** Nota o motivo obligatorio (mismo límite que la BD). */
export function validarNota(nota: string): string | undefined {
  if (!nota.trim()) return "Escribí una nota.";
  if (nota.trim().length > LARGO_MAXIMO_NOTA) {
    return `La nota no puede superar los ${LARGO_MAXIMO_NOTA} caracteres.`;
  }
  return undefined;
}

/** Motivo de anulación: obligatorio, mismo límite que la BD. */
export function validarMotivo(motivo: string): string | undefined {
  const limpio = motivo.trim();
  if (!limpio) return "Escribí el motivo.";
  if (limpio.length > LARGO_MAXIMO_NOTA) {
    return `El motivo no puede superar los ${String(LARGO_MAXIMO_NOTA)} caracteres.`;
  }
  return undefined;
}
