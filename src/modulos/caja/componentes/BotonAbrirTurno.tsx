import { Play } from "lucide-react";
import { useState } from "react";
import { BotonBarra } from "./BotonBarra";
import { DialogoAbrirTurno } from "./DialogoAbrirTurno";

/**
 * "Abrir turno" de la barra del admin: abre el turno de una caja libre (sin elegir quién atiende).
 * Después de abrir se queda donde está.
 */
export function BotonAbrirTurno() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <BotonBarra
        icono={Play}
        texto="Abrir turno"
        onClick={() => {
          setAbierto(true);
        }}
      />
      {abierto && (
        <DialogoAbrirTurno
          onCerrar={() => {
            setAbierto(false);
          }}
        />
      )}
    </>
  );
}
