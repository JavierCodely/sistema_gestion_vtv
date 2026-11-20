import { Construction } from "lucide-react";

/** Pantalla provisoria para secciones de fases futuras. */
export function EnConstruccion({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="flex items-center gap-2 text-muted-foreground">
        <Construction className="size-4" aria-hidden />
        Esta sección se construye en la fase {fase}.
      </p>
    </section>
  );
}
