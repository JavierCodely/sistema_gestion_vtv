import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";

/**
 * Monto del libro con su signo, tal como lo devuelve la BD: los ingresos en verde con "+", los
 * egresos en rojo con "−". Solo formatea (el valor absoluto es para poner el signo tipográfico).
 */
export function MontoConSigno({ monto, className }: { monto: number; className?: string }) {
  const negativo = monto < 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        negativo ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {negativo ? "−" : "+"}
      {formatearMoneda(Math.abs(monto))}
    </span>
  );
}
