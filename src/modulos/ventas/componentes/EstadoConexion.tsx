import { RefreshCw } from "lucide-react";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import type { EstadoEnVivo } from "../api/tiempo-real";

const TEXTO: Record<EstadoEnVivo, string> = {
  conectando: "Conectando…",
  "en-vivo": "En vivo",
  "sin-conexion": "Sin conexión en vivo",
};

/** "En vivo" cuando llegan los cambios solos; si se corta, avisa y deja actualizar a mano. */
export function EstadoConexion({
  estado,
  actualizar,
}: {
  estado: EstadoEnVivo;
  actualizar: () => void;
}) {
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <Badge variant={estado === "en-vivo" ? "default" : "secondary"} data-testid="estado-en-vivo">
        <span
          aria-hidden
          className={`size-2 rounded-full ${
            estado === "en-vivo"
              ? "animate-pulse bg-current"
              : estado === "sin-conexion"
                ? "bg-destructive"
                : "bg-muted-foreground"
          }`}
        />
        {TEXTO[estado]}
      </Badge>
      {estado === "sin-conexion" && (
        <Button variant="outline" size="sm" onClick={actualizar}>
          <RefreshCw aria-hidden />
          Actualizar
        </Button>
      )}
    </div>
  );
}
