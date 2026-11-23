import { ArrowDownToLine, ArrowUpFromLine, PiggyBank, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { RangoFechas } from "@/compartido/lib/rango-fechas";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import {
  NOMBRE_CUENTA,
  nombreMovimiento,
  type Cuenta,
  type TipoMovimientoManual,
} from "../lib/fondos";
import { DialogoMovimientoFondos } from "./DialogoMovimientoFondos";
import { LibroCuenta } from "./LibroCuenta";
import { SaldoCuenta } from "./SaldoCuenta";

const BOTONES: readonly { tipo: TipoMovimientoManual; icono: LucideIcon }[] = [
  { tipo: "fondo_inicial", icono: PiggyBank },
  { tipo: "ingreso", icono: ArrowDownToLine },
  { tipo: "retiro", icono: ArrowUpFromLine },
];

/**
 * Pestaña de una cuenta: saldo actual, movimientos manuales y el libro del rango. En efectivo es la
 * caja de cambio de siempre (fondo inicial, ingreso, retiro y el saldo después de cada movimiento).
 */
export function PestanaCuenta({ cuenta, rango }: { cuenta: Cuenta; rango: RangoFechas | null }) {
  const [tipo, setTipo] = useState<TipoMovimientoManual | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {cuenta === "efectivo"
                ? "Saldo disponible para cambio"
                : `Saldo de ${NOMBRE_CUENTA[cuenta]}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            <SaldoCuenta cuenta={cuenta} rango={rango} testId={`saldo-${cuenta}`} />
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          {BOTONES.map(({ tipo: t, icono: Icono }) => (
            <Button
              key={t}
              variant="outline"
              onClick={() => {
                setTipo(t);
              }}
            >
              <Icono aria-hidden />
              {nombreMovimiento(cuenta, t)}
            </Button>
          ))}
        </div>
      </div>

      {rango ? (
        <LibroCuenta cuenta={cuenta} rango={rango} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Elegí un período válido para ver los movimientos.
        </p>
      )}

      {tipo && (
        <DialogoMovimientoFondos
          cuenta={cuenta}
          tipo={tipo}
          onCerrar={() => {
            setTipo(null);
          }}
        />
      )}
    </div>
  );
}
