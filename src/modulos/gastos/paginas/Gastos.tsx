import { Ban, Plus } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useCategoriasGasto, useGastos, type Gasto } from "../api/consultas";
import { CategoriasGasto } from "../componentes/CategoriasGasto";
import { DialogoAnularGasto } from "../componentes/DialogoAnularGasto";
import { DialogoGasto } from "../componentes/DialogoGasto";
import { TablaGastos } from "../componentes/TablaGastos";

/** Gastos del negocio (admin): carga sin turno, anulación y categorías. */
export function Gastos() {
  const gastos = useGastos();
  const categorias = useCategoriasGasto();
  // Los gastos automáticos (compra de certificados) no se anulan a mano.
  const automaticas = new Set(
    (categorias.data ?? []).filter((c) => c.sistema !== null).map((c) => c.id),
  );
  const anulable = (gasto: Gasto) =>
    !gasto.anulada &&
    categorias.isSuccess &&
    gasto.categoria_gasto_id !== null &&
    !automaticas.has(gasto.categoria_gasto_id);
  const [cargando, setCargando] = useState(false);
  const [anulando, setAnulando] = useState<Gasto | null>(null);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <Button
          onClick={() => {
            setCargando(true);
          }}
        >
          <Plus aria-hidden />
          Registrar gasto
        </Button>
      </div>

      <section aria-labelledby="titulo-historial" className="flex flex-col gap-3">
        <h2 id="titulo-historial" className="text-lg font-semibold">
          Historial
        </h2>
        {gastos.isPending ? (
          <Cargando texto="Cargando gastos…" />
        ) : gastos.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{mensajeDeError(gastos.error)}</AlertDescription>
          </Alert>
        ) : (
          <>
            <TablaGastos
              gastos={gastos.data.pages.flat()}
              completo
              vacio="Todavía no hay gastos registrados."
              acciones={(gasto) =>
                anulable(gasto) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Anular gasto ${String(gasto.id)}`}
                    onClick={() => {
                      setAnulando(gasto);
                    }}
                  >
                    <Ban aria-hidden />
                    Anular
                  </Button>
                )
              }
            />
            {gastos.hasNextPage && (
              <Button
                variant="outline"
                className="self-center"
                disabled={gastos.isFetchingNextPage}
                onClick={() => void gastos.fetchNextPage()}
              >
                {gastos.isFetchingNextPage ? "Cargando…" : "Ver más gastos"}
              </Button>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="titulo-categorias" className="flex flex-col gap-3">
        <h2 id="titulo-categorias" className="text-lg font-semibold">
          Categorías
        </h2>
        <CategoriasGasto />
      </section>

      {cargando && (
        <DialogoGasto
          soloCaja={false}
          descripcion="Se registra a tu nombre y no queda en ningún turno. Si es en efectivo, sale de la caja de cambio."
          onCerrar={() => {
            setCargando(false);
          }}
        />
      )}
      {anulando && (
        <DialogoAnularGasto
          gasto={anulando}
          onCerrar={() => {
            setAnulando(null);
          }}
        />
      )}
    </section>
  );
}
