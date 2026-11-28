import { formatearMoneda } from "@/compartido/lib/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";

/** Totales ya calculados por la BD (`v_turnos` o `resumen_turnos`): acá solo se muestran. */
export interface ValoresTotales {
  ventas_efectivo: number | null;
  ventas_transferencia: number | null;
  ventas_total: number | null;
  gastos_total: number | null;
  neto: number | null;
}

/**
 * Tarjeta de totales por medio de pago, gastos y neto. `prefijoTestId` arma los `data-testid`
 * (`<prefijo>-Efectivo`, …) para distinguir varias tarjetas en la misma pantalla.
 * `efectivoEnCaja` (turno abierto): el efectivo del cajón en vivo (`v_turnos.efectivo_en_caja`),
 * destacado al final (`<prefijo>-efectivo-en-caja`).
 */
export function TotalesVentas({
  titulo,
  valores,
  prefijoTestId = "total",
  efectivoEnCaja,
}: {
  titulo: string;
  valores: ValoresTotales;
  prefijoTestId?: string;
  efectivoEnCaja?: number | null;
}) {
  const conCajon = efectivoEnCaja !== undefined && efectivoEnCaja !== null;
  const filas: [string, number | null][] = [
    ["Efectivo", valores.ventas_efectivo],
    ["Transferencia", valores.ventas_transferencia],
    ["Total ventas", valores.ventas_total],
    ["Gastos", valores.gastos_total],
    ["Neto", valores.neto],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{titulo}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl
          className={`grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 ${conCajon ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}
        >
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
              <dd
                className={`font-medium tabular-nums ${(valor ?? 0) < 0 ? "text-destructive" : ""}`}
                data-testid={`${prefijoTestId}-${etiqueta}`}
              >
                {formatearMoneda(valor)}
              </dd>
            </div>
          ))}
          {conCajon && (
            <div className="rounded-md bg-primary/10 px-2 py-1">
              <dt className="text-xs font-medium text-primary">Efectivo en caja</dt>
              <dd
                className={`font-semibold tabular-nums ${efectivoEnCaja < 0 ? "text-destructive" : "text-primary"}`}
                data-testid={`${prefijoTestId}-efectivo-en-caja`}
              >
                {formatearMoneda(efectivoEnCaja)}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
