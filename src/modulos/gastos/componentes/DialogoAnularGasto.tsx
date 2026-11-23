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
import { useAnularGasto, type Gasto } from "../api/consultas";

/** Anulación (solo admin, motivo obligatorio). En efectivo, vuelve al turno abierto o a la caja de cambio. */
export function DialogoAnularGasto({ gasto, onCerrar }: { gasto: Gasto; onCerrar: () => void }) {
  const anular = useAnularGasto();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const monto = formatearMoneda(Math.abs(gasto.monto ?? 0));

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const errorMotivo = validarMotivo(motivo);
    setError(errorMotivo);
    if (errorMotivo) return;
    setErrorServidor(null);
    try {
      await anular.mutateAsync({ id: gasto.id, motivo: motivo.trim() });
      toast.success(`Gasto de ${monto} anulado`);
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular gasto</DialogTitle>
          <DialogDescription>
            {gasto.concepto} · {monto}. Queda tachado en el historial
            {gasto.medio === "efectivo"
              ? " y el dinero vuelve a la caja del turno si sigue abierto, o a la caja de cambio"
              : ""}
            .
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="anular-gasto-motivo" etiqueta="Motivo" error={error}>
            <Input
              id="anular-gasto-motivo"
              autoComplete="off"
              autoFocus
              maxLength={LARGO_MAXIMO_NOTA}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
              }}
              {...propsError("anular-gasto-motivo", error)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={anular.isPending}>
              {anular.isPending ? "Anulando…" : "Anular gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
