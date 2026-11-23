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
import { useCerrarTurno, type TurnoAbiertoResumen } from "../api/consultas";
import { LARGO_MAXIMO_OBSERVACIONES, validarObservaciones } from "../lib/validaciones";
import { ElegirTurnoAbierto } from "./ElegirTurnoAbierto";

type Destino =
  /** Cierra ese turno (ej. "Cerrar este turno" en el detalle). */
  | { turnoId: number; turnos?: undefined }
  /** Elige cuál de los turnos abiertos cierra (si hay uno solo, ya queda elegido). */
  | { turnos: TurnoAbiertoResumen[]; turnoId?: undefined };

/** Cierra el turno de una caja (solo admin): uno dado o uno elegido de la lista de turnos abiertos. */
export function DialogoCerrarTurno({
  descripcion,
  onCerrado,
  onCerrar,
  ...destino
}: Destino & {
  descripcion: string;
  onCerrado?: () => void;
  onCerrar: () => void;
}) {
  const cerrar = useCerrarTurno();
  const turnos = destino.turnos;
  const [elegido, setElegido] = useState<number | null>(() =>
    turnos?.length === 1 && turnos[0] ? turnos[0].id : null,
  );
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [errorTurno, setErrorTurno] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // El elegido tiene que seguir en la lista (otro pudo cerrarlo mientras tanto).
  const turnoElegido = turnos?.find((t) => t.id === elegido);
  const turnoId = turnos ? turnoElegido?.id : destino.turnoId;

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const problema = validarObservaciones(observaciones);
    const faltaTurno =
      turnos && turnoId === undefined ? "Elegí el turno que querés cerrar." : undefined;
    setError(problema);
    setErrorTurno(faltaTurno);
    if (problema || faltaTurno || turnoId === undefined) return;
    setErrorServidor(null);
    try {
      await cerrar.mutateAsync({ observaciones: observaciones.trim(), turnoId });
      toast.success(
        turnoElegido ? `Turno de ${turnoElegido.caja_nombre} cerrado` : "Turno cerrado",
      );
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
        // Mientras cierra no se descarta: el resultado (o el error) se tiene que ver.
        if (!abierto && !cerrar.isPending) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar turno</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          {turnos && (
            <ElegirTurnoAbierto
              turnos={turnos}
              elegido={turnoElegido?.id ?? null}
              error={errorTurno}
              onElegir={(id) => {
                setElegido(id);
                setErrorTurno(undefined);
              }}
            />
          )}
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
            <Button type="submit" disabled={cerrar.isPending || turnos?.length === 0}>
              {cerrar.isPending ? "Cerrando…" : "Cerrar turno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
