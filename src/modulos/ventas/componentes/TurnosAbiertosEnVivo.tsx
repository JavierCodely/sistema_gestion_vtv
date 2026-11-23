import { useState } from "react";
import { Link } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import {
  formatearFechaHora,
  formatearLista,
  formatearMoneda,
  formatearNumero,
} from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/compartido/ui/tabs";
import { useTurnosAbiertosConTotales, type Turno } from "../api/consultas";
import { TotalesVentas } from "./TotalesVentas";
import { VentasDelTurno } from "./VentasDelTurno";

function TurnoAbierto({ turno }: { turno: Turno }) {
  return (
    <div className="flex flex-col gap-4" data-testid={`turno-abierto-${String(turno.id)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">{turno.caja_nombre}</span> · apertura{" "}
            {formatearFechaHora(turno.abierto_en)}
            {turno.abierto_por_nombre && ` por ${turno.abierto_por_nombre}`}
          </p>
          <p className="text-muted-foreground">
            {turno.atendido_por && turno.atendido_por.length > 0
              ? `Atendieron: ${formatearLista(turno.atendido_por)}`
              : "Todavía nadie vendió ni cargó gastos en este turno."}
          </p>
          {turno.efectivo_en_caja !== null && (
            <p>
              Efectivo en caja:{" "}
              <span className="font-medium tabular-nums" data-testid="vivo-efectivo-en-caja">
                {formatearMoneda(turno.efectivo_en_caja)}
              </span>
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`turnos/${String(turno.id)}`}>Ver detalle del turno</Link>
        </Button>
      </div>
      <TotalesVentas
        titulo={`Totales del turno (${formatearNumero(turno.ventas_cantidad ?? 0)} ventas, sin anuladas)`}
        valores={turno}
        prefijoTestId="vivo"
      />
      <section className="flex flex-col gap-2" aria-label={`Ventas de ${turno.caja_nombre}`}>
        <h3 className="font-semibold">Ventas realizadas</h3>
        <VentasDelTurno turnoId={turno.id} />
      </section>
    </div>
  );
}

/**
 * Turnos abiertos de todas las cajas con sus totales y sus ventas, al día en vivo (los refresca
 * `useVentasEnVivo` desde la página). Con varios, una pestaña por caja.
 */
export function TurnosAbiertosEnVivo() {
  const abiertos = useTurnosAbiertosConTotales();
  const [elegido, setElegido] = useState<string | null>(null);

  if (abiertos.isPending) return <Cargando texto="Cargando turnos abiertos…" />;
  if (abiertos.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(abiertos.error)}</AlertDescription>
      </Alert>
    );
  }
  const turnos = abiertos.data;
  if (turnos.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-muted-foreground">
        No hay turnos abiertos. Abrí uno con "Abrir turno" en la barra de arriba.
      </p>
    );
  }
  const [primero] = turnos;
  if (turnos.length === 1 && primero) return <TurnoAbierto turno={primero} />;

  // Si el turno elegido se cerró, vuelve al primero.
  const valor =
    elegido !== null && turnos.some((t) => String(t.id) === elegido)
      ? elegido
      : String(turnos[0]?.id);
  return (
    <Tabs value={valor} onValueChange={setElegido} className="gap-4">
      <TabsList
        aria-label="Turnos abiertos"
        className="w-full flex-wrap group-data-horizontal/tabs:h-auto sm:w-fit"
      >
        {turnos.map((t) => (
          <TabsTrigger key={t.id} value={String(t.id)} className="px-3 py-1">
            {t.caja_nombre}
          </TabsTrigger>
        ))}
      </TabsList>
      {turnos.map((t) => (
        <TabsContent key={t.id} value={String(t.id)}>
          <TurnoAbierto turno={t} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
