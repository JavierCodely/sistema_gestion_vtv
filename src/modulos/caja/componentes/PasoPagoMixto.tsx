import type { KeyboardEvent } from "react";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import { CAMPO_GRANDE } from "../lib/estilos";
import type { RevisionPagoMixto } from "../lib/pago-mixto";
import { BotonVolverPaso } from "./BotonVolverPaso";

/**
 * Pago mixto, primera parte: cuánto paga en efectivo. El resto (precio final − efectivo) se calcula
 * solo, va por transferencia y se ve en grande mientras se escribe. Enter sigue a cuánto entregó.
 */
export function PasoEfectivoMixto({
  texto,
  revision,
  mostrarError,
  ocupado,
  onCambiar,
  onConfirmar,
  onVolver,
}: {
  texto: string;
  revision: RevisionPagoMixto;
  /** El error se marca recién al intentar seguir (no mientras se escribe). */
  mostrarError: boolean;
  ocupado: boolean;
  onCambiar: (texto: string) => void;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const error = mostrarError ? revision.error : null;
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
      <Label htmlFor="venta-mixto-efectivo" className="text-2xl font-semibold md:text-3xl">
        5. Pago mixto: ¿cuánto paga en efectivo? ($)
      </Label>
      <Input
        id="venta-mixto-efectivo"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        maxLength={16}
        placeholder="0"
        className={cn(CAMPO_GRANDE, "tabular-nums")}
        value={texto}
        disabled={ocupado}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "venta-mixto-efectivo-error" : undefined}
        onChange={(e) => {
          onCambiar(e.target.value);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onVolver();
          }
        }}
      />
      {error && (
        <p
          id="venta-mixto-efectivo-error"
          role="alert"
          className="text-2xl font-semibold text-destructive"
        >
          {error}
        </p>
      )}
      <div
        className={cn(
          "rounded-lg border-2 p-5",
          revision.resto !== null ? "border-primary" : "border-border",
        )}
        aria-live="polite"
      >
        <p className="text-xl text-muted-foreground">Resto por transferencia</p>
        <p className="text-5xl font-bold tabular-nums md:text-6xl" data-testid="resto-mixto">
          {revision.resto !== null ? formatearMoneda(revision.resto) : "—"}
        </p>
      </div>
      <p className="text-base text-muted-foreground">
        Escribí el efectivo · Enter para seguir · Esc para volver
      </p>
      <Button type="submit" size="lg" className="h-14 self-start px-8 text-xl" disabled={ocupado}>
        Continuar
      </Button>
    </form>
  );
}
