/**
 * Mensaje legible y en español para cualquier error.
 *
 * - Nuestras RPC responden en español con P0001 / 22023 / 42501: ese mensaje se muestra tal cual.
 * - Los errores sin código los arma la app o la Edge Function (también en español).
 * - Todo lo demás (Postgres, PostgREST, red) viene en inglés: se traduce por código.
 * Cada pantalla puede reemplazar algunos por uno más específico (ej. "Ya existe una caja con ese nombre").
 */
export interface MensajesPorCodigo {
  /** 23505: valor repetido (nombre único). */
  repetido?: string;
  /** 23503: relacionado con otro registro (FK). */
  enUso?: string;
  /**
   * Mensaje por nombre de restricción de la BD (índice único, CHECK o FK), para distinguir
   * errores con el mismo código. Ej.: { certificados_uno_por_servicio: "Ese servicio ya…" }.
   */
  restricciones?: Record<string, string>;
}

export const MENSAJES_ERROR = {
  repetido: "Ya existe un registro con esos datos.",
  enUso: "El dato está relacionado con otro registro que no existe o que todavía lo usa.",
  invalido: "Algún dato no es válido. Revisá el formulario.",
  sinPermiso: "No tenés permiso para hacer esto.",
  noEncontrado: "No se encontró el registro o no tenés permiso para modificarlo.",
  sesionVencida: "Tu sesión venció. Ingresá de nuevo.",
  demora: "La operación tardó demasiado. Intentá de nuevo.",
  conexion: "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.",
  inesperado: "Ocurrió un error inesperado. Intentá de nuevo.",
} as const;

/** Códigos con los que nuestras RPC (raise exception) devuelven mensajes en español. */
const CODIGOS_PROPIOS = new Set(["P0001", "22023", "42501"]);

/** Mensajes en inglés que genera Postgres con 42501 (los nuestros con ese código están en español). */
const PERMISO_DE_POSTGRES = /^(permission denied|new row violates row-level security)/i;

/** fetch caído: Chrome, Firefox, Safari y Node. supabase-js los envuelve sin código. */
const ERROR_DE_RED = /failed to fetch|networkerror|load failed|fetch failed/i;

/** Venció el límite de tiempo del pedido (`fetchConLimite`, compartido/lib/red.ts). */
const ERROR_DE_DEMORA = /timeouterror|signal timed out|operation timed out|aborted due to timeout/i;

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor ? valor : undefined;
}

function porCodigo(codigo: string, mensaje: string | undefined, mensajes: MensajesPorCodigo) {
  switch (codigo) {
    case "23505":
      return mensajes.repetido ?? MENSAJES_ERROR.repetido;
    case "23503":
      return mensajes.enUso ?? MENSAJES_ERROR.enUso;
    case "23502":
    case "23514":
    case "22P02":
    case "22003":
    case "22001":
      return MENSAJES_ERROR.invalido;
    case "PGRST116":
      return MENSAJES_ERROR.noEncontrado;
    case "PGRST301":
    case "PGRST303":
      return MENSAJES_ERROR.sesionVencida;
    case "57014":
      return MENSAJES_ERROR.demora;
  }
  if (CODIGOS_PROPIOS.has(codigo) && mensaje) {
    return codigo === "42501" && PERMISO_DE_POSTGRES.test(mensaje)
      ? MENSAJES_ERROR.sinPermiso
      : mensaje;
  }
  if (codigo === "42501") return MENSAJES_ERROR.sinPermiso;
  return MENSAJES_ERROR.inesperado;
}

/** Postgres nombra la restricción entre comillas: violates unique constraint "x". */
function porRestriccion(
  mensaje: string | undefined,
  detalles: string | undefined,
  restricciones: Record<string, string> | undefined,
) {
  if (!restricciones) return undefined;
  const textoCompleto = `${mensaje ?? ""} ${detalles ?? ""}`;
  const nombre = Object.keys(restricciones).find((r) => textoCompleto.includes(`"${r}"`));
  return nombre === undefined ? undefined : restricciones[nombre];
}

export function mensajeDeError(error: unknown, mensajes: MensajesPorCodigo = {}): string {
  if (typeof error !== "object" || error === null) return MENSAJES_ERROR.inesperado;
  const codigo = "code" in error ? texto(error.code) : undefined;
  const mensaje = "message" in error ? texto(error.message) : undefined;
  const detalles = "details" in error ? texto(error.details) : undefined;

  if (codigo?.startsWith("23")) {
    const especifico = porRestriccion(mensaje, detalles, mensajes.restricciones);
    if (especifico) return especifico;
  }

  if (codigo) return porCodigo(codigo, mensaje, mensajes);
  if (mensaje && ERROR_DE_RED.test(mensaje)) return MENSAJES_ERROR.conexion;
  if (mensaje && ERROR_DE_DEMORA.test(mensaje)) return MENSAJES_ERROR.demora;
  return mensaje ?? MENSAJES_ERROR.inesperado;
}
