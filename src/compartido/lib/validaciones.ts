export type Errores<K extends string> = Partial<Record<K, string>>;

export const LARGO_MINIMO_PASSWORD = 8;
/** bcrypt (Supabase Auth) solo usa los primeros 72 bytes. */
export const LARGO_MAXIMO_PASSWORD = 72;
/** Mismos límites que los CHECK de la BD (migración 014). */
export const LARGO_MAXIMO_NOMBRE = 100;
export const LARGO_MAXIMO_EMAIL = 254;

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
