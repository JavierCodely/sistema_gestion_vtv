import { Plus } from "lucide-react";
import { useState } from "react";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { Alert, AlertDescription } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { useCategorias, useServicios } from "@/modulos/servicios/api/consultas";
import { useStockCertificados, type CertificadoConStock, type Compra } from "../api/consultas";
import { DialogoAjuste } from "../componentes/DialogoAjuste";
import { DialogoCertificado } from "../componentes/DialogoCertificado";
import { DialogoCompra } from "../componentes/DialogoCompra";
import { TablaCompras } from "../componentes/TablaCompras";
import { TablaStock, type AccionCertificado } from "../componentes/TablaStock";

type Dialogo =
  | { tipo: "nuevo" }
  | { tipo: AccionCertificado; certificado: CertificadoConStock }
  | { tipo: "editarCompra"; compra: Compra }
  | null;

export function Certificados() {
  const stock = useStockCertificados();
  const categorias = useCategorias();
  const servicios = useServicios();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const cerrar = () => {
    setDialogo(null);
  };

  const cargando = stock.isPending || categorias.isPending || servicios.isPending;
  const error = stock.error ?? categorias.error ?? servicios.error;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Certificados</h1>
          <p className="text-sm text-muted-foreground">
            Stock de hojas, costo promedio y valor. Las ventas descuentan una hoja; las compras y
            los ajustes quedan en los movimientos.
          </p>
        </div>
        <Button
          disabled={cargando}
          onClick={() => {
            setDialogo({ tipo: "nuevo" });
          }}
        >
          <Plus aria-hidden />
          Nuevo certificado
        </Button>
      </div>

      {cargando ? (
        <Cargando texto="Cargando certificados…" />
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{mensajeDeError(error)}</AlertDescription>
        </Alert>
      ) : (
        <TablaStock
          certificados={stock.data ?? []}
          onAccion={(tipo, certificado) => {
            setDialogo({ tipo, certificado });
          }}
        />
      )}

      <section aria-labelledby="titulo-compras" className="flex flex-col gap-3">
        <h2 id="titulo-compras" className="text-lg font-semibold">
          Últimas compras
        </h2>
        <TablaCompras
          onEditar={(compra) => {
            setDialogo({ tipo: "editarCompra", compra });
          }}
        />
      </section>

      {dialogo?.tipo === "nuevo" && categorias.data && servicios.data && (
        <DialogoCertificado
          categorias={categorias.data}
          servicios={servicios.data}
          onCerrar={cerrar}
        />
      )}
      {dialogo?.tipo === "editar" && categorias.data && servicios.data && (
        <DialogoCertificado
          certificado={dialogo.certificado}
          categorias={categorias.data}
          servicios={servicios.data}
          onCerrar={cerrar}
        />
      )}
      {dialogo?.tipo === "comprar" && (
        <DialogoCompra certificado={dialogo.certificado} onCerrar={cerrar} />
      )}
      {dialogo?.tipo === "editarCompra" && (
        <DialogoCompra original={dialogo.compra} onCerrar={cerrar} />
      )}
      {dialogo?.tipo === "ajustar" && (
        <DialogoAjuste certificado={dialogo.certificado} onCerrar={cerrar} />
      )}
    </section>
  );
}
