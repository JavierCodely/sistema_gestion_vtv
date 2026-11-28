import { useState } from "react";
import { useSearchParams } from "react-router";
import { SelectorRango } from "@/compartido/componentes/SelectorRango";
import { mesActual, revisarRango } from "@/compartido/lib/rango-fechas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/compartido/ui/tabs";
import { PestanaCuenta } from "../componentes/PestanaCuenta";
import { PestanaMixto } from "../componentes/PestanaMixto";
import { TarjetasResumen } from "../componentes/TarjetasResumen";
import { CUENTAS } from "../lib/fondos";
import {
  esPestana,
  guardarPestana,
  NOMBRE_PESTANA,
  PARAMETRO_PESTANA,
  PESTANAS,
  pestanaInicial,
} from "../lib/pestanas";

/**
 * Fondos (solo admin): efectivo (la caja de cambio) y transferencia, con saldos y
 * totales del rango, el libro de cada cuenta y las ventas mixtas (informativas). Todos los montos
 * vienen de la BD (`resumen_fondos`, `v_movimientos_fondos`, `resumen_ventas_mixtas`, `v_ventas_mixtas`).
 * La pestaña elegida queda en la URL (`?pestana=`) y se recuerda para la próxima vez.
 */
export function Fondos() {
  const [parametros, setParametros] = useSearchParams();
  const pestana = pestanaInicial(parametros.get(PARAMETRO_PESTANA));
  const [valorRango, setValorRango] = useState(() => mesActual());
  const { rango, error } = revisarRango(valorRango);

  function elegirPestana(valor: string) {
    if (!esPestana(valor)) return;
    guardarPestana(valor);
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales);
        nuevos.set(PARAMETRO_PESTANA, valor);
        return nuevos;
      },
      { replace: true },
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fondos</h1>
          <p className="text-sm text-muted-foreground">
            Saldos actuales; ingresos, egresos y movimientos del período elegido.
          </p>
        </div>
        <SelectorRango id="fondos" valor={valorRango} onCambiar={setValorRango} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !rango ? (
        <p className="text-sm text-muted-foreground">Elegí las dos fechas del período.</p>
      ) : (
        <TarjetasResumen rango={rango} />
      )}

      <Tabs value={pestana} onValueChange={elegirPestana} className="gap-4">
        <TabsList
          aria-label="Cuentas de Fondos"
          className="w-full flex-wrap group-data-horizontal/tabs:h-auto sm:w-fit"
        >
          {PESTANAS.map((p) => (
            <TabsTrigger key={p} value={p} className="px-3 py-1">
              {NOMBRE_PESTANA[p]}
            </TabsTrigger>
          ))}
        </TabsList>
        {CUENTAS.map((cuenta) => (
          <TabsContent key={cuenta} value={cuenta}>
            <PestanaCuenta cuenta={cuenta} rango={rango} />
          </TabsContent>
        ))}
        <TabsContent value="mixto">
          <PestanaMixto rango={rango} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
