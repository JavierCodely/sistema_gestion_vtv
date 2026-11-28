import { Ban, History, ShoppingCart, Wallet } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda } from "@/compartido/lib/formato";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useAuth } from "@/modulos/auth/contexto";
import { useComprobantesDeTurno } from "@/modulos/facturacion/api/consultas";
import { FacturaDeVenta } from "@/modulos/facturacion/componentes/FacturaDeVenta";
import { useGastosDeTurno } from "@/modulos/gastos/api/consultas";
import { DialogoGasto } from "@/modulos/gastos/componentes/DialogoGasto";
import { TablaGastos } from "@/modulos/gastos/componentes/TablaGastos";
import { useCategorias, useServicios } from "@/modulos/servicios/api/consultas";
import {
  useCajasAbiertas,
  useEfectivoEnCaja,
  useVentasDeTurno,
  type CajaAbierta,
  type Venta,
} from "../api/consultas";
import { DialogoAnularVenta } from "../componentes/DialogoAnularVenta";
import { ElegirCaja } from "../componentes/ElegirCaja";
import { FormularioVenta } from "../componentes/FormularioVenta";
import { SelectorCaja } from "../componentes/SelectorCaja";
import { SinCajasAbiertas } from "../componentes/SinCajasAbiertas";
import { TablaVentas } from "../componentes/TablaVentas";
import { FiltrosVentas } from "../componentes/FiltrosVentas";
import { DialogoCertificadosServicios } from "../componentes/DialogoCertificadosServicios";
import { ResumenVentasTurno } from "../componentes/ResumenVentasTurno";
import { filtrarVentas, hayFiltros, SIN_FILTROS, type FiltroVentas } from "../lib/filtrar-ventas";
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
  usuarioId,
  onCambiarCaja,
  onTurnoNoDisponible,
}: {
  caja: CajaAbierta;
  cajas: readonly CajaAbierta[];
  esAdmin: boolean;
  usuarioId: string;
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
        {vista === "historial" && (
          <PanelHistorial key={caja.id} turnoId={caja.id} esAdmin={esAdmin} usuarioId={usuarioId} />
        )}
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

/**
 * Efectivo del cajón de la caja donde se trabaja (decisión 2026-11-24, migración 47). Con el total de
 * realizadas y anuladas (migración 50), es lo único de dinero del turno que ve el cajero; los totales
 * por medio siguen siendo del admin.
 */
function EfectivoEnCaja({ turnoId }: { turnoId: number }) {
  const efectivo = useEfectivoEnCaja(turnoId);
  return (
    <div
      className="flex flex-col gap-1 rounded-md border bg-muted/40 px-5 py-3"
      data-testid="efectivo-en-caja"
    >
      <span className="text-base text-muted-foreground">Efectivo en caja</span>
      {efectivo.isPending ? (
        <span className="text-xl text-muted-foreground">Cargando…</span>
      ) : efectivo.isError ? (
        <span className="text-base text-destructive">{mensajeDeError(efectivo.error)}</span>
      ) : (
        <span className="text-3xl font-bold tabular-nums">{formatearMoneda(efectivo.data)}</span>
      )}
    </div>
  );
}

/**
 * Historial de la caja: efectivo en caja, búsqueda por patente (desde 3 caracteres, solo las ventas de
 * este turno) y las ventas con factura y "Anular". El cajero anula solo las suyas (la BD lo controla);
 * el admin, cualquiera.
 */
function PanelHistorial({
  turnoId,
  esAdmin,
  usuarioId,
}: {
  turnoId: number;
  esAdmin: boolean;
  usuarioId: string;
}) {
  const ventas = useVentasDeTurno(turnoId);
  const comprobantes = useComprobantesDeTurno(turnoId);
  const [filtro, setFiltro] = useState<FiltroVentas>(SIN_FILTROS);
  const [anulando, setAnulando] = useState<Venta | null>(null);

  const facturada = (venta: Venta) =>
    comprobantes.data?.some(
      (c) => c.venta_id === venta.id && c.tipo === "factura" && c.estado === "autorizado",
    ) ?? false;

  return (
    <section aria-labelledby="titulo-ventas" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="titulo-ventas" className="text-2xl font-semibold">
          Ventas de la caja
        </h2>
        <div className="flex flex-wrap items-stretch gap-3">
          <EfectivoEnCaja turnoId={turnoId} />
          <ResumenVentasTurno turnoId={turnoId} grande />
          <DialogoCertificadosServicios turnoId={turnoId} grande />
        </div>
      </div>
      {ventas.data && <FiltrosVentas grande ventas={ventas.data} onCambiar={setFiltro} />}
      {ventas.isPending ? (
        <Cargando texto="Cargando ventas…" />
      ) : ventas.isError ? (
        <MensajeError error={ventas.error} />
      ) : (
        <>
          {comprobantes.isError && <MensajeError error={comprobantes.error} />}
          <div className="[&_table]:text-lg">
            <TablaVentas
              ventas={filtrarVentas(ventas.data, filtro)}
              vacio={
                hayFiltros(filtro) ? "No hay ventas en este turno con esos filtros." : undefined
              }
              acciones={(venta) => (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {comprobantes.data && (
                    <FacturaDeVenta
                      venta={venta}
                      anulada={venta.anulada}
                      comprobantes={comprobantes.data.filter((c) => c.venta_id === venta.id)}
                    />
                  )}
                  {!venta.anulada && (esAdmin || venta.usuario_id === usuarioId) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Anular venta N° ${String(venta.id)}`}
                      onClick={() => {
                        setAnulando(venta);
                      }}
                    >
                      <Ban aria-hidden />
                      Anular
                    </Button>
                  )}
                </div>
              )}
            />
          </div>
        </>
      )}
      {anulando && (
        <DialogoAnularVenta
          venta={anulando}
          emitirNotaDeCredito={esAdmin}
          facturada={facturada(anulando)}
          onCerrar={() => {
            setAnulando(null);
          }}
        />
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
        usuarioId={perfil.id}
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
