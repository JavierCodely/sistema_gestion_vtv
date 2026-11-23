export const MENSAJE_DESACTIVADO = "Tu usuario está desactivado. Consultá con el administrador.";

/** Traduce los errores de Supabase Auth al iniciar sesión. */
export function traducirErrorLogin(error: { code?: string | undefined; message: string }): string {
  const { code, message } = error;
  if (code === "user_banned" || /banned/i.test(message)) return MENSAJE_DESACTIVADO;
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Email o contraseña incorrectos.";
  }
  if (code === "email_not_confirmed") return "El email todavía no fue confirmado.";
  if (/fetch|network/i.test(message)) {
    return "No se pudo conectar con el servidor. Revisá la conexión.";
  }
  return "No se pudo iniciar sesión. Intentá de nuevo.";
}
