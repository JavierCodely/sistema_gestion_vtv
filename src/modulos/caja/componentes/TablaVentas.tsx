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
 * cada venta; el precio es lo cobrado.
 * `acciones` agrega una columna por venta (ej. anular, en la pantalla del admin).
 */
export function TablaVentas({
  ventas,
  acciones,
}: {
  ventas: Venta[];
  acciones?: (venta: Venta) => ReactNode;
}) {
  if (ventas.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-muted-foreground">
        Todavía no hay ventas en este turno.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Vendió</TableHead>
            <TableHead>Servicio</TableHead>
            <TableHead>Patente</TableHead>
            <TableHead>Medio</TableHead>
            <TableHead>Descuento</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead>Estado</TableHead>
            {acciones && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ventas.map((venta) => {
            const tachada = cn(venta.anulada && "text-muted-foreground line-through");
            return (
              <TableRow key={venta.id} data-testid={`venta-${String(venta.id)}`}>
                <TableCell className="tabular-nums">{venta.id}</TableCell>
                <TableCell className={cn("whitespace-nowrap", tachada)}>
                  {formatearFechaHora(venta.creado_en)}
                </TableCell>
                <TableCell className={tachada}>
                  <NombreUsuario usuarioId={venta.usuario_id} />
                </TableCell>
                <TableCell className={tachada}>{venta.servicio_nombre}</TableCell>
                <TableCell className={tachada}>{venta.patente ?? "—"}</TableCell>
                <TableCell className={tachada}>
                  <MedioDeVenta venta={venta} />
                </TableCell>
                <TableCell className={tachada}>
                  <DescuentoDeVenta venta={venta} />
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", tachada)}>
                  {formatearMoneda(venta.precio)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {venta.anulada && <Badge variant="destructive">Anulada</Badge>}
                    {venta.sin_stock && <Badge variant="outline">Sin certificado</Badge>}
                    {venta.vuelta_de !== null && (
                      <Badge variant="secondary">Vuelta de condicional</Badge>
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
                </TableCell>
                {acciones && <TableCell className="text-right">{acciones(venta)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
