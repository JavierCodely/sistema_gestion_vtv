import { formatearDia } from "@/compartido/lib/formato";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import type { VentaAnteriorDePatente } from "../api/consultas";

/** Texto del certificado de una venta anterior (con la marca de condicional o vuelta). */
function certificadoDe(venta: VentaAnteriorDePatente): string {
  const nombre = venta.certificado_nombre ?? "Sin certificado";
  if (venta.condicional) return `${nombre} (condicional)`;
  if (venta.vuelta) return `${nombre} (vuelta de condicional)`;
  return nombre;
}

/**
 * Aviso al pasar la patente si ya se vendió hoy (migración 49; las ventas de otros días no avisan):
 * cuándo se vendió, qué servicio y qué certificado se
 * entregó. Enter (o "Continuar con la venta") sigue con el flujo de siempre; Esc o "Cancelar" vuelve
 * a la patente.
 */
export function DialogoPatenteRepetida({
  patente,
  ventas,
  onContinuar,
  onCancelar,
}: {
  patente: string;
  ventas: VentaAnteriorDePatente[];
  onContinuar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar();
      }}
    >
      <DialogContent className="sm:max-w-2xl" data-testid="dialogo-patente-repetida">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {`La patente ${patente} ya tiene ${ventas.length === 1 ? "una venta" : `${String(ventas.length)} ventas`} hoy`}
          </DialogTitle>
          <DialogDescription className="text-base">
            Revisá las ventas de hoy antes de seguir. ¿Querés continuar con esta venta?
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50svh] overflow-auto">
          <Table className="text-lg">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Certificado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.map((v) => (
                <TableRow key={v.venta_id}>
                  <TableCell className="tabular-nums">{formatearDia(v.fecha)}</TableCell>
                  <TableCell className="whitespace-normal">{v.servicio_nombre}</TableCell>
                  <TableCell className="whitespace-normal">{certificadoDe(v)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" size="lg" className="text-lg" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button size="lg" className="text-lg" autoFocus onClick={onContinuar}>
            Continuar con la venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
