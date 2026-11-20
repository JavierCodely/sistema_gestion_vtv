import { vi } from "vitest";

/**
 * Doble de `supabase` para tests de componentes: `from(tabla)` devuelve una cadena que acepta
 * cualquier método (select, eq, order, insert, update, single…) y, al esperarla, resuelve con la
 * respuesta configurada para esa tabla y operación. La operación es el primer método de la cadena.
 *
 *   vi.mock("@/compartido/lib/supabase", async () => ({
 *     supabase: (await import("@tests/soporte/supabase-falso")).supabaseFalso,
 *   }));
 */
type Operacion = "select" | "insert" | "update" | "delete";

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
export const llamadas: Llamada[] = [];

export function responder(tabla: string, operacion: Operacion, respuesta: Partial<Respuesta>) {
  respuestas.set(`${tabla}:${operacion}`, { data: null, error: null, ...respuesta });
}

export function reiniciarSupabaseFalso() {
  respuestas.clear();
  llamadas.length = 0;
}

function cadenaPara(tabla: string): unknown {
  const llamada: Llamada = { tabla, operacion: "", cadena: [] };
  llamadas.push(llamada);
  const cadena: unknown = new Proxy(
    {},
    {
      get(_objetivo, propiedad) {
        if (propiedad === "then") {
          const respuesta = respuestas.get(`${tabla}:${llamada.operacion}`) ?? {
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

export const supabaseFalso = { from: vi.fn(cadenaPara) };

/** Argumentos de `metodo` en la última llamada a `tabla` con esa operación (undefined si no hubo). */
export function argumentosDe(tabla: string, operacion: Operacion, metodo: string = operacion) {
  const llamada = llamadas.findLast((l) => l.tabla === tabla && l.operacion === operacion);
  return llamada?.cadena.find((c) => c.metodo === metodo)?.argumentos;
}
