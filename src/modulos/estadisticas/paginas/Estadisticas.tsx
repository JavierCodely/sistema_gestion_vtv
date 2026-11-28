import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { FiltroPeriodo } from "@/compartido/componentes/FiltroPeriodo";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import {
  DIAS_SEMANA,
  nombreDePeriodo,
  periodoActual,
  rangoDePeriodo,
  type Periodo,
} from "@/compartido/lib/periodo";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/compartido/ui/card";
import { GraficoColumnas } from "@/modulos/dashboard/componentes/GraficoColumnas";
import { GraficoRanking } from "@/modulos/dashboard/componentes/GraficoRanking";
import { Bloque, Dato } from "@/modulos/dashboard/componentes/Tarjetas";
import {
  useEstadisticasCategorias,
  useEstadisticasCondicionales,
  useEstadisticasHorarios,
  useEstadisticasVehiculos,
} from "../api/consultas";
import { ComparacionAnual } from "../componentes/ComparacionAnual";

const ventas = (n: number) => `${formatearNumero(n)} ${n === 1 ? "venta" : "ventas"}`;

function ErrorDeCarga({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{mensajeDeError(error)}</AlertDescription>
    </Alert>
  );
}

function SeccionVehiculos({ rango }: { rango: RangoFechas }) {
  const datos = useEstadisticasVehiculos(rango);
  const categorias = useEstadisticasCategorias(rango);
  if (datos.isPending) return <Cargando texto="Contando vehículos…" />;
  if (datos.isError) return <ErrorDeCarga error={datos.error} />;
  const d = datos.data;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Dato
          id="vehiculos"
          etiqueta="Vehículos distintos"
          valor={formatearNumero(d.vehiculos)}
          detalle={`${ventas(d.ventas_cantidad)} · ${formatearMoneda(d.ventas_total)}${
            d.ventas_sin_patente > 0 ? ` · ${ventas(d.ventas_sin_patente)} sin patente` : ""
          }`}
        />
        <Dato
          id="vehiculos-nuevos"
          etiqueta="Vinieron por primera vez"
          valor={formatearNumero(d.vehiculos_nuevos)}
          detalle="La patente no tenía ventas anteriores."
        />
        <Dato
          id="vehiculos-vuelven"
          etiqueta="Ya habían venido antes"
          valor={formatearNumero(d.vehiculos_que_vuelven)}
          detalle="La patente tenía ventas de antes del período."
        />
        <Dato
          id="vehiculos-repetidos"
          etiqueta="Vinieron más de una vez"
          valor={formatearNumero(d.vehiculos_repetidos)}
          detalle="En el período, sin contar la vuelta de una condicional."
        />
        <Dato id="ticket" etiqueta="Ticket promedio" valor={formatearMoneda(d.ticket_promedio)} />
        <Dato
          id="anuladas"
          etiqueta="Ventas anuladas"
          valor={formatearNumero(d.anuladas_cantidad)}
          detalle={formatearMoneda(d.anuladas_total)}
        />
      </div>
      <Bloque
        titulo="Tipo de vehículo"
        descripcion="Vehículos distintos por categoría de servicio, de más a menos."
        vacio={categorias.data?.length === 0 ? "No hay ventas en ese período." : null}
      >
        {categorias.isPending ? (
          <Cargando texto="Calculando categorías…" />
        ) : categorias.isError ? (
          <ErrorDeCarga error={categorias.error} />
        ) : (
          <GraficoRanking
            idBase="tipo"
            filas={categorias.data.map((c) => ({
              nombre: c.nombre,
              cantidad: c.vehiculos,
              total: c.total,
            }))}
            medida="cantidad"
            etiquetaMedida="Vehículos"
            etiquetaCantidad="Vehículos"
          />
        )}
      </Bloque>
    </>
  );
}

function SeccionCondicionales({ rango }: { rango: RangoFechas }) {
  const datos = useEstadisticasCondicionales(rango);
  if (datos.isPending) return <Cargando texto="Calculando condicionales…" />;
  if (datos.isError) return <ErrorDeCarga error={datos.error} />;
  const c = datos.data;
  if (c.condicionales === 0) {
    return <p className="text-muted-foreground">No se vendieron condicionales en ese período.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Dato
        id="condicionales"
        etiqueta="Condicionales"
        valor={formatearNumero(c.condicionales)}
        detalle={`${formatearNumero(c.al_50)} pagadas al 50%`}
      />
      <Dato
        id="volvieron-en-plazo"
        etiqueta="Volvieron a tiempo"
        valor={formatearNumero(c.volvieron_en_plazo)}
      />
      <Dato
        id="volvieron-fuera-plazo"
        etiqueta="Volvieron fuera de plazo"
        valor={formatearNumero(c.volvieron_fuera_plazo)}
      />
      <Dato
        id="cobradas-de-nuevo"
        etiqueta="Vencieron y se cobraron de nuevo"
        valor={formatearNumero(c.cobradas_de_nuevo)}
      />
      <Dato
        id="vigentes"
        etiqueta="Todavía pueden volver"
        valor={formatearNumero(c.vigentes_sin_volver)}
      />
      <Dato
        id="vencidas"
        etiqueta="Vencieron sin volver"
        valor={formatearNumero(c.vencidas_sin_volver)}
      />
    </div>
  );
}

function SeccionHorarios({ rango }: { rango: RangoFechas }) {
  const datos = useEstadisticasHorarios(rango);
  if (datos.isPending) return <Cargando texto="Calculando horarios…" />;
  if (datos.isError) return <ErrorDeCarga error={datos.error} />;
  const { dias, horas } = datos.data;
  const sinVentas = horas.length === 0 ? "No hay ventas en ese período." : null;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Bloque
        titulo="Por día de la semana"
        descripcion="Cantidad de ventas de cada día, de lunes a domingo."
        vacio={sinVentas}
      >
        <GraficoColumnas
          idBase="dia"
          etiquetaNombre="Día"
          filas={dias.map((d) => {
            const nombre = DIAS_SEMANA[d.valor - 1] ?? "";
            return { nombre, corto: nombre.slice(0, 3), cantidad: d.cantidad, total: d.total };
          })}
        />
      </Bloque>
      <Bloque
        titulo="Por hora"
        descripcion="Cantidad de ventas que empezaron en cada hora (sin las ventas con fecha pasada)."
        vacio={sinVentas}
      >
        <GraficoColumnas
          idBase="hora"
          etiquetaNombre="Hora"
          filas={horas.map((h) => ({
            nombre: `De ${String(h.valor)} a ${String(h.valor + 1)} h`,
            corto: `${String(h.valor)} h`,
            cantidad: h.cantidad,
            total: h.total,
          }))}
        />
      </Bloque>
    </div>
  );
}

/**
 * Estadísticas del admin para el año (o el mes) elegido: vehículos distintos, nuevos y que vuelven,
 * tipo de vehículo (categoría), condicionales, horarios pico y el año contra el anterior. Todos los
 * números los calcula la BD (migración 51); sin anuladas salvo en "Ventas anuladas".
 */
export function Estadisticas() {
  const [periodo, setPeriodo] = useState<Periodo>(() => ({
    anio: periodoActual().anio,
    mes: null,
  }));
  const rango = rangoDePeriodo(periodo);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Estadísticas</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{nombreDePeriodo(periodo)}</h2>
          </CardTitle>
          <CardDescription>Elegí un año y, si querés, un mes.</CardDescription>
        </CardHeader>
        <CardContent>
          <FiltroPeriodo idBase="estadisticas" periodo={periodo} onPeriodo={setPeriodo} />
        </CardContent>
      </Card>

      <section aria-labelledby="titulo-estadisticas-vehiculos" className="flex flex-col gap-4">
        <h2 id="titulo-estadisticas-vehiculos" className="text-lg font-semibold">
          Vehículos
        </h2>
        <SeccionVehiculos rango={rango} />
      </section>
      <section aria-labelledby="titulo-estadisticas-condicionales" className="flex flex-col gap-4">
        <h2 id="titulo-estadisticas-condicionales" className="text-lg font-semibold">
          Condicionales
        </h2>
        <SeccionCondicionales rango={rango} />
      </section>
      <section aria-labelledby="titulo-estadisticas-horarios" className="flex flex-col gap-4">
        <h2 id="titulo-estadisticas-horarios" className="text-lg font-semibold">
          Horarios pico
        </h2>
        <SeccionHorarios rango={rango} />
      </section>
      <section aria-labelledby="titulo-estadisticas-comparacion" className="flex flex-col gap-4">
        <h2 id="titulo-estadisticas-comparacion" className="text-lg font-semibold">
          Año contra año
        </h2>
        <ComparacionAnual anio={periodo.anio} />
      </section>
    </section>
  );
}
