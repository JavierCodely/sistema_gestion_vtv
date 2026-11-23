import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { SelectorRango } from "@/compartido/componentes/SelectorRango";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { mesActual, revisarRango } from "@/compartido/lib/rango-fechas";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { useResumenDescuentos } from "../api/consultas";
import { RankingDescuentos } from "./RankingDescuentos";

/**
 * Estadísticas de descuentos en un rango de días (por defecto, el mes actual): ventas con descuento,
 * total descontado y rankings por descuento y por servicio. Todo lo calcula `resumen_descuentos()`
 * (sin anuladas, días en hora argentina).
 */
export function EstadisticasDescuentos() {
  const [valor, setValor] = useState(() => mesActual());
  const { rango, error } = revisarRango(valor);
  const resumen = useResumenDescuentos(rango);

  return (
    <section aria-labelledby="titulo-estadisticas-descuentos" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-estadisticas-descuentos" className="text-lg font-semibold">
            Estadísticas
          </h2>
          <p className="text-sm text-muted-foreground">
            Ventas con descuento del período, sin anuladas.
          </p>
        </div>
        <SelectorRango id="estadisticas" valor={valor} onCambiar={setValor} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !rango ? (
        <p className="text-sm text-muted-foreground">Elegí las dos fechas del período.</p>
      ) : resumen.isPending ? (
        <Cargando texto="Cargando estadísticas…" />
      ) : resumen.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
        </Alert>
      ) : resumen.data.total === null ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          No hubo ventas con descuento en este período.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Ventas con descuento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className="text-3xl font-semibold tabular-nums"
                  data-testid="estadisticas-cantidad"
                >
                  {formatearNumero(resumen.data.total.cantidad_ventas)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total descontado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums" data-testid="estadisticas-total">
                  {formatearMoneda(resumen.data.total.total_descontado)}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RankingDescuentos
              titulo="Por descuento"
              columna="Descuento"
              filas={resumen.data.porDescuento}
            />
            <RankingDescuentos
              titulo="Por servicio"
              columna="Servicio"
              filas={resumen.data.porServicio}
            />
          </div>
        </>
      )}
    </section>
  );
}
