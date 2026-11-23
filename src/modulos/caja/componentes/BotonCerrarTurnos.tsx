import { LogOut } from "lucide-react";
import { useState } from "react";
import { mensajeDeError } from "@/compartido/lib/errores";
import { useTurnosAbiertos } from "../api/consultas";
import { BotonBarra } from "./BotonBarra";
import { DialogoCerrarTurno } from "./DialogoCerrarTurno";

/**
 * "Cerrar turno" de la barra del admin (el cajero no cierra turnos): elige cuál de los turnos abiertos
 * cierra (caja, desde cuándo y quiénes atendieron). Sin turnos abiertos queda deshabilitado y lo explica.
 */
export function BotonCerrarTurnos() {
  const turnos = useTurnosAbiertos();
  const [abierto, setAbierto] = useState(false);

  const motivo = turnos.isPending
    ? "Cargando los turnos abiertos…"
    : turnos.isError
      ? mensajeDeError(turnos.error)
      : turnos.data.length === 0
        ? "No hay turnos abiertos para cerrar"
        : undefined;

  return (
    <>
      <BotonBarra
        icono={LogOut}
        texto="Cerrar turno"
        variant="outline"
        disabled={motivo !== undefined}
        motivo={motivo}
        onClick={() => {
          setAbierto(true);
          // Que la lista (y quiénes atendieron) esté al día: otro admin pudo cerrar uno desde otra computadora.
          void turnos.refetch();
        }}
      />
      {abierto && turnos.data && (
        <DialogoCerrarTurno
          turnos={turnos.data}
          descripcion="Elegí el turno. Después de cerrarlo nadie va a poder registrar más ventas en esa caja y su efectivo vuelve a la caja de cambio."
          onCerrar={() => {
            setAbierto(false);
          }}
        />
      )}
    </>
  );
}
