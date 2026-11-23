import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { Label } from "@/compartido/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import {
  useResumenImpuestos,
  useTurnosDelPeriodo,
  type FilaResumenImpuestos,
} from "../api/consultas";
import {
  aniosDisponibles,
  NOMBRES_MESES,
  nombreDePeriodo,
  periodoActual,
  rangoDePeriodo,
  type Periodo,
} from "../lib/periodo";

const TODO_EL_ANIO = "todo";
const TODOS_LOS_TURNOS = "todos";

function Totales({ fila }: { fila: FilaResumenImpuestos }) {
  const datos: [string, string][] = [
    ["Total", formatearMoneda(fila.total)],
    ["Efectivo", formatearMoneda(fila.total_efectivo)],
    ["Transferencia", formatearMoneda(fila.total_transferencia)],
    ["Tarjeta", formatearMoneda(fila.total_tarjeta)],
    ["Ventas alcanzadas", formatearNumero(fila.cantidad_ventas)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
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

  function cambiarPeriodo(nuevo: Periodo) {
    setPeriodo(nuevo);
    setTurnoId(null);
  }

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

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="impuestos-anio">Año</Label>
          <Select
            value={String(periodo.anio)}
            onValueChange={(valor) => {
              cambiarPeriodo({ ...periodo, anio: Number(valor) });
            }}
          >
            <SelectTrigger id="impuestos-anio" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aniosDisponibles().map((anio) => (
                <SelectItem key={anio} value={String(anio)}>
                  {anio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="impuestos-mes">Mes</Label>
          <Select
            value={periodo.mes === null ? TODO_EL_ANIO : String(periodo.mes)}
            onValueChange={(valor) => {
              cambiarPeriodo({ ...periodo, mes: valor === TODO_EL_ANIO ? null : Number(valor) });
            }}
          >
            <SelectTrigger id="impuestos-mes" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODO_EL_ANIO}>Todo el año</SelectItem>
              {NOMBRES_MESES.map((nombre, i) => (
                <SelectItem key={nombre} value={String(i + 1)}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="impuestos-turno">Turno</Label>
          <Select
            value={turnoId === null ? TODOS_LOS_TURNOS : String(turnoId)}
            disabled={!turnos.data}
            onValueChange={(valor) => {
              setTurnoId(valor === TODOS_LOS_TURNOS ? null : Number(valor));
            }}
          >
            <SelectTrigger id="impuestos-turno" className="w-72 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_TURNOS}>Todos los turnos</SelectItem>
              {turnos.data?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.caja_nombre} · {formatearFechaHora(t.abierto_en)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {turnos.isSuccess && turnos.data.length === 0 && (
        <p className="text-xs text-muted-foreground">No se abrió ningún turno en ese período.</p>
      )}

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
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Impuesto</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Transferencia</TableHead>
                    <TableHead className="text-right">Tarjeta</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumen.data.porImpuesto.map((fila) => (
                    <TableRow key={fila.id} data-testid={`reporte-impuesto-${fila.nombre}`}>
                      <TableCell className="font-medium">{fila.nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearNumero(fila.cantidad_ventas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearMoneda(fila.total_efectivo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearMoneda(fila.total_transferencia)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearMoneda(fila.total_tarjeta)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
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
