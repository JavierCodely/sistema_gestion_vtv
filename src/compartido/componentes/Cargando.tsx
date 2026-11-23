import { LoaderCircle } from "lucide-react";

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-40 flex-1 items-center justify-center gap-2 text-muted-foreground"
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span>{texto}</span>
    </div>
  );
}
