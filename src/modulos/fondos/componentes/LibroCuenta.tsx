import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearDia, formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
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
import { useLibroFondos } from "../api/consultas";
import { esReverso, NOMBRE_CUENTA, nombreOrigen, type Cuenta } from "../lib/fondos";
import { MontoConSigno } from "./MontoConSigno";

/**
 * Libro de una cuenta en el rango elegido (`v_movimientos_fondos`), del más nuevo al más viejo, con
 * "Ver más". Ingresos en verde, egresos en rojo; los reversos de anulaciones y las ventas mixtas se
 * marcan. En efectivo muestra además el saldo de la caja de cambio después de cada movimiento.
 */
export function LibroCuenta({ cuenta, rango }: { cuenta: Cuenta; rango: RangoFechas }) {
  const libro = useLibroFondos(cuenta, rango);
  const conSaldo = cuenta === "efectivo";
  const idTitulo = `titulo-libro-${cuenta}`;
  const periodo = `Del ${formatearDia(rango.desde)} al ${formatearDia(rango.hasta)}`;

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <div>
        <h3 id={idTitulo} className="text-lg font-semibold">
          Movimientos de {NOMBRE_CUENTA[cuenta]}
        </h3>
        <p className="text-sm text-muted-foreground" data-testid={`periodo-libro-${cuenta}`}>
          {periodo}
        </p>
      </div>
      {libro.isPending ? (
        <Cargando texto="Cargando movimientos…" />
      ) : libro.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(libro.error)}</AlertDescription>
        </Alert>
      ) : libro.data.pages.flat().length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          No hay movimientos en este período.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  {conSaldo && <TableHead className="text-right">Saldo</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {libro.data.pages.flat().map((m) => (
                  <TableRow key={m.clave} data-testid={`movimiento-${m.clave}`}>
                    <TableCell className="whitespace-nowrap">
                      {formatearFechaHora(m.fecha)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="whitespace-nowrap">{nombreOrigen(m.origen)}</span>
                        {esReverso(m.origen) && <Badge variant="outline">Reverso</Badge>}
                        {m.pago_mixto && <Badge variant="secondary">Mixto</Badge>}
                        {m.venta_pasada && <Badge variant="outline">Fecha pasada</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs break-words">
                      <p>{m.descripcion ?? "—"}</p>
                      {m.nota && <p className="text-xs text-muted-foreground">{m.nota}</p>}
                    </TableCell>
                    <TableCell>{m.caja_nombre ?? "—"}</TableCell>
                    <TableCell>{m.usuario_nombre ?? "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <MontoConSigno monto={m.monto} />
                    </TableCell>
                    {conSaldo && (
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {m.saldo_resultante === null ? "—" : formatearMoneda(m.saldo_resultante)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {libro.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={libro.isFetchingNextPage}
              onClick={() => void libro.fetchNextPage()}
            >
              {libro.isFetchingNextPage ? "Cargando…" : "Ver más movimientos"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
