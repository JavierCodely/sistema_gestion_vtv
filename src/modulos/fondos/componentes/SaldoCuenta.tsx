import { mensajeDeError } from "@/compartido/lib/errores";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { useResumenFondos } from "../api/consultas";
import { useSaldoEfectivo } from "../api/efectivo";
import type { Cuenta } from "../lib/fondos";
import { Saldo } from "./Saldo";

/**
 * Saldo actual de una cuenta. El de efectivo (la caja de cambio) se lee solo con `useSaldoEfectivo`;
 * el de transferencia, de `resumen_fondos` (es de todos los tiempos: no depende
 * del rango, que solo es parte de la clave de la consulta compartida con las tarjetas).
 */
export function SaldoCuenta({
  cuenta,
  rango,
  testId,
}: {
  cuenta: Cuenta;
  rango: RangoFechas | null;
  testId?: string;
}) {
  const efectivo = useSaldoEfectivo();
  const resumen = useResumenFondos(cuenta === "efectivo" ? null : rango);

  if (cuenta === "efectivo") {
    if (efectivo.isPending) return <span className="text-sm text-muted-foreground">Cargando…</span>;
    if (efectivo.isError) {
      return <span className="text-sm text-destructive">{mensajeDeError(efectivo.error)}</span>;
    }
    return <Saldo valor={efectivo.data} testId={testId} />;
  }
  if (rango === null) return <span className="text-sm text-muted-foreground">—</span>;
  if (resumen.isPending) return <span className="text-sm text-muted-foreground">Cargando…</span>;
  if (resumen.isError) {
    return <span className="text-sm text-destructive">{mensajeDeError(resumen.error)}</span>;
  }
  const fila = resumen.data[cuenta];
  return fila ? <Saldo valor={fila.saldo} testId={testId} /> : <span>—</span>;
}
