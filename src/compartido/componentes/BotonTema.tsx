import { Moon, Sun } from "lucide-react";
import { useTema } from "@/compartido/lib/tema";
import { Button } from "@/compartido/ui/button";

/** Alterna entre modo claro y oscuro. La elección queda guardada en este navegador. */
export function BotonTema() {
  const { tema, cambiarTema } = useTema();
  const oscuro = tema === "dark";
  const texto = oscuro ? "Activar modo claro" : "Activar modo oscuro";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={texto}
      title={texto}
      onClick={() => {
        cambiarTema(oscuro ? "light" : "dark");
      }}
    >
      {oscuro ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
