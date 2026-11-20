import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { useCompras } from "../api/consultas";

const FUENTES = { efectivo: "Efectivo", transferencia: "Transferencia" } as const;

export function TablaCompras() {
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
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Certificado</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Hojas</TableHead>
              <TableHead className="text-right">Costo por unidad</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Registró</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((compra) => (
              <TableRow key={compra.id} data-testid={`compra-${String(compra.id)}`}>
                <TableCell className="whitespace-nowrap">
                  {formatearFechaHora(compra.creado_en)}
                </TableCell>
                <TableCell>{compra.certificados?.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearNumero(compra.unidades)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearNumero(compra.hojas)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearMoneda(compra.costo_unidad)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearMoneda(compra.costo_total)}
                </TableCell>
                <TableCell>{FUENTES[compra.fuente]}</TableCell>
                <TableCell>{compra.proveedor ?? "—"}</TableCell>
                <TableCell>{compra.perfiles?.nombre ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
