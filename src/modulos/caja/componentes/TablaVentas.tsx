import type { ReactNode } from "react";
import { formatearDia, formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Badge } from "@/compartido/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import type { Venta } from "../api/consultas";
import { DescuentoDeVenta } from "./DescuentoDeVenta";
import { MedioDeVenta } from "./MedioDeVenta";
import { NombreUsuario } from "./NombreUsuario";

/**
 * Ventas de un turno, de todos los que vendieron en la caja, sin totales (el cajero no los ve; el admin
 * los lee de `v_turnos`). Muestra quién vendió, el medio ("Mixto" con su detalle) y el descuento de
 * cada venta y el certificado entregado (marcado si es condicional); el precio es lo cobrado. En Estado,
 * lo que se hizo con una condicional: vuelta (en plazo o fuera de plazo) o vencida cobrada de nuevo.
 * `acciones` agrega una columna por venta (ej. facturar o anular). Una anulada muestra el motivo y
 * quién la anuló.
 */
export function TablaVentas({
  ventas,
  acciones,
  vacio = "Todavía no hay ventas en este turno.",
}: {
  ventas: Venta[];
  acciones?: (venta: Venta) => ReactNode;
  /** Texto sin ventas (ej. ninguna con la patente buscada). */
  vacio?: string;
}) {
  if (ventas.length === 0) {
    return <p className="rounded-md border p-6 text-center text-muted-foreground">{vacio}</p>;
  }

  return (
    <div className="md:overflow-x-auto md:rounded-md md:border">
      <Table apilada>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Vendió</TableHead>
            <TableHead>Servicio</TableHead>
            <TableHead>Patente</TableHead>
            <TableHead>Certificado</TableHead>
            <TableHead>Medio</TableHead>
            <TableHead>Descuento</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead>Estado</TableHead>
            {acciones && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ventas.map((venta) => {
            const tachada = cn(
              venta.anulada && "text-muted-foreground line-through max-md:no-underline",
            );
            const conEstado =
              venta.anulada ||
              venta.sin_stock ||
              venta.vuelta_de !== null ||
              venta.condicional_vencida_de !== null ||
              venta.condicional_vence !== null ||
              (venta.condicional_saldo ?? 0) > 0;
            return (
              <TableRow key={venta.id} data-testid={`venta-${String(venta.id)}`}>
                {/* En el celular cada venta es una tarjeta: arriba el número y la hora; la patente y
                    el precio, más grandes. Las celdas sin dato no se muestran. */}
                <TableCell data-label="Venta N°" className="tabular-nums max-md:font-semibold">
                  {venta.id}
                </TableCell>
                <TableCell data-label="Hora" className={cn("whitespace-nowrap", tachada)}>
                  {formatearFechaHora(venta.creado_en)}
                </TableCell>
                <TableCell data-label="Vendió" className={tachada}>
                  <NombreUsuario usuarioId={venta.usuario_id} />
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
                <TableCell
                  data-label="Certificado"
                  className={cn(tachada, !venta.certificados && "max-md:hidden!")}
                >
                  {venta.certificados ? (
                    <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
                      <span>{venta.certificados.nombre}</span>
                      {venta.certificados.condicional && (
                        <Badge variant="outline">Condicional</Badge>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell data-label="Medio" className={tachada}>
                  <div>
                    <MedioDeVenta venta={venta} />
                  </div>
                </TableCell>
                <TableCell
                  data-label="Descuento"
                  className={cn(tachada, venta.descuento_nombre === null && "max-md:hidden!")}
                >
                  <div>
                    <DescuentoDeVenta venta={venta} />
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
                <TableCell data-label="Estado" className={cn(!conEstado && "max-md:hidden!")}>
                  <div className="flex flex-col items-end gap-1 md:items-start">
                    <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
                      {venta.anulada && <Badge variant="destructive">Anulada</Badge>}
                      {venta.sin_stock && <Badge variant="outline">Sin certificado</Badge>}
                      {venta.vuelta_de !== null && (
                        <Badge variant="secondary">
                          {venta.vuelta_fuera_de_plazo
                            ? "Vuelta de condicional fuera de plazo"
                            : "Vuelta de condicional"}
                        </Badge>
                      )}
                      {venta.condicional_vencida_de !== null && (
                        <Badge variant="outline">Condicional vencida: se cobró de nuevo</Badge>
                      )}
                      {venta.condicional_vence !== null && (
                        <Badge variant="outline">
                          Condicional hasta {formatearDia(venta.condicional_vence)}
                        </Badge>
                      )}
                      {(venta.condicional_saldo ?? 0) > 0 && (
                        <Badge variant="outline">
                          Al 50%: al volver paga {formatearMoneda(venta.condicional_saldo ?? 0)}
                        </Badge>
                      )}
                    </div>
                    {venta.anulada && venta.anulada_motivo && (
                      <div className="text-xs text-muted-foreground">{venta.anulada_motivo}</div>
                    )}
                    {venta.anulada && venta.anulada_por && (
                      <div className="text-xs text-muted-foreground">
                        Anuló: <NombreUsuario usuarioId={venta.anulada_por} />
                      </div>
                    )}
                  </div>
                </TableCell>
                {acciones && (
                  <TableCell data-acciones="" className="text-right">
                    {acciones(venta)}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
