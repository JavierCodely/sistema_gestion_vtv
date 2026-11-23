import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
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
import { useCertificado, useMovimientos, type Movimiento } from "../api/consultas";
import { BadgeSemaforo } from "../componentes/BadgeSemaforo";
import { describirPresentacion } from "../lib/validaciones";

const TIPOS: Record<Movimiento["tipo"], string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste: "Ajuste",
  anulacion_compra: "Compra corregida",
};

function detalle(m: Movimiento): string {
  if (m.tipo === "venta" && m.venta_id !== null) return `Venta N° ${String(m.venta_id)}`;
  if (m.tipo === "anulacion_compra" && m.compra_id !== null) {
    return `Anula la compra #${String(m.compra_id)}: ${m.nota ?? ""}`;
  }
  return m.nota ?? "—";
}

function Volver() {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to="/admin/certificados">
        <ArrowLeft aria-hidden />
        Volver a certificados
      </Link>
    </Button>
  );
}

/** Kardex de un certificado: cada entrada y salida de hojas con su costo y el stock resultante. */
export function MovimientosCertificado() {
  const id = Number(useParams().id);
  const idValido = Number.isInteger(id) && id > 0;
  const certificado = useCertificado(idValido ? id : 0);
  const movimientos = useMovimientos(idValido ? id : 0);

  if (!idValido || (certificado.isSuccess && certificado.data === null)) {
    return (
      <section className="flex flex-col gap-4">
        <Volver />
        <p className="text-muted-foreground">El certificado no existe.</p>
      </section>
    );
  }

  const error = certificado.error ?? movimientos.error;
  const filas = movimientos.data?.pages.flat() ?? [];

  return (
    <section className="flex flex-col gap-4">
      <Volver />
      {certificado.isPending || movimientos.isPending ? (
        <Cargando texto="Cargando movimientos…" />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          {certificado.data && (
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Movimientos de {certificado.data.nombre}</h1>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {describirPresentacion(
                  certificado.data.unidad_compra,
                  certificado.data.hojas_por_unidad,
                )}{" "}
                · {certificado.data.aplica_a} · stock{" "}
                <span data-testid="stock-actual">
                  {formatearNumero(certificado.data.stock_hojas)}
                </span>{" "}
                hojas · costo promedio {formatearMoneda(certificado.data.costo_promedio)}
                <BadgeSemaforo semaforo={certificado.data.semaforo} />
              </p>
            </div>
          )}

          {filas.length === 0 ? (
            <p className="rounded-md border p-6 text-center text-muted-foreground">
              Todavía no hay movimientos.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Hojas</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Costo por hoja</TableHead>
                    <TableHead className="text-right">Costo total</TableHead>
                    <TableHead className="text-right">Costo promedio</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((m) => (
                    <TableRow key={m.id} data-testid={`movimiento-${String(m.id)}`}>
                      <TableCell className="whitespace-nowrap">
                        {formatearFechaHora(m.creado_en)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.tipo === "anulacion_compra"
                              ? "destructive"
                              : m.tipo === "ajuste"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {TIPOS[m.tipo]}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${m.hojas < 0 ? "text-destructive" : ""}`}
                      >
                        {m.hojas > 0 ? "+" : ""}
                        {formatearNumero(m.hojas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearNumero(m.stock_resultante)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearMoneda(m.costo_unitario)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearMoneda(m.costo_total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatearMoneda(m.costo_promedio_resultante)}
                      </TableCell>
                      <TableCell>{detalle(m)}</TableCell>
                      <TableCell>{m.perfiles?.nombre_completo ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {movimientos.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={movimientos.isFetchingNextPage}
              onClick={() => void movimientos.fetchNextPage()}
            >
              {movimientos.isFetchingNextPage ? "Cargando…" : "Ver más movimientos"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
