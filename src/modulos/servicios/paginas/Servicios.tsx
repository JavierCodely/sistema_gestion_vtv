import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { useCategorias, useServicios } from "../api/consultas";
import { TablaCategorias } from "../componentes/TablaCategorias";
import { TablaServicios } from "../componentes/TablaServicios";

export function Servicios() {
  const categorias = useCategorias();
  const servicios = useServicios();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Servicios y categorías</h1>
      {categorias.isPending || servicios.isPending ? (
        <Cargando texto="Cargando servicios…" />
      ) : categorias.isError || servicios.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(categorias.error ?? servicios.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <TablaServicios categorias={categorias.data} servicios={servicios.data} />
          <TablaCategorias categorias={categorias.data} servicios={servicios.data} />
        </>
      )}
    </section>
  );
}
