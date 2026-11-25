import { CheckCircle2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { useResumenVentasDeTurno } from "../api/consultas";

function cantidadDeVentas(n: number) {
  return n === 1 ? "1 venta" : `${String(n)} ventas`;
}

function Tarjeta({
  titulo,
  icono,
  cantidad,
  total,
  testId,
  grande,
  apagado = false,
}: {
  titulo: string;
  icono: ReactNode;
  cantidad: number;
  total: number;
  testId: string;
  grande: boolean;
  apagado?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-muted/40",
        grande ? "px-5 py-3" : "px-4 py-2",
      )}
      data-testid={testId}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground",
          grande ? "text-base" : "text-sm",
        )}
      >
        {icono}
        {titulo}
      </span>
      <span
        className={cn(
          "font-bold tabular-nums",
          grande ? "text-3xl" : "text-2xl",
          apagado && "text-muted-foreground",
        )}
      >
        {formatearMoneda(total)}
      </span>
      <span className={cn("text-muted-foreground", grande ? "text-base" : "text-sm")}>
        {cantidadDeVentas(cantidad)}
      </span>
    </div>
  );
}

/**
 * Total de ventas realizadas (sin anular) y anuladas del turno entero (`resumen_ventas_de_turno`,
 * decisión 2026-11-25, migración 50): lo calcula la BD y no cambia con los filtros de la lista. Lo ven
 * el cajero en el historial de la caja y el admin en las ventas de cada turno. `grande`: letra de la caja.
 */
export function ResumenVentasTurno({
  turnoId,
  grande = false,
}: {
  turnoId: number;
  grande?: boolean;
}) {
  const resumen = useResumenVentasDeTurno(turnoId);
  if (resumen.isPending) {
    return <p className="text-muted-foreground">Cargando totales de ventas…</p>;
  }
  if (resumen.isError) {
    return <p className="text-destructive">{mensajeDeError(resumen.error)}</p>;
  }
  const r = resumen.data;
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap"
      role="group"
      aria-label="Totales de ventas del turno"
    >
      <Tarjeta
        titulo="Realizadas"
        icono={<CheckCircle2 aria-hidden className="size-4 text-primary" />}
        cantidad={r.realizadas_cantidad}
        total={r.realizadas_total}
        testId="total-realizadas"
        grande={grande}
      />
      <Tarjeta
        titulo="Anuladas"
        icono={<XCircle aria-hidden className="size-4 text-destructive" />}
        cantidad={r.anuladas_cantidad}
        total={r.anuladas_total}
        testId="total-anuladas"
        grande={grande}
        apagado
      />
    </div>
  );
}
