import { LogOut } from "lucide-react";
import { useAuth } from "@/modulos/auth/contexto";
import { Button } from "@/compartido/ui/button";

/** En pantallas chicas queda solo el ícono (el nombre accesible sigue siendo "Salir"). */
export function BotonSalir() {
  const { cerrarSesion } = useAuth();
  return (
    <Button variant="outline" size="sm" aria-label="Salir" onClick={() => void cerrarSesion()}>
      <LogOut aria-hidden />
      <span className="hidden sm:inline">Salir</span>
    </Button>
  );
}
