import { CalendarPlus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/compartido/ui/button";
import { useVentasEnVivo } from "../api/tiempo-real";
import { EstadoConexion } from "../componentes/EstadoConexion";
import { HistorialTurnos } from "../componentes/HistorialTurnos";
import { TurnosAbiertosEnVivo } from "../componentes/TurnosAbiertosEnVivo";

/**
 * Ventas del admin: arriba los turnos abiertos con sus totales y sus ventas en vivo (Realtime);
 * abajo el historial de turnos por fecha de apertura con los totales del período. Todos los totales
 * los calcula la BD (los anulados no suman).
 */
export function Ventas() {
  const enVivo = useVentasEnVivo();

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Turnos abiertos con sus totales y ventas al instante, e historial de turnos por fecha de
            apertura. Entrá a un turno para ver su detalle, anular una venta o cerrarlo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EstadoConexion {...enVivo} />
          <Button asChild variant="outline">
            <Link to="pasadas">
              <CalendarPlus aria-hidden />
              Ventas con fecha pasada
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="titulo-abiertos" className="flex flex-col gap-4">
        <h2 id="titulo-abiertos" className="text-lg font-semibold">
          Turnos abiertos
        </h2>
        <TurnosAbiertosEnVivo />
      </section>

      <HistorialTurnos />
    </section>
  );
}
