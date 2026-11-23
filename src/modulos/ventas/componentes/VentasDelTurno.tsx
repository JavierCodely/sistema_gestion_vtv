import { Ban } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useVentasDeTurno, type Venta } from "@/modulos/caja/api/consultas";
import { TablaVentas } from "@/modulos/caja/componentes/TablaVentas";
import { useComprobantesDeTurno } from "@/modulos/facturacion/api/consultas";
import { FacturaDeVenta } from "@/modulos/facturacion/componentes/FacturaDeVenta";
import { DialogoAnularVenta } from "./DialogoAnularVenta";

/** Ventas de un turno con su factura y "Anular" (solo admin). */
export function VentasDelTurno({ turnoId }: { turnoId: number }) {
  const ventas = useVentasDeTurno(turnoId);
  const comprobantes = useComprobantesDeTurno(turnoId);
  const [anulando, setAnulando] = useState<Venta | null>(null);

  if (ventas.isPending || comprobantes.isPending) return <Cargando texto="Cargando ventas…" />;
  if (ventas.isError || comprobantes.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(ventas.error ?? comprobantes.error)}</AlertDescription>
      </Alert>
    );
  }
  const listaComprobantes = comprobantes.data;

  return (
    <>
      <TablaVentas
        ventas={ventas.data}
        acciones={(venta) => (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <FacturaDeVenta
              venta={venta}
              anulada={venta.anulada}
              comprobantes={listaComprobantes.filter((c) => c.venta_id === venta.id)}
              puedeEmitirNotas
            />
            {!venta.anulada && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Anular venta N° ${String(venta.id)}`}
                onClick={() => {
                  setAnulando(venta);
                }}
              >
                <Ban aria-hidden />
                Anular
              </Button>
            )}
          </div>
        )}
      />
      {anulando && (
        <DialogoAnularVenta
          venta={anulando}
          onCerrar={() => {
            setAnulando(null);
          }}
        />
      )}
    </>
  );
}
