import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Separator } from "@/compartido/ui/separator";
import { useCategorias, useServicios } from "@/modulos/servicios/api/consultas";
import { useDescuentos } from "../api/consultas";
import { EstadisticasDescuentos } from "../componentes/EstadisticasDescuentos";
import { TablaDescuentos } from "../componentes/TablaDescuentos";

/** Descuentos (solo admin): catálogo, servicios donde se usa cada uno y estadísticas. */
export function Descuentos() {
  const descuentos = useDescuentos();
  const categorias = useCategorias();
  const servicios = useServicios();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Descuentos</h1>
      {descuentos.isPending || categorias.isPending || servicios.isPending ? (
        <Cargando texto="Cargando descuentos…" />
      ) : descuentos.isError || categorias.isError || servicios.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {mensajeDeError(descuentos.error ?? categorias.error ?? servicios.error)}
          </AlertDescription>
        </Alert>
      ) : (
        <TablaDescuentos
          descuentos={descuentos.data}
          categorias={categorias.data}
          servicios={servicios.data}
        />
      )}
      <Separator />
      <EstadisticasDescuentos />
    </section>
  );
}
