import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Campo } from "@/compartido/componentes/Campo";
import { Cargando } from "@/compartido/componentes/Cargando";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { propsError } from "@/compartido/lib/accesibilidad";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda, hoyEnArgentina } from "@/compartido/lib/formato";
import { LARGO_MAXIMO_PATENTE, montoComoTexto } from "@/compartido/lib/validaciones";
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
import { MEDIOS_PAGO, MENSAJES_ERROR_VENTA, type MedioPago } from "@/modulos/caja/api/consultas";
import { useCajas } from "@/modulos/cajas/api/consultas";
import { useServicios } from "@/modulos/servicios/api/consultas";
import { useRegistrarVentaPasada } from "../api/consultas";
import {
  FECHA_MINIMA_VENTA_PASADA,
  validarVentaPasada,
  type ErroresVentaPasada,
  type FormularioVentaPasada,
} from "../lib/venta-pasada";

const ORDEN_MEDIOS: readonly MedioPago[] = ["efectivo", "transferencia", "tarjeta"];

const VACIO: FormularioVentaPasada = {
  fecha: "",
  hora: "",
  cajaId: "",
  servicioId: "",
  medioPago: "",
  precio: "",
  patente: "",
};

/**
 * Carga de una venta con fecha pasada (solo admin). No va a ningún turno, no descuenta hojas de
 * certificado ni se factura; si fue en efectivo, el monto entra a la caja de cambio. Se listan
 * también cajas y servicios desactivados: pudieron estar activos en esa fecha.
 */
export function DialogoVentaPasada({ onCerrar }: { onCerrar: () => void }) {
  const cajas = useCajas();
  const servicios = useServicios();
  const registrar = useRegistrarVentaPasada();
  const [formulario, setFormulario] = useState<FormularioVentaPasada>(VACIO);
  const [errores, setErrores] = useState<ErroresVentaPasada>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const hoy = hoyEnArgentina();

  function cambiar<K extends keyof FormularioVentaPasada>(
    clave: K,
    valor: FormularioVentaPasada[K],
  ) {
    setFormulario((actual) => ({ ...actual, [clave]: valor }));
  }

  function elegirServicio(valor: string) {
    const servicio = servicios.data?.find((s) => String(s.id) === valor);
    // Se propone el precio actual; el admin lo cambia si en esa fecha era otro.
    setFormulario((actual) => ({
      ...actual,
      servicioId: valor,
      precio: servicio ? montoComoTexto(servicio.precio) : actual.precio,
    }));
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = validarVentaPasada(formulario, hoy);
    setErrores(resultado.errores ?? {});
    if (!resultado.datos) return;
    setErrorServidor(null);
    try {
      const venta = await registrar.mutateAsync(resultado.datos);
      toast.success(
        `Venta N° ${String(venta.id)} cargada (${venta.servicio_nombre}, ${formatearMoneda(venta.precio)})`,
      );
      onCerrar();
    } catch (e) {
      setErrorServidor(mensajeDeError(e, MENSAJES_ERROR_VENTA));
    }
  }

  const errorCarga: unknown = cajas.isError
    ? cajas.error
    : servicios.isError
      ? servicios.error
      : null;

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !registrar.isPending) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargar venta con fecha pasada</DialogTitle>
          <DialogDescription>
            Queda en la fecha elegida, sin turno: no descuenta hojas de certificado y no se factura.
            Si fue en efectivo, el monto entra ahora a la caja de cambio.
          </DialogDescription>
        </DialogHeader>
        {cajas.isPending || servicios.isPending ? (
          <Cargando texto="Cargando…" />
        ) : errorCarga ? (
          <ErrorFormulario mensaje={mensajeDeError(errorCarga)} />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => void enviar(e)} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo id="pasada-fecha" etiqueta="Fecha" error={errores.fecha}>
                <Input
                  id="pasada-fecha"
                  type="date"
                  min={FECHA_MINIMA_VENTA_PASADA}
                  max={hoy}
                  autoFocus
                  value={formulario.fecha}
                  onChange={(e) => {
                    cambiar("fecha", e.target.value);
                  }}
                  {...propsError("pasada-fecha", errores.fecha)}
                />
              </Campo>
              <Campo id="pasada-hora" etiqueta="Hora" error={errores.hora}>
                <Input
                  id="pasada-hora"
                  type="time"
                  value={formulario.hora}
                  onChange={(e) => {
                    cambiar("hora", e.target.value);
                  }}
                  {...propsError("pasada-hora", errores.hora)}
                />
              </Campo>
            </div>
            <Campo id="pasada-caja" etiqueta="Caja" error={errores.cajaId}>
              <Select
                value={formulario.cajaId}
                onValueChange={(valor) => {
                  cambiar("cajaId", valor);
                }}
              >
                <SelectTrigger
                  id="pasada-caja"
                  className="w-full"
                  {...propsError("pasada-caja", errores.cajaId)}
                >
                  <SelectValue placeholder="Elegí una caja" />
                </SelectTrigger>
                <SelectContent>
                  {(cajas.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.activa ? c.nombre : `${c.nombre} (desactivada)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo id="pasada-servicio" etiqueta="Servicio" error={errores.servicioId}>
              <Select value={formulario.servicioId} onValueChange={elegirServicio}>
                <SelectTrigger
                  id="pasada-servicio"
                  className="w-full"
                  {...propsError("pasada-servicio", errores.servicioId)}
                >
                  <SelectValue placeholder="Elegí un servicio" />
                </SelectTrigger>
                <SelectContent>
                  {(servicios.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.activo ? s.nombre : `${s.nombre} (desactivado)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo id="pasada-medio" etiqueta="Medio de pago" error={errores.medioPago}>
                <Select
                  value={formulario.medioPago}
                  onValueChange={(valor) => {
                    cambiar("medioPago", valor as MedioPago);
                  }}
                >
                  <SelectTrigger
                    id="pasada-medio"
                    className="w-full"
                    {...propsError("pasada-medio", errores.medioPago)}
                  >
                    <SelectValue placeholder="Elegí el medio" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDEN_MEDIOS.map((medio) => (
                      <SelectItem key={medio} value={medio}>
                        {MEDIOS_PAGO[medio]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo id="pasada-precio" etiqueta="Precio ($)" error={errores.precio}>
                <Input
                  id="pasada-precio"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Ej. 20.000"
                  value={formulario.precio}
                  onChange={(e) => {
                    cambiar("precio", e.target.value);
                  }}
                  {...propsError("pasada-precio", errores.precio)}
                />
              </Campo>
            </div>
            <Campo id="pasada-patente" etiqueta="Patente (opcional)" error={errores.patente}>
              <Input
                id="pasada-patente"
                autoComplete="off"
                maxLength={LARGO_MAXIMO_PATENTE + 4}
                placeholder="Ej. AB123CD"
                value={formulario.patente}
                onChange={(e) => {
                  cambiar("patente", e.target.value);
                }}
                {...propsError("pasada-patente", errores.patente)}
              />
            </Campo>
            <ErrorFormulario mensaje={errorServidor} />
            <DialogFooter>
              <Button type="submit" disabled={registrar.isPending}>
                {registrar.isPending ? "Cargando…" : "Cargar venta"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
