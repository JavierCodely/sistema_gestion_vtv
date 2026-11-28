import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import {
  ChartContainer,
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

/** Una columna del gráfico, tal como la devuelve la BD (ya en orden). */
export interface FilaColumna {
  /** Texto completo (tooltip y tabla). */
  nombre: string;
  /** Texto corto del eje. */
  corto: string;
  cantidad: number;
  total: number;
}

const config = {
  cantidad: { label: "Ventas", color: "var(--chart-3)" },
} satisfies ChartConfig;

/**
 * Columnas verticales de una sola serie (cantidad de ventas), con la tabla de los mismos números
 * debajo (cantidad y total). Para días de la semana, horas del día, etc.
 */
export function GraficoColumnas({
  idBase,
  filas,
  etiquetaNombre,
}: {
  idBase: string;
  filas: FilaColumna[];
  /** Encabezado de la primera columna de la tabla (ej. "Día", "Hora"). */
  etiquetaNombre: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={config} className="aspect-auto h-56 w-full" aria-hidden>
        <BarChart data={filas} margin={{ left: 8, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="corto" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
            tickFormatter={(v: number) => formatearNumero(v)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, datos) => {
                  const fila = datos[0]?.payload as FilaColumna | undefined;
                  return fila?.nombre ?? "";
                }}
                formatter={(valor, _nombre, item) => {
                  const fila = item.payload as FilaColumna;
                  return (
                    <span className="font-mono font-medium tabular-nums">
                      {formatearNumero(Number(valor))} {Number(valor) === 1 ? "venta" : "ventas"} ·{" "}
                      {formatearMoneda(fila.total)}
                    </span>
                  );
                }}
              />
            }
          />
          <Bar dataKey="cantidad" fill="var(--color-cantidad)" radius={4} maxBarSize={40} />
        </BarChart>
      </ChartContainer>
      <div className="md:overflow-x-auto md:rounded-md md:border">
        <Table apilada>
          <TableHeader>
            <TableRow>
              <TableHead>{etiquetaNombre}</TableHead>
              <TableHead className="text-right">Ventas</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.nombre} data-testid={`${idBase}-${fila.nombre}`}>
                <TableCell data-label={etiquetaNombre} className="font-medium">
                  {fila.nombre}
                </TableCell>
                <TableCell data-label="Ventas" className="text-right tabular-nums">
                  {formatearNumero(fila.cantidad)}
                </TableCell>
                <TableCell data-label="Total" className="text-right tabular-nums">
                  {formatearMoneda(fila.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
