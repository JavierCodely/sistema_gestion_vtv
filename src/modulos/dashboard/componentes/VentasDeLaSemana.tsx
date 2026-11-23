import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearDia, formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { formatearEje } from "../lib/formato";
import { DIAS_SEMANA, semanaActual, sumarDias } from "@/compartido/lib/periodo";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/compartido/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/compartido/ui/chart";
import { useVentasPorDia } from "../api/consultas";

const config = {
  total: { label: "Vendido", color: "var(--chart-3)" },
} satisfies ChartConfig;

/**
 * Ventas de la semana en la que estamos, de lunes a domingo, en barras. La BD trae solo los días
 * que ya pasaron (un lunes, solo el lunes): los demás quedan en el eje sin barra. Abajo, el día que
 * más se vendió y cada día con su cantidad y total.
 */
export function VentasDeLaSemana() {
  const semana = semanaActual();
  const consulta = useVentasPorDia(semana);

  const dias = DIAS_SEMANA.map((nombre, i) => {
    const fecha = sumarDias(semana.desde, i);
    const datos = consulta.data?.find((d) => d.fecha === fecha);
    return {
      nombre,
      corto: nombre.slice(0, 3),
      fecha,
      cantidad: datos?.cantidad ?? null,
      total: datos?.total ?? null,
    };
  });
  // El mejor día: el de más plata vendida (con al menos una venta).
  const mejor = dias.reduce<(typeof dias)[number] | null>(
    (max, d) =>
      d.total !== null && d.total > 0 && (max === null || d.total > (max.total ?? 0)) ? d : max,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Ventas de esta semana</h2>
        </CardTitle>
        <CardDescription data-testid="semana-rango">
          Del lunes {formatearDia(semana.desde)} al domingo {formatearDia(semana.hasta)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {consulta.isPending ? (
          <Cargando texto="Cargando la semana…" />
        ) : consulta.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{mensajeDeError(consulta.error)}</AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="text-sm" data-testid="semana-mejor-dia">
              {mejor ? (
                <>
                  El día que más se vendió: <span className="font-semibold">{mejor.nombre}</span> (
                  {formatearMoneda(mejor.total)}, {formatearNumero(mejor.cantidad ?? 0)}{" "}
                  {mejor.cantidad === 1 ? "venta" : "ventas"})
                </>
              ) : (
                "Todavía no hay ventas esta semana."
              )}
            </p>
            <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden>
              <BarChart data={dias} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="corto" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  allowDecimals={false}
                  tickFormatter={formatearEje}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, datos) => {
                        const dia = datos[0]?.payload as (typeof dias)[number] | undefined;
                        return dia ? `${dia.nombre} ${formatearDia(dia.fecha)}` : "";
                      }}
                      formatter={(valor, _nombre, item) => {
                        const dia = item.payload as (typeof dias)[number];
                        return (
                          <span className="font-mono font-medium tabular-nums">
                            {formatearMoneda(Number(valor))} · {formatearNumero(dia.cantidad ?? 0)}{" "}
                            {dia.cantidad === 1 ? "venta" : "ventas"}
                          </span>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="total" fill="var(--color-total)" radius={4} maxBarSize={48} />
              </BarChart>
            </ChartContainer>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
              {dias.map((d) => (
                <li
                  key={d.fecha}
                  className="rounded-md border p-2"
                  data-testid={`semana-${d.nombre}`}
                >
                  <p className="text-xs text-muted-foreground">
                    {d.nombre} {formatearDia(d.fecha).slice(0, 5)}
                  </p>
                  {d.total === null ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <>
                      <p className="font-medium tabular-nums">{formatearMoneda(d.total)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatearNumero(d.cantidad ?? 0)} {d.cantidad === 1 ? "venta" : "ventas"}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
