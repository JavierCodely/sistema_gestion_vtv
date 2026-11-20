import {
  validarEmail,
  validarNombre,
  validarPassword,
  type Errores,
} from "@/compartido/lib/validaciones";

export interface DatosUsuarioNuevo {
  nombre: string;
  email: string;
  password: string;
}

export function validarUsuarioNuevo(datos: DatosUsuarioNuevo): Errores<keyof DatosUsuarioNuevo> {
  const errores: Errores<keyof DatosUsuarioNuevo> = {};
  const nombre = validarNombre(datos.nombre);
  const email = validarEmail(datos.email);
  const password = validarPassword(datos.password);
  if (nombre) errores.nombre = nombre;
  if (email) errores.email = email;
  if (password) errores.password = password;
  return errores;
}
