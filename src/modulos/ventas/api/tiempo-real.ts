import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { supabase } from "@/compartido/lib/supabase";

/** Estado de la conexión en vivo: se muestra arriba de la pantalla de Ventas. */
export type EstadoEnVivo = "conectando" | "en-vivo" | "sin-conexion";

/**
 * Tablas publicadas en Realtime (migración 35). La RLS y los grants por columna de cada usuario
 * filtran lo que llega; acá los eventos solo avisan que hay que volver a consultar: los totales
 * siempre salen de las vistas y RPC, nunca del contenido del evento.
 */
const TABLAS = ["ventas", "venta_pagos", "gastos", "turnos", "comprobantes"] as const;

/**
 * Una venta genera varios eventos seguidos (la venta, sus pagos, a veces una alerta): se agrupan
 * para volver a consultar una sola vez.
 */
export const ESPERA_AGRUPAR_MS = 400;

let siguienteCanal = 0;

/**
 * Mantiene al día, en vivo, los turnos (lista, abiertos, totales, resumen), las ventas de cada turno
 * y sus comprobantes. Ante una reconexión vuelve a consultar todo (pudo perderse algún evento).
 * Devuelve el estado de la conexión y `actualizar` para refrescar a mano.
 */
export function useVentasEnVivo(): { estado: EstadoEnVivo; actualizar: () => void } {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoEnVivo>("conectando");

  const actualizar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["turnos"] });
    // Prefijos de `clavesCaja.ventasDeTurno(id)` y `clavesFacturacion.deTurno(id)`: todos los turnos.
    void queryClient.invalidateQueries({ queryKey: ["caja", "ventas"] });
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "turno"] });
  }, [queryClient]);

  useEffect(() => {
    let pendiente: ReturnType<typeof setTimeout> | undefined;
    let seCorto = false;
    const avisar = () => {
      clearTimeout(pendiente);
      pendiente = setTimeout(actualizar, ESPERA_AGRUPAR_MS);
    };

    siguienteCanal += 1;
    const canal = supabase.channel(`ventas-en-vivo-${String(siguienteCanal)}`);
    for (const tabla of TABLAS) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, avisar);
    }
    canal.subscribe((estadoCanal) => {
      if (estadoCanal === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        setEstado("en-vivo");
        if (seCorto) avisar();
        seCorto = false;
      } else {
        // CHANNEL_ERROR, TIMED_OUT o CLOSED: supabase-js reintenta solo.
        setEstado("sin-conexion");
        seCorto = true;
      }
    });

    return () => {
      clearTimeout(pendiente);
      void supabase.removeChannel(canal);
    };
  }, [actualizar]);

  return { estado, actualizar };
}
