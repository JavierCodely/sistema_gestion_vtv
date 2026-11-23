import type { ReactNode } from "react";
import { Label } from "@/compartido/ui/label";

/** Etiqueta + control + mensaje de error accesible (el control debe usar `id` y `aria-describedby`). */
export function Campo({
  id,
  etiqueta,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
