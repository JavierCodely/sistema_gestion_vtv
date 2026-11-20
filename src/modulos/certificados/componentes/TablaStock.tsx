import { History, Pencil, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { Button } from "@/compartido/ui/button";
import { Switch } from "@/compartido/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import {
  MENSAJES_ERROR_CERTIFICADO,
  useActualizarCertificado,
  type CertificadoConStock,
} from "../api/consultas";
import { describirPresentacion } from "../lib/validaciones";
import { BadgeSemaforo } from "./BadgeSemaforo";

export type AccionCertificado = "comprar" | "ajustar" | "editar";

export function TablaStock({
  certificados,
  onAccion,
}: {
  certificados: CertificadoConStock[];
  onAccion: (accion: AccionCertificado, certificado: CertificadoConStock) => void;
}) {
  const actualizar = useActualizarCertificado();

  async function cambiarActivo(certificado: CertificadoConStock, activo: boolean) {
    try {
      await actualizar.mutateAsync({ id: certificado.id, cambios: { activo } });
      toast.success(`Certificado “${certificado.nombre}” ${activo ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(mensajeDeError(e, MENSAJES_ERROR_CERTIFICADO));
    }
  }

  if (certificados.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-muted-foreground">
        Todavía no hay certificados. Creá el primero con “Nuevo certificado”.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Certificado</TableHead>
            <TableHead>Se usa en</TableHead>
            <TableHead className="text-right">Stock (hojas)</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Costo por hoja</TableHead>
            <TableHead className="text-right">Valor del stock</TableHead>
            <TableHead>Activo</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {certificados.map((c) => (
            <TableRow key={c.id} data-testid={`certificado-${c.nombre}`}>
              <TableCell>
                <div className="font-medium">{c.nombre}</div>
                {!c.activo && (
                  <div className="text-xs text-muted-foreground">
                    Desactivado: activalo para registrar compras.
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {describirPresentacion(c.unidad_compra, c.hojas_por_unidad)} · mínimo{" "}
                  {formatearNumero(c.stock_minimo)}
                </div>
              </TableCell>
              <TableCell>{c.aplica_a}</TableCell>
              <TableCell className="text-right tabular-nums" data-columna="stock">
                {formatearNumero(c.stock_hojas)}
              </TableCell>
              <TableCell>
                <BadgeSemaforo semaforo={c.semaforo} />
              </TableCell>
              <TableCell className="text-right tabular-nums" data-columna="costo">
                {formatearMoneda(c.costo_promedio)}
              </TableCell>
              <TableCell className="text-right tabular-nums" data-columna="valor">
                {formatearMoneda(c.valor_stock)}
              </TableCell>
              <TableCell>
                <Switch
                  checked={c.activo}
                  disabled={actualizar.isPending}
                  aria-label={`Certificado ${c.nombre} activo`}
                  onCheckedChange={(activo) => void cambiarActivo(c, activo)}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!c.activo}
                    aria-label={`Registrar compra de ${c.nombre}`}
                    onClick={() => {
                      onAccion("comprar", c);
                    }}
                  >
                    <ShoppingCart aria-hidden />
                    Compra
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Ajuste de stock de ${c.nombre}`}
                    onClick={() => {
                      onAccion("ajustar", c);
                    }}
                  >
                    <SlidersHorizontal aria-hidden />
                    Ajuste
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={String(c.id)} aria-label={`Movimientos de ${c.nombre}`}>
                      <History aria-hidden />
                      Movimientos
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar certificado ${c.nombre}`}
                    onClick={() => {
                      onAccion("editar", c);
                    }}
                  >
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
