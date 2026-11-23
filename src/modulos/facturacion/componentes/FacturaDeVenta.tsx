import { FileText, RotateCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { type Comprobante, useEmitir } from "../api/consultas";
import { ESTADOS, nombreComprobante, numeroComprobante } from "../lib/formato";
import { DialogoFacturar, type VentaParaFacturar } from "./DialogoFacturar";

function EnlaceComprobante({ c }: { c: Comprobante }) {
  const nombre = `${nombreComprobante(c.cbte_tipo)} ${numeroComprobante(c.punto_venta, c.numero)}`;
  return (
    <Button asChild variant="link" size="sm" className="h-auto p-0">
      <Link to={`/comprobantes/${String(c.id)}`} aria-label={`Ver ${nombre}`}>
        <FileText aria-hidden />
        {nombre}
      </Link>
    </Button>
  );
}

/** Nota de crédito sin CAE: estado y reintento (solo admin). */
function NotaDeCreditoPendiente({ nc, puedeEmitir }: { nc: Comprobante; puedeEmitir: boolean }) {
  const emitir = useEmitir();
  async function reintentar() {
    try {
      const r = await emitir.mutateAsync(nc.id);
      if (r.estado === "autorizado") {
        toast.success(
          `${nombreComprobante(r.cbte_tipo)} ${numeroComprobante(r.punto_venta, r.numero)} autorizada por ARCA`,
        );
      } else {
        toast.error(r.mensaje ?? "La nota de crédito no se pudo emitir");
      }
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline" title={nc.mensaje ?? undefined}>
        Nota de crédito {ESTADOS[nc.estado]?.toLowerCase()}
      </Badge>
      {puedeEmitir && (
        <Button
          variant="ghost"
          size="sm"
          disabled={emitir.isPending}
          aria-label={`Emitir nota de crédito de la venta N° ${String(nc.venta_id)}`}
          onClick={() => void reintentar()}
        >
          <RotateCw aria-hidden />
          {emitir.isPending ? "Emitiendo…" : "Emitir NC"}
        </Button>
      )}
    </div>
  );
}

/**
 * Estado de facturación de una venta en las tablas de ventas: enlace al comprobante, o el botón
 * para facturar / reintentar. `puedeEmitirNotas`: el admin reintenta notas de crédito.
 */
export function FacturaDeVenta({
  venta,
  anulada,
  comprobantes,
  puedeEmitirNotas = false,
}: {
  venta: VentaParaFacturar;
  anulada: boolean;
  comprobantes: Comprobante[];
  puedeEmitirNotas?: boolean;
}) {
  const [facturando, setFacturando] = useState(false);
  const factura = comprobantes.find((c) => c.tipo === "factura");
  const nc = comprobantes.find((c) => c.tipo === "nota_credito");

  if (factura?.estado === "autorizado") {
    return (
      <div className="flex flex-col items-end gap-1">
        <EnlaceComprobante c={factura} />
        {nc &&
          (nc.estado === "autorizado" ? (
            <EnlaceComprobante c={nc} />
          ) : (
            <NotaDeCreditoPendiente nc={nc} puedeEmitir={puedeEmitirNotas} />
          ))}
      </div>
    );
  }
  if (anulada) return null;

  const pendiente = factura && factura.estado !== "cancelado" ? factura : undefined;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {pendiente && (
        <Badge
          variant={pendiente.estado === "rechazado" ? "destructive" : "outline"}
          title={pendiente.mensaje ?? undefined}
        >
          Factura {ESTADOS[pendiente.estado]?.toLowerCase()}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-label={`${pendiente ? "Reintentar factura" : "Facturar"} venta N° ${String(venta.id)}`}
        onClick={() => {
          setFacturando(true);
        }}
      >
        <FileText aria-hidden />
        {pendiente ? "Reintentar" : "Facturar"}
      </Button>
      {facturando && (
        <DialogoFacturar
          venta={venta}
          comprobante={pendiente}
          onCerrar={() => {
            setFacturando(false);
          }}
        />
      )}
    </div>
  );
}
