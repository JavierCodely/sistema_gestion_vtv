import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { formatearEje } from "../lib/formato";
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

/** Una fila del ranking, tal como la devuelve la BD (ya ordenada de mayor a menor). */
export interface FilaRanking {
  nombre: string;
  cantidad: number;
  total: number;
  /** Tercera columna opcional (ej. lo descontado). */
  extra?: number;
}

/** Cuántas barras se dibujan como máximo: el resto queda en la tabla. */
const MAXIMO_BARRAS = 8;

/**
 * Ranking en barras horizontales (shadcn Chart sobre Recharts), una sola serie y un solo color, con
 * la tabla de los mismos números debajo (todas las filas). Los datos vienen ordenados de la BD.
 */
export function GraficoRanking({
  idBase,
  filas,
  medida,
  etiquetaMedida,
  etiquetaExtra,
}: {
  idBase: string;
  filas: FilaRanking[];
  /** Qué largo tiene la barra: la cantidad de ventas/gastos o el total en pesos. */
  medida: "cantidad" | "total";
  etiquetaMedida: string;
  etiquetaExtra?: string;
}) {
  const config = {
    [medida]: { label: etiquetaMedida, color: "var(--chart-3)" },
  } satisfies ChartConfig;
  const enPesos = medida === "total";
  const datos = filas.slice(0, MAXIMO_BARRAS);

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: `${String(Math.max(datos.length, 1) * 44 + 24)}px` }}
        aria-hidden
      >
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} />
          <YAxis
            dataKey="nombre"
            type="category"
            tickLine={false}
            axisLine={false}
            width={150}
            tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          />
          <XAxis
            type="number"
            dataKey={medida}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => (enPesos ? formatearEje(v) : formatearNumero(v))}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(valor) => (
                  <span className="font-mono font-medium tabular-nums">
                    {enPesos ? formatearMoneda(Number(valor)) : formatearNumero(Number(valor))}
                  </span>
                )}
              />
            }
          />
          <Bar dataKey={medida} fill={`var(--color-${medida})`} radius={4} maxBarSize={28} />
        </BarChart>
      </ChartContainer>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {etiquetaExtra && <TableHead className="text-right">{etiquetaExtra}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.nombre} data-testid={`${idBase}-${fila.nombre}`}>
                <TableCell className="font-medium">{fila.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearNumero(fila.cantidad)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearMoneda(fila.total)}
                </TableCell>
                {etiquetaExtra && (
                  <TableCell className="text-right tabular-nums">
                    {formatearMoneda(fila.extra ?? 0)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
