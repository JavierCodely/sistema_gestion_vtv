import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { FiltroPeriodo } from "@/compartido/componentes/FiltroPeriodo";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import {
  nombreDePeriodo,
  periodoActual,
  rangoDePeriodo,
  type Periodo,
} from "@/compartido/lib/periodo";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { useTurnosDelPeriodo } from "@/modulos/ventas/api/consultas";
import { useResumenImpuestos, type FilaResumenImpuestos } from "../api/consultas";

function Totales({ fila }: { fila: FilaResumenImpuestos }) {
  const datos: [string, string][] = [
    ["Total", formatearMoneda(fila.total)],
    ["Efectivo", formatearMoneda(fila.total_efectivo)],
    ["Transferencia", formatearMoneda(fila.total_transferencia)],
    ["Ventas alcanzadas", formatearNumero(fila.cantidad_ventas)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
      {datos.map(([etiqueta, valor]) => (
        <div key={etiqueta}>
          <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
          <dd className="font-medium tabular-nums" data-testid={`impuestos-${etiqueta}`}>
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Reporte de impuestos: período por año (todo el año) o mes y año, y opcionalmente un turno abierto
 * en ese período. Totales y montos por medio de pago calculados por la BD (`resumen_impuestos`).
 */
export function ReporteImpuestos() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoActual());
  const [turnoId, setTurnoId] = useState<number | null>(null);
  const rango = rangoDePeriodo(periodo);
  const turnos = useTurnosDelPeriodo(rango);
  const resumen = useResumenImpuestos({ rango, turnoId });

  const turnoElegido = turnos.data?.find((t) => t.id === turnoId);
  const titulo = turnoElegido
    ? `Turno de ${turnoElegido.caja_nombre} (${formatearFechaHora(turnoElegido.abierto_en)})`
    : nombreDePeriodo(periodo);

  return (
    <section aria-labelledby="titulo-reporte-impuestos" className="flex flex-col gap-4">
      <div>
        <h2 id="titulo-reporte-impuestos" className="text-lg font-semibold">
          Reporte
        </h2>
        <p className="text-sm text-muted-foreground">
          Cuánto corresponde a cada impuesto, por medio de pago. Sin ventas anuladas.
        </p>
      </div>

      <FiltroPeriodo
        idBase="impuestos"
        periodo={periodo}
        onPeriodo={setPeriodo}
        turnoId={turnoId}
        onTurno={setTurnoId}
        turnos={turnos.data?.map((t) => ({
          id: t.id,
          etiqueta: `${t.caja_nombre} · ${formatearFechaHora(t.abierto_en)}`,
        }))}
      />

      {resumen.isPending ? (
        <Cargando texto="Calculando impuestos…" />
      ) : resumen.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>{titulo}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>{resumen.data.total && <Totales fila={resumen.data.total} />}</CardContent>
          </Card>
          {resumen.data.porImpuesto.length === 0 ? (
            <p className="rounded-md border p-6 text-center text-muted-foreground">
              No hay impuestos aplicados en ese período.
            </p>
          ) : (
            <div className="md:overflow-x-auto md:rounded-md md:border">
              <Table apilada>
                <TableHeader>
                  <TableRow>
                    <TableHead>Impuesto</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Transferencia</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumen.data.porImpuesto.map((fila) => (
                    <TableRow key={fila.id} data-testid={`reporte-impuesto-${fila.nombre}`}>
                      <TableCell data-label="Impuesto" className="font-medium">
                        {fila.nombre}
                      </TableCell>
                      <TableCell data-label="Ventas" className="text-right tabular-nums">
                        {formatearNumero(fila.cantidad_ventas)}
                      </TableCell>
                      <TableCell data-label="Efectivo" className="text-right tabular-nums">
                        {formatearMoneda(fila.total_efectivo)}
                      </TableCell>
                      <TableCell data-label="Transferencia" className="text-right tabular-nums">
                        {formatearMoneda(fila.total_transferencia)}
                      </TableCell>
                      <TableCell data-label="Total" className="text-right font-medium tabular-nums">
                        {formatearMoneda(fila.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
