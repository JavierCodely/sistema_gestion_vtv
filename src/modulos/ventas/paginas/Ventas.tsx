import { Link } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
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
import { useTurnos } from "../api/consultas";

/** Turnos con sus totales (calculados por la BD; los anulados no suman). */
export function Ventas() {
  const turnos = useTurnos();

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Turnos de caja con sus totales por medio de pago, gastos y neto. Entrá a un turno para ver
          sus ventas, anular una o cerrarlo.
        </p>
      </div>

      {turnos.isPending ? (
        <Cargando texto="Cargando turnos…" />
      ) : turnos.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(turnos.error)}</AlertDescription>
        </Alert>
      ) : turnos.data.pages.flat().length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no se abrió ningún turno.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caja</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Efectivo</TableHead>
                  <TableHead className="text-right">Transferencia</TableHead>
                  <TableHead className="text-right">Tarjeta</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnos.data.pages.flat().map((t) => (
                  <TableRow key={t.id} data-testid={`turno-${String(t.id)}`}>
                    <TableCell className="font-medium">{t.caja_nombre}</TableCell>
                    <TableCell>{t.usuario_nombre ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatearFechaHora(t.abierto_en)}
                    </TableCell>
                    <TableCell>
                      {t.abierto ? (
                        <Badge>Abierto</Badge>
                      ) : (
                        <Badge variant="secondary">Cerrado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearNumero(t.ventas_cantidad ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearMoneda(t.ventas_efectivo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearMoneda(t.ventas_transferencia)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearMoneda(t.ventas_tarjeta)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatearMoneda(t.ventas_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatearMoneda(t.gastos_total)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatearMoneda(t.neto)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`turnos/${String(t.id)}`}
                          aria-label={`Ver turno de ${t.caja_nombre} del ${formatearFechaHora(t.abierto_en)}`}
                        >
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {turnos.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={turnos.isFetchingNextPage}
              onClick={() => void turnos.fetchNextPage()}
            >
              {turnos.isFetchingNextPage ? "Cargando…" : "Ver más turnos"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
