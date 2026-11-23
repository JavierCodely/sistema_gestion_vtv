import { useState, type ReactNode } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { FiltroPeriodo } from "@/compartido/componentes/FiltroPeriodo";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearFechaHora, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import {
  nombreDePeriodo,
  periodoActual,
  rangoDePeriodo,
  type Periodo,
} from "@/compartido/lib/periodo";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/compartido/ui/card";
import { useTurnosDelPeriodo } from "@/modulos/ventas/api/consultas";
import {
  useResumenGastos,
  useResumenVentas,
  type FilaResumenGastos,
  type FilaResumenVentas,
  type FiltroDashboard,
} from "../api/consultas";
import { GraficoRanking, type FilaRanking } from "../componentes/GraficoRanking";
import { VentasDeLaSemana } from "../componentes/VentasDeLaSemana";

const aRanking = (fila: FilaResumenVentas | FilaResumenGastos): FilaRanking => ({
  nombre: fila.nombre,
  cantidad: fila.cantidad,
  total: fila.total,
  extra: "total_descontado" in fila ? fila.total_descontado : undefined,
});

/** Tarjeta de un número grande (KPI). */
function Dato({
  etiqueta,
  valor,
  detalle,
  id,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  id: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{etiqueta}</CardDescription>
        <CardTitle className="text-2xl tabular-nums" data-testid={`dato-${id}`}>
          {valor}
        </CardTitle>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardHeader>
    </Card>
  );
}

/** Bloque con título, descripción y su contenido o el estado vacío. */
function Bloque({
  titulo,
  descripcion,
  vacio,
  children,
}: {
  titulo: string;
  descripcion: string;
  vacio: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{titulo}</h3>
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        {vacio ? <p className="py-6 text-center text-muted-foreground">{vacio}</p> : children}
      </CardContent>
    </Card>
  );
}

function SeccionVentas({ filtro }: { filtro: FiltroDashboard }) {
  const resumen = useResumenVentas(filtro);
  if (resumen.isPending) return <Cargando texto="Calculando ventas…" />;
  if (resumen.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
      </Alert>
    );
  }
  const { total, servicios, categorias, descuentos } = resumen.data;
  const sinVentas = (total?.cantidad ?? 0) === 0 ? "No hay ventas en ese período." : null;
  const ventasConDescuento = descuentos.reduce((n, d) => n + d.cantidad, 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Dato id="ventas" etiqueta="Ventas" valor={formatearNumero(total?.cantidad ?? 0)} />
        <Dato id="vendido" etiqueta="Total vendido" valor={formatearMoneda(total?.total)} />
        <Dato
          id="descuentos"
          etiqueta="Descuentos realizados"
          valor={formatearNumero(ventasConDescuento)}
          detalle={`Descontado: ${formatearMoneda(total?.total_descontado)}`}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Bloque
          titulo="Servicios más vendidos"
          descripcion="Cantidad de ventas por servicio, del más vendido al menos."
          vacio={sinVentas}
        >
          <GraficoRanking
            idBase="servicio"
            filas={servicios.map(aRanking)}
            medida="cantidad"
            etiquetaMedida="Ventas"
          />
        </Bloque>
        <Bloque
          titulo="Categorías más vendidas"
          descripcion="Cantidad de ventas por categoría de servicio."
          vacio={sinVentas}
        >
          <GraficoRanking
            idBase="categoria"
            filas={categorias.map(aRanking)}
            medida="cantidad"
            etiquetaMedida="Ventas"
          />
        </Bloque>
      </div>
      <Bloque
        titulo="Descuentos"
        descripcion="Cuántas ventas usaron cada descuento, lo cobrado y lo descontado."
        vacio={descuentos.length === 0 ? "No se hicieron descuentos en ese período." : null}
      >
        <GraficoRanking
          idBase="descuento"
          filas={descuentos.map(aRanking)}
          medida="cantidad"
          etiquetaMedida="Ventas"
          etiquetaExtra="Descontado"
        />
      </Bloque>
    </>
  );
}

function SeccionGastos({ filtro }: { filtro: FiltroDashboard }) {
  const resumen = useResumenGastos(filtro);
  if (resumen.isPending) return <Cargando texto="Calculando gastos…" />;
  if (resumen.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
      </Alert>
    );
  }
  const { total, compraCertificados, otrosGastos, rubros, subcategorias } = resumen.data;
  const sinGastos = (total?.cantidad ?? 0) === 0 ? "No hay gastos en ese período." : null;
  const cantidad = (n: number | undefined) =>
    `${formatearNumero(n ?? 0)} ${n === 1 ? "gasto" : "gastos"}`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Dato
          id="gastos"
          etiqueta="Gastos"
          valor={formatearMoneda(total?.total)}
          detalle={cantidad(total?.cantidad)}
        />
        <Dato
          id="compra-certificados"
          etiqueta="Compra de certificados"
          valor={formatearMoneda(compraCertificados?.total)}
          detalle={cantidad(compraCertificados?.cantidad)}
        />
        <Dato
          id="otros-gastos"
          etiqueta="Otros gastos"
          valor={formatearMoneda(otrosGastos?.total)}
          detalle={cantidad(otrosGastos?.cantidad)}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Bloque
          titulo="¿En qué se gastó más?"
          descripcion="Total por rubro, de mayor a menor."
          vacio={sinGastos}
        >
          <GraficoRanking
            idBase="rubro"
            filas={rubros.map(aRanking)}
            medida="total"
            etiquetaMedida="Gastado"
          />
        </Bloque>
        <Bloque
          titulo="Detalle por subcategoría"
          descripcion="Total por subcategoría (rubro › subcategoría)."
          vacio={sinGastos}
        >
          <GraficoRanking
            idBase="subcategoria"
            filas={subcategorias.map(aRanking)}
            medida="total"
            etiquetaMedida="Gastado"
          />
        </Bloque>
      </div>
    </>
  );
}

/**
 * Dashboard del admin: ventas de la semana en la que estamos y, para el período elegido (año, mes
 * o un turno), ventas por servicio y categoría, descuentos y gastos. Todos los números los calcula
 * la BD (`ventas_por_dia`, `resumen_dashboard`, `resumen_gastos`); sin anuladas.
 */
export function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoActual());
  const [turnoId, setTurnoId] = useState<number | null>(null);
  const rango = rangoDePeriodo(periodo);
  const turnos = useTurnosDelPeriodo(rango);
  const filtro: FiltroDashboard = { rango, turnoId };
  const opciones = turnos.data?.map((t) => ({
    id: t.id,
    etiqueta: `${t.caja_nombre} · ${formatearFechaHora(t.abierto_en)}`,
  }));
  const turno = opciones?.find((t) => t.id === turnoId);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <VentasDeLaSemana />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{turno ? `Turno de ${turno.etiqueta}` : nombreDePeriodo(periodo)}</h2>
          </CardTitle>
          <CardDescription>Elegí un año (y si querés un mes) o un turno.</CardDescription>
        </CardHeader>
        <CardContent>
          <FiltroPeriodo
            idBase="dashboard"
            periodo={periodo}
            onPeriodo={setPeriodo}
            turnoId={turnoId}
            onTurno={setTurnoId}
            turnos={opciones}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="titulo-dashboard-ventas" className="flex flex-col gap-4">
        <h2 id="titulo-dashboard-ventas" className="text-lg font-semibold">
          Ventas
        </h2>
        <SeccionVentas filtro={filtro} />
      </section>
      <section aria-labelledby="titulo-dashboard-gastos" className="flex flex-col gap-4">
        <h2 id="titulo-dashboard-gastos" className="text-lg font-semibold">
          Gastos
        </h2>
        <SeccionGastos filtro={filtro} />
      </section>
    </section>
  );
}
