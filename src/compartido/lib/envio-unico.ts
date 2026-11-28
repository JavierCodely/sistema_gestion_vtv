import { useCallback, useRef } from "react";

/**
 * Candado para enviar un formulario una sola vez a la vez. `isPending` y el botón deshabilitado
 * recién cambian en el render siguiente, así que un doble clic o doble Enter que llegue antes
 * enviaría dos veces: en un gasto, una venta pasada, una compra, un ajuste o un movimiento de Fondos
 * eso registra dos movimientos (la BD no tiene cómo saber que es el mismo). El candado se toma en el
 * mismo evento y se suelta al terminar (bien o con error, así se puede corregir y reintentar).
 *
 * Uso: `onSubmit={(e) => { e.preventDefault(); void unaVez(() => enviar(e)); }}`. El
 * `preventDefault` va afuera: si el envío se ignora, el formulario igual no recarga la página.
 */
export function useEnvioUnico() {
  const enCurso = useRef(false);
  return useCallback(async (accion: () => Promise<void>) => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      await accion();
    } finally {
      enCurso.current = false;
    }
  }, []);
}
