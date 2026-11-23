import { History, ShoppingCart, Wallet } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useAuth } from "@/modulos/auth/contexto";
import { useComprobantesDeTurno } from "@/modulos/facturacion/api/consultas";
import { FacturaDeVenta } from "@/modulos/facturacion/componentes/FacturaDeVenta";
import { useGastosDeTurno } from "@/modulos/gastos/api/consultas";
import { DialogoGasto } from "@/modulos/gastos/componentes/DialogoGasto";
import { TablaGastos } from "@/modulos/gastos/componentes/TablaGastos";
import { useCategorias, useServicios } from "@/modulos/servicios/api/consultas";
import { useCajasAbiertas, useVentasDeTurno, type CajaAbierta } from "../api/consultas";
import { ElegirCaja } from "../componentes/ElegirCaja";
import { FormularioVenta } from "../componentes/FormularioVenta";
import { SelectorCaja } from "../componentes/SelectorCaja";
import { SinCajasAbiertas } from "../componentes/SinCajasAbiertas";
import { TablaVentas } from "../componentes/TablaVentas";
import {
  aEleccion,
  cajaInicial,
  estadoEleccion,
  guardarCajaElegida,
  leerCajaGuardada,
  type Eleccion,
} from "../lib/caja-elegida";

function MensajeError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{mensajeDeError(error)}</AlertDescription>
    </Alert>
  );
}

type Vista = "ventas" | "historial" | "gastos";

const VISTAS: { vista: Vista; etiqueta: string; icono: typeof ShoppingCart }[] = [
  { vista: "ventas", etiqueta: "Ventas", icono: ShoppingCart },
  { vista: "historial", etiqueta: "Historial", icono: History },
  { vista: "gastos", etiqueta: "Gastos", icono: Wallet },
];

function CajaDeTrabajo({
  caja,
  cajas,
  esAdmin,
  onCambiarCaja,
  onTurnoNoDisponible,
}: {
  caja: CajaAbierta;
  cajas: readonly CajaAbierta[];
  esAdmin: boolean;
  onCambiarCaja: (caja: CajaAbierta) => void;
  onTurnoNoDisponible: (mensaje: string) => void;
}) {
  const [vista, setVista] = useState<Vista>("ventas");

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col gap-1">
          {cajas.length > 1 ? (
            <SelectorCaja cajas={cajas} actual={caja} onCambiar={onCambiarCaja} />
          ) : (
            <h1 className="text-3xl font-bold md:text-4xl">{caja.caja_nombre}</h1>
          )}
          <p className="text-base text-muted-foreground">
            Turno abierto desde {formatearFechaHora(caja.abierto_en)}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Secciones de la caja"
          className="flex flex-wrap justify-center gap-2"
        >
          {VISTAS.map(({ vista: valor, etiqueta, icono: Icono }) => (
            <Button
              key={valor}
              role="tab"
              id={`pestana-${valor}`}
              aria-selected={vista === valor}
              aria-controls={`panel-${valor}`}
              variant={vista === valor ? "default" : "outline"}
              className="h-14 min-w-40 px-6 text-xl font-bold tracking-wide uppercase"
              onClick={() => {
                setVista(valor);
              }}
            >
              <Icono aria-hidden className="size-6" />
              {etiqueta}
            </Button>
          ))}
        </div>
        {/* Columna vacía para centrar las pestañas. */}
        <div aria-hidden className="hidden lg:block" />
      </div>

      <div role="tabpanel" id={`panel-${vista}`} aria-labelledby={`pestana-${vista}`}>
        {/* `key`: al cambiar de caja, la venta en curso no pasa a la otra caja. */}
        {vista === "ventas" && (
          <PanelVentas key={caja.id} turnoId={caja.id} onTurnoNoDisponible={onTurnoNoDisponible} />
        )}
        {vista === "historial" && <PanelHistorial turnoId={caja.id} />}
        {vista === "gastos" && (
          <PanelGastos key={caja.id} turnoId={caja.id} caja={caja.caja_nombre} esAdmin={esAdmin} />
        )}
      </div>
    </section>
  );
}

function PanelVentas({
  turnoId,
  onTurnoNoDisponible,
}: {
  turnoId: number;
  onTurnoNoDisponible: (mensaje: string) => void;
}) {
  const categorias = useCategorias();
  const servicios = useServicios();
  if (categorias.isPending || servicios.isPending) return <Cargando texto="Cargando servicios…" />;
  if (categorias.isError || servicios.isError) {
    return <MensajeError error={categorias.error ?? servicios.error} />;
  }
  return (
    <FormularioVenta
      turnoId={turnoId}
      categorias={categorias.data}
      servicios={servicios.data}
      onTurnoNoDisponible={onTurnoNoDisponible}
    />
  );
}

function PanelHistorial({ turnoId }: { turnoId: number }) {
  const ventas = useVentasDeTurno(turnoId);
  const comprobantes = useComprobantesDeTurno(turnoId);
  return (
    <section aria-labelledby="titulo-ventas" className="flex min-w-0 flex-col gap-3">
      <h2 id="titulo-ventas" className="text-2xl font-semibold">
        Ventas de la caja
      </h2>
      {ventas.isPending ? (
        <Cargando texto="Cargando ventas…" />
      ) : ventas.isError ? (
        <MensajeError error={ventas.error} />
      ) : (
        <>
          {comprobantes.isError && <MensajeError error={comprobantes.error} />}
          <div className="[&_table]:text-lg">
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
          </div>
        </>
      )}
    </section>
  );
}

function PanelGastos({
  turnoId,
  caja,
  esAdmin,
}: {
  turnoId: number;
  caja: string;
  esAdmin: boolean;
}) {
  const gastos = useGastosDeTurno(turnoId);
  const [cargandoGasto, setCargandoGasto] = useState(false);
  return (
    <section aria-labelledby="titulo-gastos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-gastos" className="text-2xl font-semibold">
          Gastos de la caja
        </h2>
        <Button
          className="h-12 px-5 text-lg"
          onClick={() => {
            setCargandoGasto(true);
          }}
        >
          <Wallet aria-hidden />
          Registrar gasto
        </Button>
      </div>
      {gastos.isPending ? (
        <Cargando texto="Cargando gastos…" />
      ) : gastos.isError ? (
        <MensajeError error={gastos.error} />
      ) : (
        <>
          <div className="[&_table]:text-lg">
            <TablaGastos
              gastos={gastos.data.pages.flat()}
              conUsuario
              vacio="Todavía no hay gastos en este turno."
            />
          </div>
          {gastos.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={gastos.isFetchingNextPage}
              onClick={() => void gastos.fetchNextPage()}
            >
              {gastos.isFetchingNextPage ? "Cargando…" : "Ver más gastos"}
            </Button>
          )}
        </>
      )}
      {cargandoGasto && (
        <DialogoGasto
          soloCaja={!esAdmin}
          turnoId={turnoId}
          descripcion={`Queda registrado a tu nombre en ${caja}, en este turno. Si es en efectivo, sale del efectivo de la caja.`}
          onCerrar={() => {
            setCargandoGasto(false);
          }}
        />
      )}
    </section>
  );
}

/**
 * Pantalla de caja (cajero y admin): el turno es de la caja y cualquier usuario activo trabaja en
 * cualquier caja abierta. Sin cajas abiertas → esperar (cajero) o abrir una (admin); con una sola,
 * queda elegida; con varias, se elige (y se recuerda la última). Toda venta y gasto va al turno de la
 * caja elegida. Si se cierra, se vuelve a elegir con un aviso. Abrir y cerrar turnos está en la barra
 * fija del layout (solo admin).
 */
export function Caja() {
  const { perfil } = useAuth();
  const cajas = useCajasAbiertas({ reconsultar: true });
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);

  // Al llegar la lista sin nada elegido: la última caja elegida si sigue abierta, o la única abierta.
  // (Ajuste de estado durante el render: no hay efecto ni un render intermedio sin caja).
  if (cajas.data && eleccion === null) {
    const inicial = cajaInicial(cajas.data, leerCajaGuardada());
    if (inicial) setEleccion(aEleccion(inicial));
  }

  // RutaProtegida no deja llegar sin perfil; igual no se queda cargando para siempre.
  if (!perfil) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No hay una sesión activa. Volvé a ingresar.</AlertDescription>
      </Alert>
    );
  }
  if (cajas.isPending) return <Cargando texto="Cargando las cajas abiertas…" />;
  if (cajas.isError) return <MensajeError error={cajas.error} />;

  const esAdmin = perfil.rol === "admin";
  const estado = estadoEleccion(cajas.data, eleccion);

  function elegir(caja: CajaAbierta) {
    guardarCajaElegida(caja.caja_id);
    setEleccion(aEleccion(caja));
  }

  if (estado.tipo === "trabajando") {
    return (
      <CajaDeTrabajo
        caja={estado.caja}
        cajas={cajas.data}
        esAdmin={esAdmin}
        onCambiarCaja={elegir}
        onTurnoNoDisponible={(mensaje) => {
          setEleccion({ ...aEleccion(estado.caja), aviso: mensaje });
        }}
      />
    );
  }
  if (cajas.data.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {estado.aviso && (
          <Alert variant="destructive" className="mx-auto w-full max-w-xl">
            <AlertDescription>{estado.aviso}</AlertDescription>
          </Alert>
        )}
        <SinCajasAbiertas esAdmin={esAdmin} />
      </div>
    );
  }
  return <ElegirCaja cajas={cajas.data} aviso={estado.aviso} onElegir={elegir} />;
}
