import { LogOut } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useAuth } from "@/modulos/auth/contexto";
import { useComprobantesDeTurno } from "@/modulos/facturacion/api/consultas";
import { FacturaDeVenta } from "@/modulos/facturacion/componentes/FacturaDeVenta";
import { useCategorias, useServicios } from "@/modulos/servicios/api/consultas";
import { useTurnoActual, useVentasDeTurno, type TurnoActual } from "../api/consultas";
import { AbrirTurno } from "../componentes/AbrirTurno";
import { DialogoCerrarTurno } from "../componentes/DialogoCerrarTurno";
import { FormularioVenta } from "../componentes/FormularioVenta";
import { TablaVentas } from "../componentes/TablaVentas";

function MensajeError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{mensajeDeError(error)}</AlertDescription>
    </Alert>
  );
}

function TurnoAbierto({ turno }: { turno: TurnoActual }) {
  const categorias = useCategorias();
  const servicios = useServicios();
  const ventas = useVentasDeTurno(turno.id);
  const comprobantes = useComprobantesDeTurno(turno.id);
  const [cerrando, setCerrando] = useState(false);
  const caja = turno.cajas?.nombre ?? "";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{caja}</h1>
          <p className="text-sm text-muted-foreground">
            Turno abierto desde {formatearFechaHora(turno.abierto_en)}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setCerrando(true);
          }}
        >
          <LogOut aria-hidden />
          Cerrar turno
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {categorias.isPending || servicios.isPending ? (
          <Cargando texto="Cargando servicios…" />
        ) : categorias.isError || servicios.isError ? (
          <MensajeError error={categorias.error ?? servicios.error} />
        ) : (
          <FormularioVenta categorias={categorias.data} servicios={servicios.data} />
        )}

        <section aria-labelledby="titulo-ventas" className="flex min-w-0 flex-col gap-3">
          <h2 id="titulo-ventas" className="text-lg font-semibold">
            Ventas del turno
          </h2>
          {ventas.isPending ? (
            <Cargando texto="Cargando ventas…" />
          ) : ventas.isError ? (
            <MensajeError error={ventas.error} />
          ) : (
            <>
              {comprobantes.isError && <MensajeError error={comprobantes.error} />}
              <TablaVentas
                ventas={ventas.data}
                acciones={(venta) =>
                  comprobantes.data && (
                    <FacturaDeVenta
                      venta={venta}
                      anulada={venta.anulada}
                      comprobantes={comprobantes.data.filter((c) => c.venta_id === venta.id)}
                    />
                  )
                }
              />
            </>
          )}
        </section>
      </div>

      {cerrando && (
        <DialogoCerrarTurno
          descripcion={`${caja}. Después de cerrar no vas a poder registrar más ventas en este turno.`}
          onCerrar={() => {
            setCerrando(false);
          }}
        />
      )}
    </section>
  );
}

/** Pantalla de caja: sin turno abierto → abrir uno; con turno → vender, ver ventas y cerrar. */
export function Caja() {
  const { perfil } = useAuth();
  // RutaProtegida no deja llegar sin perfil; igual no se queda cargando para siempre.
  if (!perfil) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No hay una sesión activa. Volvé a ingresar.</AlertDescription>
      </Alert>
    );
  }
  return <CajaDelUsuario usuarioId={perfil.id} />;
}

function CajaDelUsuario({ usuarioId }: { usuarioId: string }) {
  const turno = useTurnoActual(usuarioId);

  if (turno.isPending) return <Cargando texto="Cargando tu turno…" />;
  if (turno.isError) return <MensajeError error={turno.error} />;
  return turno.data ? <TurnoAbierto turno={turno.data} /> : <AbrirTurno />;
}
