import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearDia, formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { cn } from "@/compartido/lib/utils";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { useVentasMixtas } from "../api/consultas";

/** Parte de un medio en la venta: "—" si ese medio no se usó. */
function parte(monto: number | null) {
  return monto === null || monto === 0 ? "—" : formatearMoneda(monto);
}

/** Ventas con pago mixto del rango con el reparto por medio (`v_ventas_mixtas`); anuladas tachadas. */
export function ListaVentasMixtas({ rango }: { rango: RangoFechas }) {
  const ventas = useVentasMixtas(rango);

  return (
    <section aria-labelledby="titulo-ventas-mixtas" className="flex flex-col gap-3">
      <div>
        <h3 id="titulo-ventas-mixtas" className="text-lg font-semibold">
          Ventas con pago mixto
        </h3>
        <p className="text-sm text-muted-foreground" data-testid="periodo-ventas-mixtas">
          Del {formatearDia(rango.desde)} al {formatearDia(rango.hasta)}
        </p>
      </div>
      {ventas.isPending ? (
        <Cargando texto="Cargando ventas…" />
      ) : ventas.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(ventas.error)}</AlertDescription>
        </Alert>
      ) : ventas.data.pages.flat().length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          No hubo ventas con pago mixto en este período.
        </p>
      ) : (
        <>
          <div className="md:overflow-x-auto md:rounded-md md:border">
            <Table apilada>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Vendió</TableHead>
                  <TableHead className="text-right">Efectivo</TableHead>
                  <TableHead className="text-right">Transferencia</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.data.pages.flat().map((v) => {
                  const tachado = v.anulada && "line-through max-md:no-underline";
                  return (
                    <TableRow
                      key={v.id}
                      data-testid={`venta-mixta-${String(v.id)}`}
                      className={cn(v.anulada && "text-muted-foreground")}
                    >
                      <TableCell data-label="N°" className={cn("tabular-nums", tachado)}>
                        {v.id}
                      </TableCell>
                      <TableCell data-label="Fecha" className="whitespace-nowrap">
                        <span className={cn(tachado)}>{formatearFechaHora(v.creado_en)}</span>
                        {v.anulada && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            <Badge variant="destructive">Anulada</Badge>
                            {v.anulada_motivo && (
                              <span className="text-xs whitespace-normal">{v.anulada_motivo}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell data-label="Caja" className={cn(tachado)}>
                        {v.caja_nombre ?? "—"}
                      </TableCell>
                      <TableCell
                        data-label="Servicio"
                        className={cn("max-w-xs break-words", tachado)}
                      >
                        {v.servicio_nombre}
                        {v.patente && ` — ${v.patente}`}
                      </TableCell>
                      <TableCell data-label="Vendió">{v.usuario_nombre ?? "—"}</TableCell>
                      <TableCell
                        data-label="Efectivo"
                        className={cn("text-right whitespace-nowrap tabular-nums", tachado)}
                      >
                        {parte(v.pago_efectivo)}
                      </TableCell>
                      <TableCell
                        data-label="Transferencia"
                        className={cn("text-right whitespace-nowrap tabular-nums", tachado)}
                      >
                        {parte(v.pago_transferencia)}
                      </TableCell>
                      <TableCell
                        data-label="Total"
                        className={cn(
                          "text-right font-medium whitespace-nowrap tabular-nums",
                          tachado,
                        )}
                      >
                        {formatearMoneda(v.precio)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {ventas.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={ventas.isFetchingNextPage}
              onClick={() => void ventas.fetchNextPage()}
            >
              {ventas.isFetchingNextPage ? "Cargando…" : "Ver más ventas"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
