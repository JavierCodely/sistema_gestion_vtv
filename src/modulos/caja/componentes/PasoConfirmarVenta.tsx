import type { KeyboardEvent } from "react";
import { formatearMoneda } from "@/compartido/lib/formato";
import { Button } from "@/compartido/ui/button";
import { BotonVolverPaso } from "./BotonVolverPaso";

/**
 * Último paso de toda venta: la patente en grande para verificarla, con el servicio, lo que se cobra y
 * cómo. Enter (o el botón) registra; Esc vuelve al paso anterior.
 */
export function PasoConfirmarVenta({
  patente,
  servicio,
  precio,
  medio,
  detalle,
  ocupado,
  onConfirmar,
  onVolver,
}: {
  patente: string;
  servicio: string;
  precio: number;
  /** "Efectivo", "Tarjeta", "Mixto: …" o "Sin cargo". */
  medio: string;
  /** Datos extra (vuelto, condicional al 50%, vuelta de condicional). */
  detalle: string[];
  ocupado: boolean;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      data-testid="paso-confirmar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ocupado) onConfirmar();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLFormElement>) => {
        if (e.key === "Escape" && !ocupado) {
          e.preventDefault();
          onVolver();
        }
      }}
    >
      <BotonVolverPaso onVolver={onVolver} />
      <h2 className="text-2xl font-semibold md:text-3xl">Confirmá la venta</h2>
      <p className="text-base text-muted-foreground">Revisá la patente antes de confirmar.</p>
      <p
        className="self-start rounded-lg border-4 border-foreground px-6 py-3 font-mono text-6xl font-bold tracking-widest md:text-8xl"
        data-testid="patente-a-confirmar"
      >
        {patente}
      </p>
      <dl className="grid gap-1 text-2xl">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Servicio:</dt>
          <dd className="font-semibold">{servicio}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Cobra:</dt>
          <dd className="font-semibold tabular-nums">{formatearMoneda(precio)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Medio:</dt>
          <dd className="font-semibold">{medio}</dd>
        </div>
      </dl>
      {detalle.map((linea) => (
        <p key={linea} className="text-xl">
          {linea}
        </p>
      ))}
      <p className="text-base text-muted-foreground">Enter para confirmar · Esc para volver</p>
      <Button
        type="submit"
        size="lg"
        className="h-14 self-start px-8 text-xl"
        disabled={ocupado}
        autoFocus
      >
        {ocupado ? "Registrando…" : "Confirmar venta"}
      </Button>
    </form>
  );
}
