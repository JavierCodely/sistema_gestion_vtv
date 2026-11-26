import { ArrowLeft, Ban, CalendarPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
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
import { MedioDeVenta } from "@/modulos/caja/componentes/MedioDeVenta";
import { useVentasPasadas, type VentaPasada } from "../api/consultas";
import { DialogoAnularVenta } from "@/modulos/caja/componentes/DialogoAnularVenta";
import { DialogoVentaPasada } from "../componentes/DialogoVentaPasada";

/** Ventas cargadas con fecha pasada (sin turno): carga y anulación. Solo admin. */
export function VentasPasadas() {
  const ventas = useVentasPasadas();
  const [cargando, setCargando] = useState(false);
  const [anulando, setAnulando] = useState<VentaPasada | null>(null);

  const filas = ventas.data?.pages.flat() ?? [];

  return (
    <section className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/admin/ventas">
          <ArrowLeft aria-hidden />
          Volver a ventas
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Ventas con fecha pasada</h1>
          <p className="text-sm text-muted-foreground">
            Ventas que no se registraron en un turno. Cuentan en los reportes del día elegido, no
            descuentan hojas de certificado y no se facturan. Las de efectivo entran a la caja de
            cambio al cargarlas.
          </p>
        </div>
        <Button
          onClick={() => {
            setCargando(true);
          }}
        >
          <CalendarPlus aria-hidden />
          Cargar venta
        </Button>
      </div>
      {cargando && (
        <DialogoVentaPasada
          onCerrar={() => {
            setCargando(false);
          }}
        />
      )}
      {anulando && (
        <DialogoAnularVenta
          venta={anulando}
          onCerrar={() => {
            setAnulando(null);
          }}
        />
      )}

      {ventas.isPending ? (
        <Cargando texto="Cargando ventas…" />
      ) : ventas.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(ventas.error)}</AlertDescription>
        </Alert>
      ) : filas.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          Todavía no se cargó ninguna venta con fecha pasada.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="md:overflow-x-auto md:rounded-md md:border">
            <Table apilada>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Patente</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Cargada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((venta) => {
                  const tachada = cn(
                    venta.anulada && "text-muted-foreground line-through max-md:no-underline",
                  );
                  return (
                    <TableRow key={venta.id} data-testid={`venta-pasada-${String(venta.id)}`}>
                      <TableCell
                        data-label="Venta N°"
                        className="tabular-nums max-md:font-semibold"
                      >
                        {venta.id}
                      </TableCell>
                      <TableCell data-label="Fecha" className={cn("whitespace-nowrap", tachada)}>
                        {formatearFechaHora(venta.creado_en)}
                      </TableCell>
                      <TableCell data-label="Caja" className={tachada}>
                        {venta.cajas?.nombre ?? "—"}
                      </TableCell>
                      <TableCell data-label="Servicio" className={tachada}>
                        {venta.servicio_nombre}
                      </TableCell>
                      <TableCell
                        data-label="Patente"
                        className={cn("max-md:text-base max-md:font-semibold", tachada)}
                      >
                        {venta.patente ?? "—"}
                      </TableCell>
                      <TableCell data-label="Medio" className={tachada}>
                        <div>
                          <MedioDeVenta venta={venta} />
                        </div>
                      </TableCell>
                      <TableCell
                        data-label="Precio"
                        className={cn(
                          "text-right tabular-nums max-md:text-base max-md:font-semibold",
                          tachada,
                        )}
                      >
                        {formatearMoneda(venta.precio)}
                      </TableCell>
                      <TableCell
                        data-label="Cargada"
                        className="whitespace-nowrap text-muted-foreground"
                      >
                        {venta.cargada_en ? formatearFechaHora(venta.cargada_en) : "—"}
                      </TableCell>
                      <TableCell
                        data-label="Estado"
                        className={cn(!venta.anulada && "max-md:hidden!")}
                      >
                        <div className="flex flex-col items-end gap-1 md:items-start">
                          {venta.anulada && <Badge variant="destructive">Anulada</Badge>}
                          {venta.anulada && venta.anulada_motivo && (
                            <div className="text-xs text-muted-foreground">
                              {venta.anulada_motivo}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        data-acciones=""
                        className={cn("text-right", venta.anulada && "max-md:hidden!")}
                      >
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
        </div>
      )}
    </section>
  );
}
