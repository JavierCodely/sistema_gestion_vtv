import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import type { FilaResumenDescuentos } from "../api/consultas";

/** Ranking de `resumen_descuentos` (ya viene de mayor a menor total descontado). */
export function RankingDescuentos({
  titulo,
  columna,
  filas,
}: {
  titulo: string;
  /** Encabezado de la columna del nombre ("Descuento", "Servicio"). */
  columna: string;
  filas: FilaResumenDescuentos[];
}) {
  const id = `ranking-${columna.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id} className="font-semibold">
        {titulo}
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{columna}</TableHead>
              <TableHead className="text-right">Ventas</TableHead>
              <TableHead className="text-right">Total descontado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila, indice) => (
              <TableRow key={`${fila.agrupacion}-${String(fila.id)}`}>
                <TableCell className="text-muted-foreground tabular-nums">{indice + 1}</TableCell>
                <TableCell className="font-medium">{fila.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearNumero(fila.cantidad_ventas)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearMoneda(fila.total_descontado)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
