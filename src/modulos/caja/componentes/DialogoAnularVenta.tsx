import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { LARGO_MAXIMO_NOTA, validarMotivo } from "@/compartido/lib/validaciones";
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
import { useEmitirNotaDeCredito } from "@/modulos/facturacion/api/consultas";
import { nombreComprobante, numeroComprobante } from "@/modulos/facturacion/lib/formato";
import { useAnularVenta, type Venta } from "../api/consultas";
import { detallePagos, parteEnEfectivo } from "../lib/pagos";

/** De dónde sale el efectivo al anular: todo el monto, o solo la parte en efectivo de un pago mixto. */
function avisoEfectivo(venta: Venta): string | null {
  const desde =
    venta.turno_id === null
      ? "sale de la caja de cambio."
      : "sale de la caja del turno si sigue abierto, o de la caja de cambio.";
  if (venta.medio_pago === "efectivo") return ` Como fue en efectivo, el monto ${desde}`;
  const efectivo = venta.medio_pago === null ? parteEnEfectivo(venta) : 0;
  if (efectivo > 0) {
    return ` Fue un pago mixto (${detallePagos(venta.venta_pagos)}): la parte en efectivo (${formatearMoneda(efectivo)}) ${desde}`;
  }
  return null;
}

/**
 * Anula una venta con motivo (queda quién, cuándo y por qué). El admin, cualquiera; el cajero, solo
 * las suyas de un turno abierto (lo controla la RPC, migración 47). La hoja no vuelve al stock; el
 * efectivo sale del turno abierto o de la caja de cambio (siempre de la caja de cambio en una venta con
 * fecha pasada, que no tiene turno). Si estaba facturada, el admin emite la nota de crédito en el
 * momento; anulada por el cajero (`emitirNotaDeCredito` false), queda pendiente para el admin.
 */
export function DialogoAnularVenta({
  venta,
  onCerrar,
  emitirNotaDeCredito = true,
  facturada = false,
}: {
  venta: Venta;
  onCerrar: () => void;
  emitirNotaDeCredito?: boolean;
  /** Tiene factura autorizada (solo para avisarle al cajero que la nota de crédito queda pendiente). */
  facturada?: boolean;
}) {
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
    if (!emitirNotaDeCredito) {
      if (facturada) {
        toast.info("La nota de crédito quedó pendiente: la emite el administrador.");
      }
      onCerrar();
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
            {avisoEfectivo(venta)}
            {!emitirNotaDeCredito &&
              facturada &&
              " Está facturada: la nota de crédito queda pendiente y la emite el administrador."}
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
