import { ArrowLeft, LogOut } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import {
  formatearFechaHora,
  formatearLista,
  formatearMoneda,
  formatearNumero,
} from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Badge } from "@/compartido/ui/badge";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { DialogoCerrarTurno } from "@/modulos/caja/componentes/DialogoCerrarTurno";
import { useTurno, type Turno } from "../api/consultas";
import { useVentasEnVivo } from "../api/tiempo-real";
import { EstadoConexion } from "../componentes/EstadoConexion";
import { TotalesVentas } from "../componentes/TotalesVentas";
import { VentasDelTurno } from "../componentes/VentasDelTurno";

function Volver() {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to="/admin/ventas">
        <ArrowLeft aria-hidden />
        Volver a ventas
      </Link>
    </Button>
  );
}

type FilaEfectivo = [etiqueta: string, testId: string, valor: number | null];

function DatosEfectivo({ titulo, filas }: { titulo?: string; filas: FilaEfectivo[] }) {
  return (
    <div className="flex flex-col gap-2">
      {titulo && <h3 className="text-sm font-medium">{titulo}</h3>}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {filas.map(([etiqueta, testId, valor]) => (
          <div key={testId}>
            <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
            <dd className="font-medium tabular-nums" data-testid={testId}>
              {formatearMoneda(valor)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Efectivo de la caja del turno, todo calculado por `v_turnos`. Abierto: en vivo (inicial + ventas −
 * gastos, en efectivo). Cerrado: la foto del cierre (lo que volvió a la caja de cambio y las ventas en
 * efectivo de ese momento) separada de lo que hay hoy en vivo, porque lo anulado después del cierre
 * sale de la caja de cambio y no cambia la foto. `v_turnos` no guarda una foto de los gastos en
 * efectivo: solo se muestran en vivo.
 */
function EfectivoDeCaja({ turno }: { turno: Turno }) {
  if (turno.efectivo_inicial === null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="efectivo-sin-datos">
        Turno anterior al efectivo por turno: el efectivo de sus ventas fue directo a la caja de
        cambio.
      </p>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Efectivo de la caja</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {turno.abierto ? (
          <>
            <DatosEfectivo
              filas={[
                ["Efectivo inicial", "efectivo-inicial", turno.efectivo_inicial],
                ["Ventas en efectivo", "efectivo-ventas", turno.ventas_efectivo],
                ["Gastos en efectivo", "efectivo-gastos", turno.gastos_efectivo],
                ["Efectivo en caja", "efectivo-en-caja", turno.efectivo_en_caja],
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Al cerrar el turno, el efectivo en caja vuelve a la caja de cambio.
            </p>
          </>
        ) : (
          <>
            <DatosEfectivo
              titulo="Al cerrar el turno"
              filas={[
                ["Efectivo inicial", "efectivo-inicial", turno.efectivo_inicial],
                ["Ventas en efectivo al cerrar", "efectivo-ventas-cierre", turno.total_efectivo],
                ["Efectivo devuelto al cerrar", "efectivo-en-caja", turno.efectivo_en_caja],
              ]}
            />
            <DatosEfectivo
              titulo="Hoy, sin anuladas"
              filas={[
                ["Ventas en efectivo", "efectivo-ventas", turno.ventas_efectivo],
                ["Gastos en efectivo", "efectivo-gastos", turno.gastos_efectivo],
              ]}
            />
            <p className="text-xs text-muted-foreground">
              El efectivo devuelto volvió a la caja de cambio al cerrar el turno y no cambia. Lo que
              se anuló después del cierre salió de la caja de cambio: por eso los valores de hoy
              pueden no coincidir con los del cierre.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Un turno: totales, ventas (con anulación) y cierre si quedó abierto. Solo admin. */
export function DetalleTurno() {
  const id = Number(useParams().id);
  const idValido = Number.isInteger(id) && id > 0;
  const turno = useTurno(idValido ? id : 0);
  const enVivo = useVentasEnVivo();
  const [cerrando, setCerrando] = useState(false);

  if (!idValido || (turno.isSuccess && turno.data === null)) {
    return (
      <section className="flex flex-col gap-4">
        <Volver />
        <p className="text-muted-foreground">El turno no existe.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <Volver />
      {turno.isPending ? (
        <Cargando texto="Cargando turno…" />
      ) : turno.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(turno.error)}</AlertDescription>
        </Alert>
      ) : (
        turno.data && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
                  {turno.data.caja_nombre}
                  {turno.data.abierto ? (
                    <Badge>Abierto</Badge>
                  ) : (
                    <Badge variant="secondary">Cerrado</Badge>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Apertura {formatearFechaHora(turno.data.abierto_en)}
                  {turno.data.abierto_por_nombre && ` por ${turno.data.abierto_por_nombre}`}
                  {turno.data.cerrado_en &&
                    ` · cierre ${formatearFechaHora(turno.data.cerrado_en)}`}
                </p>
                <p className="text-sm">
                  {turno.data.atendido_por && turno.data.atendido_por.length > 0
                    ? `Atendieron: ${formatearLista(turno.data.atendido_por)}`
                    : "Todavía nadie vendió ni cargó gastos en este turno."}
                </p>
                {turno.data.observaciones && (
                  <p className="text-sm">Observaciones: {turno.data.observaciones}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <EstadoConexion {...enVivo} />
                {turno.data.abierto && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCerrando(true);
                    }}
                  >
                    <LogOut aria-hidden />
                    Cerrar este turno
                  </Button>
                )}
              </div>
            </div>

            <TotalesVentas
              titulo={`Totales (${formatearNumero(turno.data.ventas_cantidad ?? 0)} ventas, sin anuladas)`}
              valores={turno.data}
            />
            <EfectivoDeCaja turno={turno.data} />

            <section aria-labelledby="titulo-ventas-turno" className="flex flex-col gap-3">
              <h2 id="titulo-ventas-turno" className="text-lg font-semibold">
                Ventas
              </h2>
              <VentasDelTurno turnoId={turno.data.id} />
            </section>

            {cerrando && (
              <DialogoCerrarTurno
                turnoId={turno.data.id}
                descripcion={`${turno.data.caja_nombre}. Nadie va a poder registrar más ventas en este turno y el efectivo de la caja vuelve a la caja de cambio.`}
                onCerrar={() => {
                  setCerrando(false);
                }}
              />
            )}
          </>
        )
      )}
    </section>
  );
}
