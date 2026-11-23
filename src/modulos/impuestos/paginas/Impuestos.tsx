import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Separator } from "@/compartido/ui/separator";
import { useCategorias, useServicios } from "@/modulos/servicios/api/consultas";
import { useImpuestos } from "../api/consultas";
import { ReporteImpuestos } from "../componentes/ReporteImpuestos";
import { TablaImpuestos } from "../componentes/TablaImpuestos";

/** Impuestos (solo admin): catálogo, servicios y medios alcanzados, y reporte por período o turno. */
export function Impuestos() {
  const impuestos = useImpuestos();
  const categorias = useCategorias();
  const servicios = useServicios();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Impuestos</h1>
      {impuestos.isPending || categorias.isPending || servicios.isPending ? (
        <Cargando texto="Cargando impuestos…" />
      ) : impuestos.isError || categorias.isError || servicios.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {mensajeDeError(impuestos.error ?? categorias.error ?? servicios.error)}
          </AlertDescription>
        </Alert>
      ) : (
        <TablaImpuestos
          impuestos={impuestos.data}
          categorias={categorias.data}
          servicios={servicios.data}
        />
      )}
      <Separator />
      <ReporteImpuestos />
    </section>
  );
}
