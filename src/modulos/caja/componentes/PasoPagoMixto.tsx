import type { KeyboardEvent } from "react";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import { MEDIOS_PAGO, ORDEN_MEDIOS, type MedioPago } from "../api/consultas";
import { CAMPO_MEDIANO } from "../lib/estilos";
import type { MontosPagoMixto, RevisionPagoMixto } from "../lib/pago-mixto";
import { BotonVolverPaso } from "./BotonVolverPaso";

/**
 * Pago mixto: el monto de cada medio (formato argentino, vacío = no se usa). Muestra en vivo cuánto
 * falta o sobra para llegar al precio final (vista previa: el reparto lo valida la BD) y no deja
 * seguir hasta que cierra. Si hay parte en efectivo, el paso siguiente pide cuánto entregó.
 */
export function PasoPagoMixto({
  montos,
  revision,
  mostrarErrores,
  ocupado,
  onCambiar,
  onConfirmar,
  onVolver,
}: {
  montos: MontosPagoMixto;
  revision: RevisionPagoMixto;
  /** Se marcan los errores recién al intentar seguir (no mientras se escribe). */
  mostrarErrores: boolean;
  ocupado: boolean;
  onCambiar: (medio: MedioPago, texto: string) => void;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const { diferencia, listo } = revision;
  const malEscrito = Object.keys(revision.errores).length > 0;
  // "Cierra justo" (en verde) solo si se puede confirmar: un monto mal escrito no cuenta en la suma,
  // así que la diferencia sola podría dar 0 sin que el pago esté bien cargado.
  const estado = listo
    ? "Cierra justo"
    : malEscrito
      ? "Hay un monto mal escrito"
      : diferencia > 0
        ? "Falta"
        : diferencia < 0
          ? "Sobra"
          : "Falta otro medio";
  const conEfectivo = revision.partes.some((p) => p.medio === "efectivo");

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar();
      }}
    >
      <BotonVolverPaso onVolver={onVolver} />
      <h2 className="text-2xl font-semibold md:text-3xl">5. Pago mixto</h2>
      <p className="text-base text-muted-foreground">
        Cargá cuánto paga con cada medio (al menos dos). Dejá vacío el que no use.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {ORDEN_MEDIOS.map((medio, indice) => {
          const id = `venta-mixto-${medio}`;
          const error = mostrarErrores ? revision.errores[medio] : undefined;
          return (
            <div key={medio} className="flex flex-col gap-2">
              <Label htmlFor={id} className="text-xl font-semibold">
                {MEDIOS_PAGO[medio]} ($)
              </Label>
              <Input
                id={id}
                inputMode="decimal"
                autoComplete="off"
                autoFocus={indice === 0}
                maxLength={16}
                placeholder="0"
                className={CAMPO_MEDIANO}
                value={montos[medio]}
                disabled={ocupado}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => {
                  onCambiar(medio, e.target.value);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onVolver();
                  }
                }}
              />
              {error && (
                <p id={`${id}-error`} className="text-base font-semibold text-destructive">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div
        className={cn("rounded-lg border-2 p-5", listo ? "border-primary" : "border-destructive")}
        aria-live="polite"
        data-testid="estado-mixto"
      >
        <p
          className={cn("text-xl", listo ? "font-semibold text-primary" : "text-muted-foreground")}
        >
          {estado}
        </p>
        <p className="text-5xl font-bold tabular-nums md:text-6xl" data-testid="diferencia-mixto">
          {malEscrito ? "—" : formatearMoneda(Math.abs(diferencia))}
        </p>
      </div>
      {mostrarErrores && revision.problema && (
        <p role="alert" className="text-2xl font-semibold text-destructive">
          {revision.problema}
        </p>
      )}
      <p className="text-base text-muted-foreground">
        Tab para pasar de un medio a otro · Enter para seguir · Esc para volver
      </p>
      <Button type="submit" size="lg" className="h-14 self-start px-8 text-xl" disabled={ocupado}>
        {ocupado ? "Registrando…" : conEfectivo ? "Continuar al efectivo" : "Registrar venta"}
      </Button>
    </form>
  );
}
