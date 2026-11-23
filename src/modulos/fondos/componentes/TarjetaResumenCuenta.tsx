import type { ReactNode } from "react";
import { formatearMoneda } from "@/compartido/lib/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import type { ResumenCuenta } from "../api/consultas";
import { NOMBRE_CUENTA, type Cuenta } from "../lib/fondos";

/**
 * Resumen de una cuenta: saldo actual (de todos los tiempos) e ingresos, egresos y neto del rango.
 * Todo viene de la BD; acá solo se formatea. `saldo` llega armado (en efectivo, de `useSaldoEfectivo`).
 */
export function TarjetaResumenCuenta({
  cuenta,
  saldo,
  totales,
}: {
  cuenta: Cuenta;
  saldo: ReactNode;
  totales: ResumenCuenta | undefined;
}) {
  return (
    <Card data-testid={`resumen-${cuenta}`}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {NOMBRE_CUENTA[cuenta]}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Saldo actual</p>
          <p className="text-2xl font-semibold">{saldo}</p>
        </div>
        {/* Filas etiqueta/valor: con montos grandes no desbordan una tarjeta angosta. */}
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <dt className="text-muted-foreground">Ingresos del período</dt>
            <dd className="tabular-nums" data-testid={`resumen-${cuenta}-ingresos`}>
              {totales ? formatearMoneda(totales.ingresos) : "—"}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <dt className="text-muted-foreground">Egresos del período</dt>
            <dd className="tabular-nums" data-testid={`resumen-${cuenta}-egresos`}>
              {totales ? formatearMoneda(totales.egresos) : "—"}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-t pt-1 font-medium">
            <dt>Neto</dt>
            <dd
              className={
                totales && totales.neto < 0 ? "text-destructive tabular-nums" : "tabular-nums"
              }
              data-testid={`resumen-${cuenta}-neto`}
            >
              {totales ? formatearMoneda(totales.neto) : "—"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
