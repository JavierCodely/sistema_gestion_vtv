/** Mensaje legible de cualquier error (los de la BD y Edge Functions ya vienen en español). */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string" && message) return message;
  }
  return "Ocurrió un error inesperado. Intentá de nuevo.";
}
