import { Ban } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useVentasDeTurno, type Venta } from "@/modulos/caja/api/consultas";
import { FiltrosVentas } from "@/modulos/caja/componentes/FiltrosVentas";
import { DialogoCertificadosServicios } from "@/modulos/caja/componentes/DialogoCertificadosServicios";
import { ResumenVentasTurno } from "@/modulos/caja/componentes/ResumenVentasTurno";
import { TablaVentas } from "@/modulos/caja/componentes/TablaVentas";
import {
  filtrarVentas,
  hayFiltros,
  SIN_FILTROS,
  type FiltroVentas,
} from "@/modulos/caja/lib/filtrar-ventas";
import { useComprobantesDeTurno } from "@/modulos/facturacion/api/consultas";
import { FacturaDeVenta } from "@/modulos/facturacion/componentes/FacturaDeVenta";
import { DialogoAnularVenta } from "@/modulos/caja/componentes/DialogoAnularVenta";

/** Ventas de un turno con filtros (patente, categoría, medio), su factura y "Anular" (solo admin). */
export function VentasDelTurno({ turnoId }: { turnoId: number }) {
  const ventas = useVentasDeTurno(turnoId);
  const comprobantes = useComprobantesDeTurno(turnoId);
  const [anulando, setAnulando] = useState<Venta | null>(null);
  const [filtro, setFiltro] = useState<FiltroVentas>(SIN_FILTROS);

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <ResumenVentasTurno turnoId={turnoId} />
        <DialogoCertificadosServicios turnoId={turnoId} />
      </div>
      <FiltrosVentas ventas={ventas.data} onCambiar={setFiltro} />
      <TablaVentas
        ventas={filtrarVentas(ventas.data, filtro)}
        vacio={hayFiltros(filtro) ? "No hay ventas en este turno con esos filtros." : undefined}
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
    </div>
  );
}
