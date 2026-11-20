import { ArrowLeft, Ban, LogOut } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { useVentasDeTurno, type Venta } from "@/modulos/caja/api/consultas";
import { DialogoCerrarTurno } from "@/modulos/caja/componentes/DialogoCerrarTurno";
import { TablaVentas } from "@/modulos/caja/componentes/TablaVentas";
import { useComprobantesDeTurno } from "@/modulos/facturacion/api/consultas";
import { FacturaDeVenta } from "@/modulos/facturacion/componentes/FacturaDeVenta";
import { useTurno, type Turno } from "../api/consultas";
import { DialogoAnularVenta } from "../componentes/DialogoAnularVenta";

function Volver() {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to="/admin/ventas">
        <ArrowLeft aria-hidden />
        Volver a ventas
      </Link>
    </Button>
  );
}

function Totales({ turno }: { turno: Turno }) {
  const filas: [string, number | null][] = [
    ["Efectivo", turno.ventas_efectivo],
    ["Transferencia", turno.ventas_transferencia],
    ["Tarjeta", turno.ventas_tarjeta],
    ["Total ventas", turno.ventas_total],
    ["Gastos", turno.gastos_total],
    ["Neto", turno.neto],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Totales ({formatearNumero(turno.ventas_cantidad ?? 0)} ventas, sin anuladas)</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
              <dd className="font-medium tabular-nums" data-testid={`total-${etiqueta}`}>
                {formatearMoneda(valor)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Un turno: totales, ventas (con anulación) y cierre si quedó abierto. Solo admin. */
export function DetalleTurno() {
  const id = Number(useParams().id);
  const idValido = Number.isInteger(id) && id > 0;
  const turno = useTurno(idValido ? id : 0);
  const ventas = useVentasDeTurno(idValido ? id : 0);
  const comprobantes = useComprobantesDeTurno(idValido ? id : 0);
  const [anulando, setAnulando] = useState<Venta | null>(null);
  const [cerrando, setCerrando] = useState(false);

  if (!idValido || (turno.isSuccess && turno.data === null)) {
    return (
      <section className="flex flex-col gap-4">
        <Volver />
        <p className="text-muted-foreground">El turno no existe.</p>
      </section>
    );
  }

  const error = turno.error ?? ventas.error ?? comprobantes.error;

  return (
    <section className="flex flex-col gap-4">
      <Volver />
      {turno.isPending || ventas.isPending || comprobantes.isPending ? (
        <Cargando texto="Cargando turno…" />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(error)}</AlertDescription>
        </Alert>
      ) : (
        turno.data &&
        ventas.data &&
        comprobantes.data && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
                  {turno.data.caja_nombre} · {turno.data.usuario_nombre ?? "—"}
                  {turno.data.abierto ? (
                    <Badge>Abierto</Badge>
                  ) : (
                    <Badge variant="secondary">Cerrado</Badge>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Apertura {formatearFechaHora(turno.data.abierto_en)}
                  {turno.data.cerrado_en &&
                    ` · cierre ${formatearFechaHora(turno.data.cerrado_en)}`}
                </p>
                {turno.data.observaciones && (
                  <p className="text-sm">Observaciones: {turno.data.observaciones}</p>
                )}
              </div>
              {turno.data.abierto && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCerrando(true);
                  }}
                >
                  <LogOut aria-hidden />
                  Cerrar turno
                </Button>
              )}
            </div>

            <Totales turno={turno.data} />

            <section aria-labelledby="titulo-ventas-turno" className="flex flex-col gap-3">
              <h2 id="titulo-ventas-turno" className="text-lg font-semibold">
                Ventas
              </h2>
              <TablaVentas
                ventas={ventas.data}
                acciones={(venta) => (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <FacturaDeVenta
                      venta={venta}
                      anulada={venta.anulada}
                      comprobantes={comprobantes.data.filter((c) => c.venta_id === venta.id)}
                      puedeEmitirNotas
                    />
                    {!venta.anulada && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Anular venta N° ${String(venta.id)}`}
                        onClick={() => {
                          setAnulando(venta);
                        }}
                      >
                        <Ban aria-hidden />
                        Anular
                      </Button>
                    )}
                  </div>
                )}
              />
            </section>

            {anulando && (
              <DialogoAnularVenta
                venta={anulando}
                onCerrar={() => {
                  setAnulando(null);
                }}
              />
            )}
            {cerrando && (
              <DialogoCerrarTurno
                turnoId={turno.data.id}
                descripcion={`${turno.data.caja_nombre}, turno de ${turno.data.usuario_nombre ?? "—"}. El cajero no va a poder registrar más ventas en este turno.`}
                onCerrar={() => {
                  setCerrando(false);
                }}
              />
            )}
          </>
        )
      )}
    </section>
  );
}
