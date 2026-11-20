import { useState } from "react";
import { toast } from "sonner";
import { Cargando } from "@/compartido/componentes/Cargando";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { cn } from "@/compartido/lib/utils";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useAbrirTurno, useCajasParaTurno } from "../api/consultas";

const MENSAJE_FALTA_CAJA = "Elegí una caja.";

/** Sin turno abierto: elegir una caja libre y abrir el turno. */
export function AbrirTurno() {
  const cajas = useCajasParaTurno();
  const abrir = useAbrirTurno();
  const [elegida, setElegida] = useState<number | null>(null);
  const [faltaCaja, setFaltaCaja] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrirTurno() {
    setError(null);
    if (elegida === null) {
      setFaltaCaja(true);
      return;
    }
    try {
      await abrir.mutateAsync(elegida);
      const nombre = cajas.data?.find((c) => c.id === elegida)?.nombre ?? "";
      toast.success(`Turno abierto en “${nombre}”`);
    } catch (e) {
      setElegida(null);
      setError(mensajeDeError(e));
    }
  }

  if (cajas.isPending) return <Cargando texto="Cargando cajas…" />;
  if (cajas.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(cajas.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Abrir turno</h1>
        <p className="text-sm text-muted-foreground">
          Elegí la caja en la que vas a trabajar. Mientras tu turno esté abierto, nadie más puede
          usarla.
        </p>
      </div>
      {cajas.data.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          No hay cajas activas. Pedile al administrador que cree una.
        </p>
      ) : (
        <fieldset
          role="radiogroup"
          className="flex flex-col gap-2"
          {...propsError("abrir-caja", faltaCaja ? MENSAJE_FALTA_CAJA : undefined)}
        >
          <legend className="sr-only">Cajas</legend>
          {cajas.data.map((caja) => (
            <label
              key={caja.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border p-4 has-[:checked]:border-primary has-[:checked]:bg-accent",
                caja.ocupada && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="caja"
                value={caja.id}
                disabled={caja.ocupada}
                checked={elegida === caja.id}
                onChange={() => {
                  setElegida(caja.id);
                  setFaltaCaja(false);
                  setError(null);
                }}
              />
              <span className="font-medium">{caja.nombre}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {caja.ocupada ? `Ocupada por ${caja.ocupada_por ?? "otro usuario"}` : "Libre"}
              </span>
            </label>
          ))}
          {faltaCaja && (
            <p id="abrir-caja-error" role="alert" className="text-sm text-destructive">
              {MENSAJE_FALTA_CAJA}
            </p>
          )}
        </fieldset>
      )}
      <ErrorFormulario mensaje={error} />
      <Button
        className="self-start"
        disabled={abrir.isPending || cajas.data.length === 0}
        onClick={() => void abrirTurno()}
      >
        {abrir.isPending ? "Abriendo…" : "Abrir turno"}
      </Button>
    </section>
  );
}
