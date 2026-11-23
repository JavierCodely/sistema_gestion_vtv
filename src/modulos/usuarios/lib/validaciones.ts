import {
  LARGO_MAXIMO_NOMBRE,
  validarEmail,
  validarNombre,
  validarPassword,
  type Errores,
} from "@/compartido/lib/validaciones";

/** Mismo límite que el CHECK de perfiles.apellido. */
export function validarApellido(apellido: string): string | undefined {
  if (!apellido.trim()) return "Ingresá el apellido.";
  if (apellido.trim().length > LARGO_MAXIMO_NOMBRE) {
    return `El apellido no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`;
  }
  return undefined;
}

export interface DatosUsuarioNuevo {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
}

export function validarUsuarioNuevo(datos: DatosUsuarioNuevo): Errores<keyof DatosUsuarioNuevo> {
  const errores: Errores<keyof DatosUsuarioNuevo> = {};
  const nombre = validarNombre(datos.nombre);
  const apellido = validarApellido(datos.apellido);
  const email = validarEmail(datos.email);
  const password = validarPassword(datos.password);
  if (nombre) errores.nombre = nombre;
  if (apellido) errores.apellido = apellido;
  if (email) errores.email = email;
  if (password) errores.password = password;
  return errores;
}
