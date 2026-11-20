import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, formatearNumero } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { Button } from "@/compartido/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/compartido/ui/card";
import { Input } from "@/compartido/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/compartido/ui/select";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import {
  MEDIOS_PAGO,
  MENSAJES_ERROR_VENTA,
  useCertificadoDeServicio,
  useRegistrarVenta,
  type MedioPago,
} from "../api/consultas";
import {
  LARGO_MAXIMO_PATENTE,
  validarVenta,
  type ErroresVenta,
  type FormularioVenta as Formulario,
} from "../lib/validaciones";

const VACIO: Formulario = { servicioId: "", medioPago: "", patente: "" };
const ORDEN_MEDIOS: readonly MedioPago[] = ["efectivo", "transferencia", "tarjeta"];

/** Qué hoja de certificado se va a usar con el servicio elegido (la decide la BD). */
function AvisoCertificado({ servicio }: { servicio: Servicio }) {
  const certificado = useCertificadoDeServicio(servicio.requiere_certificado ? servicio.id : null);
  if (!servicio.requiere_certificado) {
    return <p className="text-sm text-muted-foreground">Este servicio no lleva certificado.</p>;
  }
  if (certificado.isPending) {
    return <p className="text-sm text-muted-foreground">Buscando el certificado…</p>;
  }
  if (certificado.isError) {
    return <p className="text-sm text-destructive">{mensajeDeError(certificado.error)}</p>;
  }
  if (certificado.data === null) {
    return (
      <p className="text-sm text-destructive" data-testid="aviso-certificado">
        No hay un certificado configurado para este servicio. La venta se registra igual y se avisa
        al administrador.
      </p>
    );
  }
  const { nombre, stock_hojas } = certificado.data;
  return stock_hojas > 0 ? (
    <p className="text-sm text-muted-foreground" data-testid="aviso-certificado">
      Usa una hoja de “{nombre}” (quedan {formatearNumero(stock_hojas)}).
    </p>
  ) : (
    <p className="text-sm text-destructive" data-testid="aviso-certificado">
      No quedan hojas de “{nombre}”. La venta se registra igual y se avisa al administrador.
    </p>
  );
}

export function FormularioVenta({
  categorias,
  servicios,
}: {
  categorias: Categoria[];
  servicios: Servicio[];
}) {
  const registrar = useRegistrarVenta();
  const [formulario, setFormulario] = useState<Formulario>(VACIO);
  const [errores, setErrores] = useState<ErroresVenta>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // Solo se ofrece lo que se puede vender: servicio activo de una categoría activa.
  const grupos = categorias
    .filter((c) => c.activa)
    .map((categoria) => ({
      categoria,
      servicios: servicios.filter((s) => s.activo && s.categoria_id === categoria.id),
    }))
    .filter((g) => g.servicios.length > 0);
  const servicio = servicios.find((s) => String(s.id) === formulario.servicioId);

  function cambiar<K extends keyof Formulario>(clave: K, valor: Formulario[K]) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarVenta(formulario);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      const venta = await registrar.mutateAsync(resultado.datos);
      const texto = `Venta N° ${String(venta.id)}: ${venta.servicio_nombre} · ${formatearMoneda(venta.precio)}`;
      if (venta.sin_stock) toast.warning(`${texto} (sin hoja de certificado)`);
      else toast.success(texto);
      setFormulario(VACIO);
      setErrores({});
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_VENTA));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Nueva venta</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grupos.length === 0 ? (
          <p className="text-muted-foreground">
            No hay servicios para vender. Pedile al administrador que los cargue.
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
            <Campo id="venta-servicio" etiqueta="Servicio" error={errores.servicioId}>
              <Select
                value={formulario.servicioId}
                onValueChange={(valor) => {
                  cambiar("servicioId", valor);
                }}
              >
                <SelectTrigger
                  id="venta-servicio"
                  className="w-full"
                  {...propsError("venta-servicio", errores.servicioId)}
                >
                  <SelectValue placeholder="Elegí un servicio" />
                </SelectTrigger>
                <SelectContent>
                  {grupos.map(({ categoria, servicios: delGrupo }) => (
                    <SelectGroup key={categoria.id}>
                      <SelectLabel>{categoria.nombre}</SelectLabel>
                      {delGrupo.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.nombre} · {formatearMoneda(s.precio)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {servicio && <AvisoCertificado servicio={servicio} />}
            </Campo>

            <fieldset
              role="radiogroup"
              className="flex flex-col gap-2"
              {...propsError("venta-medio", errores.medioPago)}
            >
              <legend className="mb-2 text-sm font-medium">Medio de pago</legend>
              <div className="grid grid-cols-3 gap-2">
                {ORDEN_MEDIOS.map((medio) => (
                  <label
                    key={medio}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    )}
                  >
                    <input
                      type="radio"
                      name="medio-pago"
                      className="sr-only"
                      value={medio}
                      checked={formulario.medioPago === medio}
                      onChange={() => {
                        cambiar("medioPago", medio);
                      }}
                    />
                    {MEDIOS_PAGO[medio]}
                  </label>
                ))}
              </div>
              {errores.medioPago && (
                <p id="venta-medio-error" className="text-sm text-destructive">
                  {errores.medioPago}
                </p>
              )}
            </fieldset>

            <Campo id="venta-patente" etiqueta="Patente (opcional)" error={errores.patente}>
              <Input
                id="venta-patente"
                autoComplete="off"
                className="uppercase"
                maxLength={LARGO_MAXIMO_PATENTE + 4}
                placeholder="Ej. AB123CD"
                value={formulario.patente}
                onChange={(e) => {
                  cambiar("patente", e.target.value);
                }}
                {...propsError("venta-patente", errores.patente)}
              />
            </Campo>

            <ErrorFormulario mensaje={errorServidor} />
            <Button type="submit" size="lg" disabled={registrar.isPending}>
              {registrar.isPending ? "Registrando…" : "Registrar venta"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
