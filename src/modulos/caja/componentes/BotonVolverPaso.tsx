import { ArrowLeft } from "lucide-react";
import { Button } from "@/compartido/ui/button";

/** Vuelve al paso anterior de la venta (lo mismo que Esc). */
export function BotonVolverPaso({ onVolver }: { onVolver: () => void }) {
  return (
    <Button type="button" variant="ghost" size="lg" className="self-start" onClick={onVolver}>
      <ArrowLeft aria-hidden />
      Volver (Esc)
    </Button>
  );
}
