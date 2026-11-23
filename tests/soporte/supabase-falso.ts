import { vi } from "vitest";

/**
 * Doble de `supabase` para tests de componentes: `from(tabla)` devuelve una cadena que acepta
 * cualquier método (select, eq, order, insert, update, single…) y, al esperarla, resuelve con la
 * respuesta configurada para esa tabla y operación. La operación es el primer método de la cadena.
 * `rpc(nombre, args)` funciona igual con la "tabla" `rpc:<nombre>` y la operación "rpc".
 *
 *   vi.mock("@/compartido/lib/supabase", async () => ({
 *     supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
 *   }));
 */
type Operacion = "select" | "insert" | "update" | "delete" | "rpc";

interface Respuesta {
  data: unknown;
  error: unknown;
}

export interface Llamada {
  tabla: string;
  operacion: string;
  cadena: { metodo: string; argumentos: unknown[] }[];
}

const respuestas = new Map<string, Respuesta>();
/** Respuestas condicionadas a la cadena (ej. solo con `.eq("abierto", true)`); se prueban antes. */
const condicionales = new Map<
  string,
  { cuando: (llamada: Llamada) => boolean; respuesta: Respuesta }[]
>();
export const llamadas: Llamada[] = [];

/**
 * Sin `cuando`, es la respuesta de toda llamada a esa tabla y operación. Con `cuando`, solo de las
 * llamadas cuya cadena lo cumpla (ej. `conFiltro("eq", "abierto", true)`); la última que se configuró
 * gana. Sirve cuando dos consultas distintas leen la misma tabla en la misma pantalla.
 */
export function responder(
  tabla: string,
  operacion: Operacion,
  respuesta: Partial<Respuesta>,
  { cuando }: { cuando?: (llamada: Llamada) => boolean } = {},
) {
  const completa = { data: null, error: null, ...respuesta };
  const clave = `${tabla}:${operacion}`;
  if (!cuando) {
    respuestas.set(clave, completa);
    return;
  }
  condicionales.set(clave, [{ cuando, respuesta: completa }, ...(condicionales.get(clave) ?? [])]);
}

/** Condición para `responder(..., { cuando })`: la cadena llamó a `metodo` con esos argumentos. */
export function conFiltro(metodo: string, ...argumentos: unknown[]) {
  return (llamada: Llamada) =>
    llamada.cadena.some(
      (c) =>
        c.metodo === metodo &&
        argumentos.every((a, i) => JSON.stringify(c.argumentos[i]) === JSON.stringify(a)),
    );
}

/** Canal de Realtime falso: guarda los `on(...)` y el callback de `subscribe`. */
interface CanalFalso {
  nombre: string;
  tablas: string[];
  avisos: (() => void)[];
  alCambiarEstado: ((estado: string) => void) | null;
  cerrado: boolean;
}

export const canales: CanalFalso[] = [];

export function reiniciarSupabaseFalso() {
  respuestas.clear();
  condicionales.clear();
  llamadas.length = 0;
  canales.length = 0;
}

function canalPara(nombre: string) {
  const datos: CanalFalso = {
    nombre,
    tablas: [],
    avisos: [],
    alCambiarEstado: null,
    cerrado: false,
  };
  canales.push(datos);
  const canal = {
    on(_tipo: string, filtro: { table?: string }, aviso: () => void) {
      if (filtro.table) datos.tablas.push(filtro.table);
      datos.avisos.push(aviso);
      return canal;
    },
    subscribe(alCambiarEstado?: (estado: string) => void) {
      datos.alCambiarEstado = alCambiarEstado ?? null;
      // Como el real: se suscribe después, no dentro del render.
      queueMicrotask(() => {
        if (!datos.cerrado) datos.alCambiarEstado?.("SUBSCRIBED");
      });
      return canal;
    },
    datos,
  };
  return canal;
}

/** Simula un cambio en `tabla` llegando por Realtime a los canales abiertos que la escuchan. */
export function emitirCambio(tabla: string) {
  for (const canal of canales) {
    if (canal.cerrado) continue;
    canal.tablas.forEach((t, i) => {
      if (t === tabla) canal.avisos[i]?.();
    });
  }
}

/** Simula que la conexión de Realtime cambia de estado (ej. "CHANNEL_ERROR", "SUBSCRIBED"). */
export function cambiarEstadoCanales(estado: string) {
  for (const canal of canales) if (!canal.cerrado) canal.alCambiarEstado?.(estado);
}

function cadenaPara(tabla: string, inicial?: Llamada["cadena"][number]): unknown {
  const llamada: Llamada = {
    tabla,
    operacion: inicial ? "rpc" : "",
    cadena: inicial ? [inicial] : [],
  };
  llamadas.push(llamada);
  const cadena: unknown = new Proxy(
    {},
    {
      get(_objetivo, propiedad) {
        if (propiedad === "then") {
          const clave = `${tabla}:${llamada.operacion}`;
          const respuesta = condicionales.get(clave)?.find((c) => c.cuando(llamada))?.respuesta ??
            respuestas.get(clave) ?? {
              data: null,
              error: { message: `Sin respuesta configurada para ${tabla}:${llamada.operacion}` },
            };
          return (resolver: (valor: Respuesta) => unknown) =>
            Promise.resolve(respuesta).then(resolver);
        }
        return (...argumentos: unknown[]) => {
          const metodo = String(propiedad);
          llamada.operacion ||= metodo;
          llamada.cadena.push({ metodo, argumentos });
          return cadena;
        };
      },
    },
  );
  return cadena;
}

export const supabaseFalso = {
  from: vi.fn((tabla: string) => cadenaPara(tabla)),
  rpc: vi.fn((nombre: string, argumentos?: unknown) =>
    cadenaPara(`rpc:${nombre}`, { metodo: "rpc", argumentos: [argumentos] }),
  ),
  channel: vi.fn((nombre: string) => canalPara(nombre)),
  removeChannel: vi.fn((canal: { datos: CanalFalso }) => {
    canal.datos.cerrado = true;
    return Promise.resolve("ok");
  }),
};

/** Respuesta de `supabase.rpc(nombre)`. */
export function responderRpc(nombre: string, respuesta: { data?: unknown; error?: unknown }) {
  responder(`rpc:${nombre}`, "rpc", respuesta);
}

/** Argumentos con los que se llamó por última vez a `supabase.rpc(nombre)`. */
export function argumentosRpc(nombre: string): unknown {
  return argumentosDe(`rpc:${nombre}`, "rpc")?.[0];
}

/** Argumentos de `metodo` en la última llamada a `tabla` con esa operación (undefined si no hubo). */
export function argumentosDe(tabla: string, operacion: Operacion, metodo: string = operacion) {
  const llamada = llamadas.findLast((l) => l.tabla === tabla && l.operacion === operacion);
  return llamada?.cadena.find((c) => c.metodo === metodo)?.argumentos;
}
