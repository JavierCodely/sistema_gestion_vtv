import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { LARGO_MAXIMO_NOTA } from "@/compartido/lib/validaciones";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { Input } from "@/compartido/ui/input";
import { useAnularVenta, type Venta } from "@/modulos/caja/api/consultas";
import { useEmitirNotaDeCredito } from "@/modulos/facturacion/api/consultas";
import { nombreComprobante, numeroComprobante } from "@/modulos/facturacion/lib/formato";
import { validarMotivo } from "../lib/validaciones";

/** Anula una venta (solo admin). La hoja no vuelve al stock; el efectivo sale de la caja de cambio. */
export function DialogoAnularVenta({ venta, onCerrar }: { venta: Venta; onCerrar: () => void }) {
  const anular = useAnularVenta();
  const emitirNota = useEmitirNotaDeCredito();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const problema = validarMotivo(motivo);
    setError(problema);
    if (problema) return;
    setErrorServidor(null);
    try {
      await anular.mutateAsync({ ventaId: venta.id, motivo: motivo.trim() });
      toast.success(`Venta N° ${String(venta.id)} anulada`);
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
      return;
    }
    // Si estaba facturada, la BD dejó la nota de crédito pendiente: se emite ya. Si ARCA falla,
    // queda pendiente para reintentar desde el detalle del turno.
    try {
      const nota = await emitirNota.mutateAsync(venta.id);
      if (nota?.estado === "autorizado") {
        toast.success(
          `${nombreComprobante(nota.cbte_tipo)} ${numeroComprobante(nota.punto_venta, nota.numero)} autorizada por ARCA`,
        );
      } else if (nota) {
        toast.warning(
          `La nota de crédito quedó pendiente: ${nota.mensaje ?? "reintentá desde el turno"}`,
        );
      }
    } catch (e) {
      toast.warning(`La nota de crédito quedó pendiente: ${mensajeDeError(e)}`);
    }
    // Se cierra recién ahora: mientras se emite la NC no queda a mano otro botón para emitirla.
    onCerrar();
  }

  const ocupado = anular.isPending || emitirNota.isPending;

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !ocupado) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular venta N° {venta.id}</DialogTitle>
          <DialogDescription>
            {venta.servicio_nombre} · {formatearMoneda(venta.precio)}. Deja de sumar en los totales
            y la hoja de certificado no vuelve al stock.
            {venta.medio_pago === "efectivo" &&
              " Como fue en efectivo, el monto sale de la caja de cambio."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="anular-motivo" etiqueta="Motivo" error={error}>
            <Input
              id="anular-motivo"
              autoComplete="off"
              autoFocus
              maxLength={LARGO_MAXIMO_NOTA}
              placeholder="Ej. Se cargó un servicio equivocado"
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
              }}
              {...propsError("anular-motivo", error)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={ocupado}>
              {anular.isPending
                ? "Anulando…"
                : emitirNota.isPending
                  ? "Emitiendo nota de crédito…"
                  : "Anular venta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
