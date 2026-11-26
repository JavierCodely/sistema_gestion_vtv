import { Pencil } from "lucide-react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
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
import { useCompras, type Compra } from "../api/consultas";

const FUENTES = { efectivo: "Efectivo", transferencia: "Transferencia" } as const;

/**
 * Historial de compras. Solo la última compra de cada certificado (sin ventas ni ajustes
 * posteriores) se puede editar: lo decide la BD (`editable`).
 */
export function TablaCompras({ onEditar }: { onEditar: (compra: Compra) => void }) {
  const compras = useCompras();

  if (compras.isPending) return <Cargando texto="Cargando compras…" />;
  if (compras.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(compras.error)}</AlertDescription>
      </Alert>
    );
  }

  const filas = compras.data.pages.flat();
  if (filas.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-muted-foreground">
        Todavía no se registraron compras.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="md:overflow-x-auto md:rounded-md md:border">
        <Table apilada>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Certificado</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Hojas</TableHead>
              <TableHead className="text-right">Costo por unidad</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Registró</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((compra) => {
              const tachada = cn(
                compra.anulada && "text-muted-foreground line-through max-md:no-underline",
              );
              return (
                <TableRow key={compra.id} data-testid={`compra-${String(compra.id)}`}>
                  <TableCell data-label="N°" className="tabular-nums">
                    #{compra.id}
                  </TableCell>
                  <TableCell data-label="Fecha" className={cn("whitespace-nowrap", tachada)}>
                    {formatearFechaHora(compra.creado_en)}
                  </TableCell>
                  <TableCell data-label="Certificado">
                    <div className={tachada}>{compra.certificado}</div>
                    {compra.anulada && (
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <Badge variant="outline">Corregida</Badge>
                        {compra.reemplazada_por !== null &&
                          `por la #${String(compra.reemplazada_por)}`}
                        {compra.anulada_motivo && ` · ${compra.anulada_motivo}`}
                        {compra.anulada_por && ` · ${compra.anulada_por}`}
                      </div>
                    )}
                  </TableCell>
                  <TableCell
                    data-label="Unidades"
                    className={cn("text-right tabular-nums", tachada)}
                  >
                    {formatearNumero(compra.unidades)}
                  </TableCell>
                  <TableCell data-label="Hojas" className={cn("text-right tabular-nums", tachada)}>
                    {formatearNumero(compra.hojas)}
                  </TableCell>
                  <TableCell
                    data-label="Costo por unidad"
                    className={cn("text-right tabular-nums", tachada)}
                  >
                    {formatearMoneda(compra.costo_unidad)}
                  </TableCell>
                  <TableCell data-label="Total" className={cn("text-right tabular-nums", tachada)}>
                    {formatearMoneda(compra.costo_total)}
                  </TableCell>
                  <TableCell data-label="Pago" className={tachada}>
                    {FUENTES[compra.fuente]}
                  </TableCell>
                  <TableCell data-label="Proveedor" className={tachada}>
                    {compra.proveedor ?? "—"}
                  </TableCell>
                  <TableCell data-label="Registró">{compra.usuario}</TableCell>
                  <TableCell data-acciones="" className="text-right">
                    {compra.editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar compra #${String(compra.id)}`}
                        onClick={() => {
                          onEditar(compra);
                        }}
                      >
                        <Pencil aria-hidden />
                        Editar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Se puede editar la última compra de cada certificado mientras no haya ventas ni ajustes
        posteriores. Si ya los hubo, corregí la diferencia con un ajuste de stock.
      </p>
      {compras.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={compras.isFetchingNextPage}
          onClick={() => void compras.fetchNextPage()}
        >
          {compras.isFetchingNextPage ? "Cargando…" : "Ver más compras"}
        </Button>
      )}
    </div>
  );
}
