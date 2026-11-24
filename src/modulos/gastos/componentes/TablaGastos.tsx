import type { ReactNode } from "react";
import { formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
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
import { FUENTES, type FuenteFondos, type Gasto } from "../api/consultas";

function nombreFuente(medio: string | null): string {
  return medio && medio in FUENTES ? FUENTES[medio as FuenteFondos] : "—";
}

/**
 * Lista de gastos, sin totales (el cajero no los ve). `conUsuario` agrega quién lo cargó (los gastos
 * de una caja compartida); `completo`, quién y en qué caja (pantalla del admin); `acciones`, una
 * columna por gasto (ej. anular).
 */
export function TablaGastos({
  gastos,
  completo = false,
  conUsuario = completo,
  vacio,
  acciones,
}: {
  gastos: Gasto[];
  completo?: boolean;
  conUsuario?: boolean;
  vacio: string;
  acciones?: (gasto: Gasto) => ReactNode;
}) {
  if (gastos.length === 0) {
    return <p className="rounded-md border p-6 text-center text-muted-foreground">{vacio}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Nota</TableHead>
            <TableHead>Pagado con</TableHead>
            {conUsuario && <TableHead>Cargó</TableHead>}
            {completo && <TableHead>Caja</TableHead>}
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Estado</TableHead>
            {acciones && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {gastos.map((gasto) => {
            const tachado = cn(gasto.anulada && "text-muted-foreground line-through");
            return (
              <TableRow key={gasto.id} data-testid={`gasto-${String(gasto.id)}`}>
                <TableCell className={cn("whitespace-nowrap", tachado)}>
                  {gasto.fecha ? formatearFechaHora(gasto.fecha) : "—"}
                </TableCell>
                <TableCell className={tachado}>
                  {gasto.concepto}
                  {gasto.detalle && (
                    <div className="text-xs text-muted-foreground">{gasto.detalle}</div>
                  )}
                </TableCell>
                <TableCell className={cn("max-w-xs break-words", tachado)}>{gasto.nota}</TableCell>
                <TableCell className={tachado}>{nombreFuente(gasto.medio)}</TableCell>
                {conUsuario && (
                  <TableCell className={tachado}>{gasto.usuario_nombre ?? "—"}</TableCell>
                )}
                {completo && <TableCell className={tachado}>{gasto.caja_nombre ?? "—"}</TableCell>}
                <TableCell className={cn("text-right tabular-nums", tachado)}>
                  {formatearMoneda(Math.abs(gasto.monto ?? 0))}
                </TableCell>
                <TableCell>
                  {gasto.anulada &&
                    (gasto.reemplazado_por !== null ? (
                      <Badge variant="outline">Corregido</Badge>
                    ) : (
                      <Badge variant="destructive">Anulado</Badge>
                    ))}
                  {!gasto.anulada && gasto.corrige_a !== null && (
                    <Badge variant="secondary">Corrección</Badge>
                  )}
                  {gasto.anulada && gasto.motivo_anulacion && (
                    <div className="text-xs text-muted-foreground">{gasto.motivo_anulacion}</div>
                  )}
                </TableCell>
                {acciones && <TableCell className="text-right">{acciones(gasto)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
