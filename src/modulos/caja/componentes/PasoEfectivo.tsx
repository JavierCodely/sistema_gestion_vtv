import type { KeyboardEvent } from "react";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import { CAMPO_GRANDE } from "../lib/estilos";
import { calcularVuelto, soloDigitos } from "../lib/vuelto";
import { BotonVolverPaso } from "./BotonVolverPaso";

/**
 * Cuánto entregó el cliente en efectivo y el vuelto, sobre lo que se cobra en efectivo: el precio
 * final, o la parte en efectivo de un pago mixto. Vacío = pagó justo.
 */
export function PasoEfectivo({
  aCobrar,
  mixto,
  recibido,
  error,
  ocupado,
  onCambiar,
  onConfirmar,
  onPagoJusto,
  onVolver,
}: {
  /** Vista previa: el precio real lo devuelve la BD al registrar la venta. */
  aCobrar: number;
  mixto: boolean;
  recibido: string;
  error: string | null;
  ocupado: boolean;
  onCambiar: (texto: string) => void;
  onConfirmar: () => void;
  onPagoJusto: () => void;
  onVolver: () => void;
}) {
  const vuelto = recibido === "" ? null : calcularVuelto(aCobrar, Number(recibido));
  const falta = vuelto !== null && vuelto < 0;

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
      <Label htmlFor="venta-recibido" className="text-2xl font-semibold md:text-3xl">
        {mixto ? "6. ¿Cuánto te entregó en efectivo? ($)" : "5. ¿Cuánto te entregó? ($)"}
      </Label>
      {mixto && (
        <p className="text-xl" data-testid="efectivo-a-cobrar">
          Efectivo a cobrar:{" "}
          <span className="font-bold tabular-nums">{formatearMoneda(aCobrar)}</span>
        </p>
      )}
      <Input
        id="venta-recibido"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoFocus
        maxLength={12}
        placeholder="Pagó justo"
        className={cn(CAMPO_GRANDE, "tabular-nums")}
        value={recibido}
        disabled={ocupado}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "venta-recibido-error" : undefined}
        onChange={(e) => {
          onCambiar(soloDigitos(e.target.value));
        }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onVolver();
          }
        }}
      />
      {error && (
        <p id="venta-recibido-error" className="text-2xl font-semibold text-destructive">
          {error}
        </p>
      )}
      <div
        className={cn("rounded-lg border-2 p-5", falta ? "border-destructive" : "border-primary")}
      >
        <p className="text-xl text-muted-foreground">{falta ? "Falta" : "Vuelto"}</p>
        <p className="text-6xl font-bold tabular-nums md:text-7xl" data-testid="vuelto">
          {formatearMoneda(vuelto === null ? 0 : Math.abs(vuelto))}
        </p>
      </div>
      <p className="text-base text-muted-foreground">
        Enter con el campo vacío = pagó justo · Esc para volver
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" className="h-14 px-8 text-xl" disabled={ocupado}>
          {ocupado ? "Registrando…" : "Registrar venta"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 px-8 text-xl"
          disabled={ocupado}
          onClick={onPagoJusto}
        >
          Pagó justo
        </Button>
      </div>
    </form>
  );
}
