/**
 * Tiempo máximo de los pedidos al servidor.
 *
 * `fetch` no tiene límite propio: si la conexión se corta sin aviso (red inestable, un proxy que
 * descarta la respuesta), la promesa nunca termina y la pantalla queda "Cargando…" para siempre.
 * Con un límite el pedido falla: supabase-js (postgrest-js) reintenta solo las lecturas (GET, hasta
 * 3 veces con espera de 1, 2 y 4 s) y las escrituras muestran el error para que el usuario decida
 * si reintentar (nunca se reintentan solas: el servidor pudo haberlas aplicado).
 */
export const LIMITE_PEDIDO_MS = 15_000;
/** Edge Functions: la facturación espera a ARCA. 150 s es el máximo de una función en Supabase. */
export const LIMITE_FUNCION_MS = 150_000;

interface Opciones {
  base?: typeof fetch;
  pedidoMs?: number;
  funcionMs?: number;
}

function urlDe(entrada: RequestInfo | URL): string {
  if (entrada instanceof Request) return entrada.url;
  return entrada instanceof URL ? entrada.href : entrada;
}

/** `fetch` con límite de tiempo, combinado con el `signal` que ya traiga el pedido. */
export function fetchConLimite({
  base = (...args) => fetch(...args),
  pedidoMs = LIMITE_PEDIDO_MS,
  funcionMs = LIMITE_FUNCION_MS,
}: Opciones = {}): typeof fetch {
  return (entrada, init) => {
    const esFuncion = new URL(urlDe(entrada), "http://x").pathname.startsWith("/functions/v1/");
    const limite = AbortSignal.timeout(esFuncion ? funcionMs : pedidoMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, limite]) : limite;
    return base(entrada, { ...init, signal });
  };
}
