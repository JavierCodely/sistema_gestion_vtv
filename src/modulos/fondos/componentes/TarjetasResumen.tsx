import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { useResumenFondos } from "../api/consultas";
import { CUENTAS } from "../lib/fondos";
import { SaldoCuenta } from "./SaldoCuenta";
import { TarjetaResumenCuenta } from "./TarjetaResumenCuenta";

/** Una tarjeta por cuenta (efectivo y transferencia) con `resumen_fondos` del rango. */
export function TarjetasResumen({ rango }: { rango: RangoFechas }) {
  const resumen = useResumenFondos(rango);

  if (resumen.isPending) return <Cargando texto="Cargando resumen…" />;
  if (resumen.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(resumen.error)}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CUENTAS.map((cuenta) => (
        <TarjetaResumenCuenta
          key={cuenta}
          cuenta={cuenta}
          saldo={<SaldoCuenta cuenta={cuenta} rango={rango} testId={`resumen-${cuenta}-saldo`} />}
          totales={resumen.data[cuenta]}
        />
      ))}
    </div>
  );
}
