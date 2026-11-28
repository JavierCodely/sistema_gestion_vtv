import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { NOMBRES_MESES } from "@/compartido/lib/periodo";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/compartido/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/compartido/ui/table";
import { Bloque } from "@/modulos/dashboard/componentes/Tarjetas";
import { useComparacionAnual } from "../api/consultas";

/**
 * Ventas de cada mes del año elegido contra el mismo mes del anterior (`comparacion_anual`): dos
 * series de columnas (cantidad de ventas) y la tabla con ventas, total y vehículos de los dos años.
 */
export function ComparacionAnual({ anio }: { anio: number }) {
  const consulta = useComparacionAnual(anio);
  const config = {
    ventas: { label: String(anio), color: "var(--chart-3)" },
    ventas_anterior: { label: String(anio - 1), color: "var(--chart-5)" },
  } satisfies ChartConfig;

  return (
    <Bloque
      titulo={`${String(anio)} contra ${String(anio - 1)}`}
      descripcion="Cantidad de ventas de cada mes contra el mismo mes del año anterior."
      vacio={
        consulta.data?.every((m) => m.ventas === 0 && m.ventas_anterior === 0)
          ? "No hay ventas en esos dos años."
          : null
      }
    >
      {consulta.isPending ? (
        <Cargando texto="Comparando años…" />
      ) : consulta.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(consulta.error)}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden>
            <BarChart
              data={consulta.data.map((m) => ({
                ...m,
                corto: (NOMBRES_MESES[m.mes - 1] ?? "").slice(0, 3),
              }))}
              margin={{ left: 8, right: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="corto" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                allowDecimals={false}
                tickFormatter={(v: number) => formatearNumero(v)}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="ventas" fill="var(--color-ventas)" radius={4} maxBarSize={24} />
              <Bar
                dataKey="ventas_anterior"
                fill="var(--color-ventas_anterior)"
                radius={4}
                maxBarSize={24}
              />
            </BarChart>
          </ChartContainer>
          <div className="md:overflow-x-auto md:rounded-md md:border">
            <Table apilada="grilla">
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Ventas {anio}</TableHead>
                  <TableHead className="text-right">Ventas {anio - 1}</TableHead>
                  <TableHead className="text-right">Total {anio}</TableHead>
                  <TableHead className="text-right">Total {anio - 1}</TableHead>
                  <TableHead className="text-right">Vehículos {anio}</TableHead>
                  <TableHead className="text-right">Vehículos {anio - 1}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.data.map((m) => {
                  const mes = NOMBRES_MESES[m.mes - 1] ?? "";
                  return (
                    <TableRow key={m.mes} data-testid={`comparacion-${mes}`}>
                      <TableCell data-label="Mes" className="font-medium max-md:col-span-2">
                        {mes}
                      </TableCell>
                      <TableCell
                        data-label={`Ventas ${String(anio)}`}
                        className="text-right tabular-nums"
                      >
                        {formatearNumero(m.ventas)}
                      </TableCell>
                      <TableCell
                        data-label={`Ventas ${String(anio - 1)}`}
                        className="text-right tabular-nums"
                      >
                        {formatearNumero(m.ventas_anterior)}
                      </TableCell>
                      <TableCell
                        data-label={`Total ${String(anio)}`}
                        className="text-right tabular-nums"
                      >
                        {formatearMoneda(m.total)}
                      </TableCell>
                      <TableCell
                        data-label={`Total ${String(anio - 1)}`}
                        className="text-right tabular-nums"
                      >
                        {formatearMoneda(m.total_anterior)}
                      </TableCell>
                      <TableCell
                        data-label={`Vehículos ${String(anio)}`}
                        className="text-right tabular-nums"
                      >
                        {formatearNumero(m.vehiculos)}
                      </TableCell>
                      <TableCell
                        data-label={`Vehículos ${String(anio - 1)}`}
                        className="text-right tabular-nums"
                      >
                        {formatearNumero(m.vehiculos_anterior)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Bloque>
  );
}
