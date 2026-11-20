import { LogOut } from "lucide-react";
import { useAuth } from "@/modulos/auth/contexto";
import { Button } from "@/compartido/ui/button";

export function BotonSalir() {
  const { cerrarSesion } = useAuth();
  return (
    <Button variant="outline" size="sm" onClick={() => void cerrarSesion()}>
      <LogOut aria-hidden />
      Salir
    </Button>
  );
}
