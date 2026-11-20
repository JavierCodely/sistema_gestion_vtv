import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { useCerrarTurno } from "../api/consultas";
import { LARGO_MAXIMO_OBSERVACIONES, validarObservaciones } from "../lib/validaciones";

/**
 * Cierra un turno. Sin `turnoId` cierra el propio; con `turnoId` (admin) cierra el de otro.
 * No muestra totales: el cajero no los ve.
 */
export function DialogoCerrarTurno({
  turnoId,
  descripcion,
  onCerrado,
  onCerrar,
}: {
  turnoId?: number;
  descripcion: string;
  onCerrado?: () => void;
  onCerrar: () => void;
}) {
  const cerrar = useCerrarTurno();
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const problema = validarObservaciones(observaciones);
    setError(problema);
    if (problema) return;
    setErrorServidor(null);
    try {
      await cerrar.mutateAsync({
        observaciones: observaciones.trim(),
        ...(turnoId !== undefined && { turnoId }),
      });
      toast.success("Turno cerrado");
      onCerrado?.();
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
          <DialogTitle>Cerrar turno</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="cierre-observaciones" etiqueta="Observaciones (opcional)" error={error}>
            <textarea
              id="cierre-observaciones"
              rows={3}
              maxLength={LARGO_MAXIMO_OBSERVACIONES}
              className="rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={observaciones}
              onChange={(e) => {
                setObservaciones(e.target.value);
              }}
              {...propsError("cierre-observaciones", error)}
            />
          </Campo>
          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={cerrar.isPending}>
              {cerrar.isPending ? "Cerrando…" : "Cerrar turno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
