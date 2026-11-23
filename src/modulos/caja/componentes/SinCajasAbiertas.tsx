import { Clock, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/compartido/ui/button";
import { DialogoAbrirTurno } from "./DialogoAbrirTurno";

/**
 * Ninguna caja tiene el turno abierto. Los turnos los abre el admin con el efectivo inicial: el
 * cajero espera (la pantalla se reconsulta sola); el admin puede abrir uno acá o con "Abrir turno" de
 * la barra.
 */
export function SinCajasAbiertas({ esAdmin }: { esAdmin: boolean }) {
  const [dialogo, setDialogo] = useState(false);
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-md border p-8 text-center">
      <Clock aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">No hay cajas abiertas</h1>
      {esAdmin ? (
        <>
          <p className="text-sm text-muted-foreground">
            Abrí el turno de una caja con el efectivo inicial para cambio. Después cualquier cajero
            o administrador puede vender en ella.
          </p>
          <Button
            onClick={() => {
              setDialogo(true);
            }}
          >
            <Play aria-hidden />
            Abrir turno
          </Button>
          {dialogo && (
            <DialogoAbrirTurno
              onCerrar={() => {
                setDialogo(false);
              }}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Esperá que el administrador abra una caja. Esta pantalla se actualiza sola.
        </p>
      )}
    </section>
  );
}
