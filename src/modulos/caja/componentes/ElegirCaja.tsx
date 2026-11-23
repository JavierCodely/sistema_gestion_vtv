import { Store } from "lucide-react";
import { formatearFechaHora } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import type { CajaAbierta } from "../api/consultas";

/**
 * Elegir en qué caja abierta se trabaja (hay varias, o la elegida se cerró). Botones grandes, uno
 * por caja, que se recorren con Tab. `aviso`: por qué hay que volver a elegir.
 */
export function ElegirCaja({
  cajas,
  aviso,
  onElegir,
}: {
  cajas: readonly CajaAbierta[];
  aviso: string | null;
  onElegir: (caja: CajaAbierta) => void;
}) {
  return (
    <section
      aria-labelledby="titulo-elegir-caja"
      className="mx-auto flex w-full max-w-2xl flex-col gap-4"
    >
      <h1 id="titulo-elegir-caja" className="text-2xl font-semibold">
        ¿En qué caja estás trabajando?
      </h1>
      {aviso && (
        <Alert variant="destructive">
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        Las ventas y los gastos se registran en la caja que elijas. Podés cambiarla cuando quieras.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cajas.map((caja) => (
          <li key={caja.id}>
            <Button
              variant="outline"
              className="flex h-auto w-full flex-col items-start gap-1 p-4 text-left"
              onClick={() => {
                onElegir(caja);
              }}
            >
              <span className="flex items-center gap-2 text-xl font-bold">
                <Store aria-hidden className="size-5" />
                {caja.caja_nombre}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                Abierta desde {formatearFechaHora(caja.abierto_en)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
