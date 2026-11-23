import { Info } from "lucide-react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { Alert, AlertDescription, AlertTitle } from "@/compartido/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { useResumenVentasMixtas, type ResumenVentasMixtas } from "../api/consultas";
import { ListaVentasMixtas } from "./ListaVentasMixtas";

function tarjetas(resumen: ResumenVentasMixtas | null) {
  return [
    {
      id: "cantidad",
      titulo: "Ventas mixtas",
      valor: formatearNumero(resumen?.cantidad_ventas ?? 0),
    },
    { id: "total", titulo: "Total", valor: formatearMoneda(resumen?.total) },
    { id: "efectivo", titulo: "En efectivo", valor: formatearMoneda(resumen?.total_efectivo) },
    {
      id: "transferencia",
      titulo: "Por transferencia",
      valor: formatearMoneda(resumen?.total_transferencia),
    },
    {
      id: "tarjeta",
      titulo: "Con crédito/débito",
      valor: formatearMoneda(resumen?.total_tarjeta),
    },
  ];
}

/**
 * Ventas con pago mixto: informativa, sin saldo ni movimientos manuales. Cada parte ya está en su
 * cuenta (transferencia y crédito/débito como venta; el efectivo, en el cajón hasta el cierre del
 * turno): estos totales nunca se suman a las cuentas.
 */
export function PestanaMixto({ rango }: { rango: RangoFechas | null }) {
  const resumen = useResumenVentasMixtas(rango);

  return (
    <div className="flex flex-col gap-6">
      <Alert role="note" data-testid="aviso-mixto">
        <Info aria-hidden />
        <AlertTitle>Ya están incluidas en las otras pestañas</AlertTitle>
        <AlertDescription>
          Cada parte de una venta mixta ya figura en Efectivo, Transferencia o Crédito/Débito. Estos
          totales son informativos: no se suman a los de las cuentas.
        </AlertDescription>
      </Alert>

      {!rango ? (
        <p className="text-sm text-muted-foreground">
          Elegí un período válido para ver las ventas mixtas.
        </p>
      ) : (
        <>
          {resumen.isPending ? (
            <Cargando texto="Cargando totales…" />
          ) : resumen.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {tarjetas(resumen.data).map(({ id, titulo, valor }) => (
                  <Card key={id}>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {titulo}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p
                        className="text-2xl font-semibold tabular-nums"
                        data-testid={`mixtas-${id}`}
                      >
                        {valor}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Totales del período, sin las ventas anuladas.
              </p>
            </div>
          )}
          <ListaVentasMixtas rango={rango} />
        </>
      )}
    </div>
  );
}
