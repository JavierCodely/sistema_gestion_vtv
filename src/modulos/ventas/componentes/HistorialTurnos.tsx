import { useState } from "react";
import { Link } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { SelectorRango } from "@/compartido/componentes/SelectorRango";
import { mensajeDeError } from "@/compartido/lib/errores";
import {
  formatearDia,
  formatearFechaHora,
  formatearLista,
  formatearMoneda,
  formatearNumero,
} from "@/compartido/lib/formato";
import { mesActual, revisarRango, type RangoFechas } from "@/compartido/lib/rango-fechas";
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
import { useResumenTurnos, useTurnos } from "../api/consultas";
import { TotalesVentas } from "./TotalesVentas";

/** Totales de los turnos abiertos en el rango: los suma la BD (`resumen_turnos`). */
function ResumenDelRango({ rango }: { rango: RangoFechas }) {
  const resumen = useResumenTurnos(rango);
  if (resumen.isPending) return <Cargando texto="Calculando totales…" />;
  if (resumen.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
      </Alert>
    );
  }
  const r = resumen.data;
  if (!r) return null;
  const periodo =
    rango.desde === rango.hasta
      ? `del ${formatearDia(rango.desde)}`
      : `del ${formatearDia(rango.desde)} al ${formatearDia(rango.hasta)}`;
  return (
    <TotalesVentas
      titulo={`Totales de los turnos abiertos ${periodo}: ${formatearNumero(r.cantidad_turnos)} turnos (${formatearNumero(r.turnos_abiertos)} abiertos), ${formatearNumero(r.ventas_cantidad)} ventas, sin anuladas`}
      valores={r}
      prefijoTestId="rango"
    />
  );
}

function TablaTurnos({ rango }: { rango: RangoFechas }) {
  const turnos = useTurnos(rango);
  return (
    <>
      {turnos.isPending ? (
        <Cargando texto="Cargando turnos…" />
      ) : turnos.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(turnos.error)}</AlertDescription>
        </Alert>
      ) : turnos.data.pages.flat().length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          No se abrió ningún turno en esas fechas.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="md:overflow-x-auto md:rounded-md md:border">
            <Table apilada="grilla">
              <TableHeader>
                <TableRow>
                  <TableHead>Caja</TableHead>
                  <TableHead>Atendieron</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Abrió</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Efectivo</TableHead>
                  <TableHead className="text-right">Transferencia</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Efectivo en caja</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnos.data.pages.flat().map((t) => (
                  <TableRow key={t.id} data-testid={`turno-${String(t.id)}`}>
                    <TableCell
                      data-label="Caja"
                      className="font-medium max-md:col-span-2 max-md:text-base"
                    >
                      {t.caja_nombre}
                    </TableCell>
                    <TableCell data-label="Atendieron" className="max-md:col-span-2">
                      {t.atendido_por && t.atendido_por.length > 0
                        ? formatearLista(t.atendido_por)
                        : "—"}
                    </TableCell>
                    <TableCell data-label="Apertura" className="whitespace-nowrap">
                      {formatearFechaHora(t.abierto_en)}
                    </TableCell>
                    <TableCell data-label="Abrió">{t.abierto_por_nombre ?? "—"}</TableCell>
                    <TableCell data-label="Estado">
                      {t.abierto ? (
                        <Badge>Abierto</Badge>
                      ) : (
                        <Badge variant="secondary">Cerrado</Badge>
                      )}
                    </TableCell>
                    <TableCell data-label="Ventas" className="text-right tabular-nums">
                      {formatearNumero(t.ventas_cantidad ?? 0)}
                    </TableCell>
                    <TableCell data-label="Efectivo" className="text-right tabular-nums">
                      {formatearMoneda(t.ventas_efectivo)}
                    </TableCell>
                    <TableCell data-label="Transferencia" className="text-right tabular-nums">
                      {formatearMoneda(t.ventas_transferencia)}
                    </TableCell>
                    <TableCell
                      data-label="Total"
                      className="text-right font-medium tabular-nums max-md:text-base"
                    >
                      {formatearMoneda(t.ventas_total)}
                    </TableCell>
                    <TableCell data-label="Gastos" className="text-right tabular-nums">
                      {formatearMoneda(t.gastos_total)}
                    </TableCell>
                    <TableCell data-label="Neto" className="text-right font-medium tabular-nums">
                      {formatearMoneda(t.neto)}
                    </TableCell>
                    <TableCell data-label="Efectivo en caja" className="text-right tabular-nums">
                      {t.efectivo_en_caja === null ? "—" : formatearMoneda(t.efectivo_en_caja)}
                    </TableCell>
                    <TableCell data-acciones="" className="text-right">
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
    </>
  );
}

/**
 * Historial de turnos filtrado por fecha de apertura (día de negocio, hora AR; por defecto el mes
 * actual), con los totales del período y la lista con los totales de cada turno.
 */
export function HistorialTurnos() {
  const [valorRango, setValorRango] = useState(() => mesActual());
  const { rango, error } = revisarRango(valorRango);

  return (
    <section aria-labelledby="titulo-historial" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-historial" className="text-lg font-semibold">
            Historial de turnos
          </h2>
          <p className="text-sm text-muted-foreground">Filtrá por fecha de apertura del turno.</p>
        </div>
        <SelectorRango id="turnos-apertura" valor={valorRango} onCambiar={setValorRango} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !rango ? (
        <p className="text-sm text-muted-foreground">Elegí las dos fechas del período.</p>
      ) : (
        <>
          <ResumenDelRango rango={rango} />
          <TablaTurnos rango={rango} />
        </>
      )}
    </section>
  );
}
