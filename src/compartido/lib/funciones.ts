import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/compartido/lib/supabase";

const ERROR_GENERICO = "No se pudo completar la operación. Intentá de nuevo.";

/**
 * Llama a una Edge Function y devuelve su respuesta. Si falla, lanza `Error` con el mensaje en
 * español que devolvió la función (`{ error }`) o uno genérico (red, error sin cuerpo).
 */
export async function invocarFuncion<T>(nombre: string, cuerpo: object): Promise<T> {
  const respuesta = await supabase.functions.invoke<T>(nombre, { body: cuerpo });
  const error: unknown = respuesta.error;
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const contexto: unknown = error.context;
      if (contexto instanceof Response) {
        const datos: unknown = await contexto.json().catch(() => null);
        if (
          typeof datos === "object" &&
          datos !== null &&
          "error" in datos &&
          typeof datos.error === "string"
        ) {
          throw new Error(datos.error);
        }
      }
    }
    throw new Error(ERROR_GENERICO);
  }
  if (respuesta.data === null) throw new Error(ERROR_GENERICO);
  return respuesta.data;
}
