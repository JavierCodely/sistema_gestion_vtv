import { Store } from "lucide-react";
import { useTurnosAbiertos } from "../api/consultas";
import { BotonAbrirTurno } from "./BotonAbrirTurno";
import { BotonBarra } from "./BotonBarra";
import { BotonCerrarTurnos } from "./BotonCerrarTurnos";

/**
 * Acciones de turno de la barra fija del admin (panel y caja): abrir el turno de una caja, cerrar
 * cualquiera de los abiertos y, fuera de la caja, "Ir a la caja" si hay alguna caja abierta.
 */
export function AccionesTurnoAdmin({ mostrarIrALaCaja }: { mostrarIrALaCaja: boolean }) {
  // La misma consulta que usa "Cerrar turno" (TanStack Query la comparte).
  const turnos = useTurnosAbiertos();
  return (
    <div role="group" aria-label="Turnos" className="flex items-center gap-1 sm:gap-2">
      {/* Solo con la respuesta confirmada: mientras carga no se ofrece ir a una caja que no existe. */}
      {mostrarIrALaCaja && turnos.isSuccess && turnos.data.length > 0 && (
        <BotonBarra icono={Store} texto="Ir a la caja" variant="secondary" a="/caja" />
      )}
      <BotonAbrirTurno />
      <BotonCerrarTurnos />
    </div>
  );
}
