import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";

/** Saldo de una cuenta: en rojo si es negativo (la transferencia puede quedar así por los gastos). */
export function Saldo({
  valor,
  className,
  testId,
}: {
  valor: number;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      className={cn("tabular-nums", valor < 0 && "text-destructive", className)}
      data-testid={testId}
    >
      {formatearMoneda(valor)}
    </span>
  );
}
