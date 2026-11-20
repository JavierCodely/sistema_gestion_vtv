import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { LARGO_MAXIMO_NOMBRE } from "@/compartido/lib/validaciones";
import { Button } from "@/compartido/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import { Input } from "@/compartido/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import {
  MENSAJES_ERROR_CERTIFICADO,
  useActualizarCertificado,
  useCrearCertificado,
  type CertificadoConStock,
} from "../api/consultas";
import {
  ALCANCES,
  ORDEN_ALCANCES,
  UNIDADES,
  validarCertificado,
  type Alcance,
  type ErroresCertificado,
  type FormularioCertificado,
  type UnidadCompra,
} from "../lib/validaciones";

function formularioInicial(certificado?: CertificadoConStock): FormularioCertificado {
  if (!certificado) {
    return {
      nombre: "",
      unidadCompra: "caja",
      hojasPorUnidad: "",
      alcance: "global",
      destinoId: "",
      stockMinimo: "0",
    };
  }
  const destino =
    certificado.alcance === "categoria" ? certificado.categoria_id : certificado.servicio_id;
  return {
    nombre: certificado.nombre,
    unidadCompra: certificado.unidad_compra,
    hojasPorUnidad: String(certificado.hojas_por_unidad),
    alcance: certificado.alcance,
    destinoId: destino === null ? "" : String(destino),
    stockMinimo: String(certificado.stock_minimo),
  };
}

const esUnidad = (valor: string): valor is UnidadCompra => valor in UNIDADES;
const esAlcance = (valor: string): valor is Alcance => valor in ALCANCES;

/** Alta o edición de un certificado. Se monta abierto; el padre lo desmonta al cerrar. */
export function DialogoCertificado({
  certificado,
  categorias,
  servicios,
  onCerrar,
}: {
  certificado?: CertificadoConStock;
  categorias: Categoria[];
  servicios: Servicio[];
  onCerrar: () => void;
}) {
  const crear = useCrearCertificado();
  const actualizar = useActualizarCertificado();
  const [formulario, setFormulario] = useState(() => formularioInicial(certificado));
  const [errores, setErrores] = useState<ErroresCertificado>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const guardando = crear.isPending || actualizar.isPending;

  // Destinos activos, más el que ya tiene el certificado (para no perderlo al editar).
  const destinoActual = formularioInicial(certificado).destinoId;
  const opcionesDestino =
    formulario.alcance === "categoria"
      ? categorias
          .filter((c) => c.activa || String(c.id) === destinoActual)
          .map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activa }))
      : servicios
          .filter((s) => s.activo || String(s.id) === destinoActual)
          .map((s) => ({ id: s.id, nombre: s.nombre, activo: s.activo }));

  function cambiar<K extends keyof FormularioCertificado>(
    clave: K,
    valor: FormularioCertificado[K],
  ) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarCertificado(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      if (certificado) {
        await actualizar.mutateAsync({ id: certificado.id, cambios: resultado.datos });
        toast.success("Cambios guardados");
      } else {
        const creado = await crear.mutateAsync(resultado.datos);
        toast.success(`Certificado “${creado.nombre}” creado`);
      }
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_CERTIFICADO));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{certificado ? "Editar certificado" : "Nuevo certificado"}</DialogTitle>
          <DialogDescription>
            La hoja que se entrega con cada servicio. En cada venta se usa la más específica:
            servicio, después categoría y por último la de todos los servicios.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo id="certificado-nombre" etiqueta="Nombre" error={errores.nombre}>
            <Input
              id="certificado-nombre"
              value={formulario.nombre}
              maxLength={LARGO_MAXIMO_NOMBRE}
              autoFocus
              autoComplete="off"
              onChange={(e) => {
                cambiar("nombre", e.target.value);
              }}
              {...propsError("certificado-nombre", errores.nombre)}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="certificado-unidad" etiqueta="Se compra por">
              <Select
                value={formulario.unidadCompra}
                onValueChange={(valor) => {
                  if (esUnidad(valor)) cambiar("unidadCompra", valor);
                }}
              >
                <SelectTrigger id="certificado-unidad" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caja">Caja</SelectItem>
                  <SelectItem value="libreta">Libreta</SelectItem>
                  <SelectItem value="unidad">Hoja suelta</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo
              id="certificado-hojas"
              etiqueta="Hojas por unidad"
              error={errores.hojasPorUnidad}
            >
              <Input
                id="certificado-hojas"
                inputMode="numeric"
                autoComplete="off"
                disabled={formulario.unidadCompra === "unidad"}
                value={formulario.unidadCompra === "unidad" ? "1" : formulario.hojasPorUnidad}
                onChange={(e) => {
                  cambiar("hojasPorUnidad", e.target.value);
                }}
                {...propsError("certificado-hojas", errores.hojasPorUnidad)}
              />
            </Campo>
          </div>

          <Campo id="certificado-alcance" etiqueta="Se usa en">
            <Select
              value={formulario.alcance}
              onValueChange={(valor) => {
                if (!esAlcance(valor)) return;
                setFormulario((actual) => ({ ...actual, alcance: valor, destinoId: "" }));
              }}
            >
              <SelectTrigger id="certificado-alcance" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDEN_ALCANCES.map((alcance) => (
                  <SelectItem key={alcance} value={alcance}>
                    {ALCANCES[alcance]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          {formulario.alcance !== "global" && (
            <Campo
              id="certificado-destino"
              etiqueta={formulario.alcance === "categoria" ? "Categoría" : "Servicio"}
              error={errores.destinoId}
            >
              <Select
                value={formulario.destinoId}
                onValueChange={(valor) => {
                  cambiar("destinoId", valor);
                }}
              >
                <SelectTrigger
                  id="certificado-destino"
                  className="w-full"
                  {...propsError("certificado-destino", errores.destinoId)}
                >
                  <SelectValue
                    placeholder={
                      formulario.alcance === "categoria"
                        ? "Elegí una categoría"
                        : "Elegí un servicio"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {opcionesDestino.map((opcion) => (
                    <SelectItem key={opcion.id} value={String(opcion.id)}>
                      {opcion.nombre}
                      {!opcion.activo && " (desactivado)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          )}

          <Campo
            id="certificado-minimo"
            etiqueta="Stock mínimo (hojas)"
            error={errores.stockMinimo}
          >
            <Input
              id="certificado-minimo"
              inputMode="numeric"
              autoComplete="off"
              value={formulario.stockMinimo}
              onChange={(e) => {
                cambiar("stockMinimo", e.target.value);
              }}
              {...propsError("certificado-minimo", errores.stockMinimo)}
            />
            <p className="text-xs text-muted-foreground">
              Cuando una venta deja el stock en este número o menos, se genera una alerta.
            </p>
          </Campo>

          <ErrorFormulario mensaje={errorServidor} />
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : certificado ? "Guardar" : "Crear certificado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
