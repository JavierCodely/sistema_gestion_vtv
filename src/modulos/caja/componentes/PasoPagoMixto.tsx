import type { KeyboardEvent } from "react";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import { CAMPO_GRANDE } from "../lib/estilos";
import { MEDIOS_RESTO, type MedioResto, type RevisionPagoMixto } from "../lib/pago-mixto";
import { BotonVolverPaso } from "./BotonVolverPaso";
import { ListaOpciones } from "./ListaOpciones";

/**
 * Pago mixto, primera parte: cuánto paga en efectivo. El resto (precio final − efectivo) se calcula
 * solo y se ve en grande mientras se escribe. Enter sigue a elegir con qué paga el resto.
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
        <p className="text-xl text-muted-foreground">Resto (transferencia o débito/crédito)</p>
        <p className="text-5xl font-bold tabular-nums md:text-6xl" data-testid="resto-mixto">
          {revision.resto !== null ? formatearMoneda(revision.resto) : "—"}
        </p>
      </div>
      <p className="text-base text-muted-foreground">
        Escribí el efectivo · Enter para elegir con qué paga el resto · Esc para volver
      </p>
      <Button type="submit" size="lg" className="h-14 self-start px-8 text-xl" disabled={ocupado}>
        Continuar
      </Button>
    </form>
  );
}

/**
 * Pago mixto, segunda parte: con qué paga el resto. Se elige con 1 / 2 o las flechas y Enter (o un
 * clic); Esc vuelve a corregir el efectivo.
 */
export function PasoRestoMixto({
  efectivo,
  resto,
  inicial,
  ocupado,
  onElegir,
  onVolver,
}: {
  efectivo: number;
  resto: number;
  inicial?: MedioResto;
  ocupado: boolean;
  onElegir: (medio: MedioResto) => void;
  onVolver: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <BotonVolverPaso onVolver={onVolver} />
      <p className="text-2xl" data-testid="reparto-mixto">
        Efectivo <span className="font-bold tabular-nums">{formatearMoneda(efectivo)}</span> · Resto{" "}
        <span className="font-bold tabular-nums">{formatearMoneda(resto)}</span>
      </p>
      <ListaOpciones
        titulo="5. ¿Con qué paga el resto?"
        horizontal
        deshabilitada={ocupado}
        inicial={inicial}
        opciones={MEDIOS_RESTO.map((m) => ({
          valor: m.valor,
          etiqueta: m.etiqueta,
          detalle: formatearMoneda(resto),
        }))}
        onElegir={onElegir}
        onVolver={onVolver}
      />
    </div>
  );
}
