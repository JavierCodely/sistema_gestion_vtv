import { useQueryClient } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { clavesDescuentos } from "@/compartido/lib/claves-descuentos";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearMoneda } from "@/compartido/lib/formato";
import { cn } from "@/compartido/lib/utils";
import { LARGO_MAXIMO_PATENTE } from "@/compartido/lib/validaciones";
import { Button } from "@/compartido/ui/button";
import { Input } from "@/compartido/ui/input";
import { Label } from "@/compartido/ui/label";
import {
  useDescuentosParaServicio,
  type DescuentoParaServicio,
} from "@/modulos/descuentos/api/consultas";
import type { Categoria, Servicio } from "@/modulos/servicios/api/consultas";
import {
  esPrecioCambiado,
  esTurnoNoDisponible,
  MEDIOS_PAGO,
  MENSAJES_ERROR_VENTA,
  ORDEN_MEDIOS,
  useRegistrarVenta,
  type CobroVenta,
  type MedioPago,
} from "../api/consultas";
import { CAMPO_GRANDE } from "../lib/estilos";
import { pagosMixtos, revisarPagoMixto, type MedioResto } from "../lib/pago-mixto";
import { detallePagos } from "../lib/pagos";
import { validarVenta } from "../lib/validaciones";
import { calcularVuelto, limpiarPatente } from "../lib/vuelto";
import { AvisoCertificado } from "./AvisoCertificado";
import { BotonVolverPaso } from "./BotonVolverPaso";
import { DatoVenta } from "./DatoVenta";
import { ListaOpciones } from "./ListaOpciones";
import { PasoEfectivo } from "./PasoEfectivo";
import { PasoEfectivoMixto, PasoRestoMixto } from "./PasoPagoMixto";
import { UltimaVentaRegistrada, type UltimaVenta } from "./UltimaVentaRegistrada";

type Paso =
  | "categoria"
  | "servicio"
  | "descuento"
  | "patente"
  | "medio"
  | "mixto"
  | "mixto-resto"
  | "efectivo";

type OpcionMedio = MedioPago | "mixto";

const OPCIONES_MEDIO: { valor: OpcionMedio; etiqueta: string }[] = [
  ...ORDEN_MEDIOS.map((m) => ({ valor: m, etiqueta: MEDIOS_PAGO[m] })),
  { valor: "mixto", etiqueta: "Mixto" },
];

/** Valor de la opción "Sin descuento" en la lista (los descuentos tienen id > 0). */
const SIN_DESCUENTO = 0;

const AVISO_DESCUENTO_NO_DISPONIBLE = "El descuento elegido ya no está disponible: elegí otro.";
const AVISO_DESCUENTO_SIN_OTROS =
  "El descuento elegido ya no está disponible y este servicio no tiene otros: la venta sigue sin descuento. Revisá el precio y confirmá.";

/**
 * Venta paso a paso, pensada para usar solo con el teclado y leer de lejos:
 * categoría → servicio → (si el servicio tiene) descuento → patente → medio de pago →
 * (mixto) cuánto paga en efectivo → con qué paga el resto (transferencia o débito/crédito) →
 * (con efectivo) cuánto entregó y el vuelto.
 * Números o flechas para marcar, Enter para seguir, Esc para volver.
 *
 * Los montos en pantalla son una vista previa (precio del servicio o precio final que calculó la BD
 * en `descuentos_para_servicio`); lo que se cobra lo decide y lo devuelve `registrar_venta`. La venta
 * manda el precio que ve el cajero (`p_precio_esperado`): si el admin lo cambió, la BD la rechaza, se
 * relee el catálogo y el cajero vuelve al descuento (o a la patente) para ver el precio nuevo antes de
 * confirmar otra vez. Nunca se reintenta sola, y un descuento elegido que dejó de existir nunca se
 * cobra "sin descuento" sin que el cajero lo vea.
 *
 * La venta va al turno de la caja elegida (`turnoId`). Si ese turno ya se cerró, avisa con
 * `onTurnoNoDisponible` para volver a elegir la caja.
 */
export function FormularioVenta({
  turnoId,
  categorias,
  servicios,
  onTurnoNoDisponible,
}: {
  turnoId: number;
  categorias: Categoria[];
  servicios: Servicio[];
  onTurnoNoDisponible: (mensaje: string) => void;
}) {
  const registrar = useRegistrarVenta();
  const queryClient = useQueryClient();
  const [paso, setPaso] = useState<Paso>("categoria");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [servicioId, setServicioId] = useState<number | null>(null);
  const [descuentoId, setDescuentoId] = useState<number | null>(null);
  const [patente, setPatente] = useState("");
  const [medio, setMedio] = useState<OpcionMedio | null>(null);
  const [efectivoMixto, setEfectivoMixto] = useState("");
  const [medioResto, setMedioResto] = useState<MedioResto | null>(null);
  const [errorMixto, setErrorMixto] = useState(false);
  const [recibido, setRecibido] = useState("");
  const [errorRecibido, setErrorRecibido] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [ultima, setUltima] = useState<UltimaVenta | null>(null);
  const descuentos = useDescuentosParaServicio(servicioId);

  // Solo se ofrece lo que se puede vender: servicio activo de una categoría activa.
  const grupos = categorias
    .filter((c) => c.activa)
    .map((categoria) => ({
      categoria,
      servicios: servicios.filter((s) => s.activo && s.categoria_id === categoria.id),
    }))
    .filter((g) => g.servicios.length > 0);
  const grupo = grupos.find((g) => g.categoria.id === categoriaId);
  const servicio = servicios.find((s) => s.id === servicioId);

  const opcionesDescuento = descuentos.data ?? [];
  const hayDescuentos = opcionesDescuento.length > 0;
  const descuento = opcionesDescuento.find((d) => d.id === descuentoId) ?? null;
  // El elegido ya no se ofrece (el admin lo desactivó, lo quitó del servicio o cambió el precio y
  // ahora redondea a $ 0): no se registra la venta sin él.
  const descuentoPerdido = descuentoId !== null && descuento === null;
  // Vista previa: el precio final de la BD con descuento; si no, el precio del servicio.
  const precioFinal = descuento?.precio_final ?? servicio?.precio ?? 0;
  const revisionMixto = revisarPagoMixto(efectivoMixto, precioFinal);
  const partesMixto =
    revisionMixto.efectivo !== null && revisionMixto.resto !== null && medioResto !== null
      ? pagosMixtos(revisionMixto.efectivo, revisionMixto.resto, medioResto)
      : [];

  // Sin descuentos para el servicio (o si no se pudieron leer: la venta no se traba), el paso de
  // descuento no existe y se sigue con la patente.
  const sinPasoDescuento = descuentos.isError || (descuentos.isSuccess && !hayDescuentos);
  const pasoVisible: Paso = paso === "descuento" && sinPasoDescuento ? "patente" : paso;

  function irA(destino: Paso) {
    setErrorServidor(null);
    setErrorRecibido(null);
    setErrorMixto(false);
    setPaso(destino);
  }

  function reiniciar() {
    setCategoriaId(null);
    setServicioId(null);
    setDescuentoId(null);
    setPatente("");
    setMedio(null);
    setEfectivoMixto("");
    setMedioResto(null);
    setRecibido("");
    irA("categoria");
  }

  /**
   * Vuelve al paso del descuento (o a la patente, si el servicio ya no tiene) con el mensaje a la
   * vista: el precio final cambió y el reparto o lo entregado de antes ya no sirven.
   */
  function volverARevisar(mensaje: string, { sinDescuento }: { sinDescuento: boolean }) {
    if (sinDescuento) setDescuentoId(null);
    setEfectivoMixto("");
    setMedioResto(null);
    setRecibido("");
    irA("descuento");
    setErrorServidor(mensaje);
  }

  /** Descuentos vigentes del servicio, ya releídos (`useRegistrarVenta` los invalida en onError). */
  function descuentosVigentes(id: number): DescuentoParaServicio[] {
    return (
      queryClient.getQueryData<DescuentoParaServicio[]>(clavesDescuentos.paraServicio(id)) ?? []
    );
  }

  async function confirmar(cobro: CobroVenta, montoRecibido: number | null) {
    if (!servicio || registrar.isPending) return;
    if (descuentoPerdido) {
      volverARevisar(hayDescuentos ? AVISO_DESCUENTO_NO_DISPONIBLE : AVISO_DESCUENTO_SIN_OTROS, {
        sinDescuento: true,
      });
      return;
    }
    const resultado = validarVenta({
      servicioId: servicio.id,
      cobro,
      patente,
      descuentoId: descuento?.id ?? null,
      precioEsperado: precioFinal,
    });
    if (!resultado.datos) {
      setErrorServidor(Object.values(resultado.errores).join(" "));
      return;
    }
    setErrorServidor(null);
    try {
      const venta = await registrar.mutateAsync({ ...resultado.datos, turnoId });
      // El efectivo cobrado sale de lo que devolvió la BD: el precio registrado o, en un pago mixto,
      // la parte en efectivo que aceptó (si el precio hubiera cambiado, la BD rechaza el reparto).
      const efectivo =
        "medio" in cobro
          ? cobro.medio === "efectivo"
            ? venta.precio
            : null
          : (cobro.pagos.find((p) => p.medio === "efectivo")?.monto ?? null);
      const nueva: UltimaVenta = {
        id: venta.id,
        servicio: venta.servicio_nombre,
        precio: venta.precio,
        descuento:
          venta.descuento_nombre === null
            ? null
            : { nombre: venta.descuento_nombre, monto: venta.monto_descuento },
        medio: "medio" in cobro ? MEDIOS_PAGO[cobro.medio] : "Mixto",
        detallePagos: "medio" in cobro ? null : detallePagos(cobro.pagos),
        efectivo,
        recibido: montoRecibido,
        sinStock: venta.sin_stock,
      };
      const texto = `Venta N° ${String(venta.id)}: ${venta.servicio_nombre} · ${formatearMoneda(venta.precio)}`;
      if (venta.sin_stock) toast.warning(`${texto} (sin hoja de certificado)`);
      else toast.success(texto);
      const vuelto =
        efectivo !== null && montoRecibido !== null
          ? calcularVuelto(efectivo, montoRecibido)
          : null;
      if (vuelto !== null && vuelto < 0) {
        toast.warning(
          `Lo entregado no alcanza para lo registrado: faltan cobrar ${formatearMoneda(-vuelto)}.`,
        );
      }
      setUltima(nueva);
      reiniciar();
    } catch (e) {
      const mensaje = mensajeDeError(e, MENSAJES_ERROR_VENTA);
      if (esTurnoNoDisponible(e)) {
        onTurnoNoDisponible(mensaje);
        return;
      }
      if (!esPrecioCambiado(e)) {
        setErrorServidor(mensaje);
        return;
      }
      // El catálogo y los descuentos ya se releyeron: el cajero ve el precio nuevo y confirma de nuevo.
      const vigentes = descuentosVigentes(servicio.id);
      const sigue = descuentoId === null || vigentes.some((d) => d.id === descuentoId);
      const aviso = vigentes.length > 0 ? AVISO_DESCUENTO_NO_DISPONIBLE : AVISO_DESCUENTO_SIN_OTROS;
      volverARevisar(sigue ? mensaje : `${mensaje} ${aviso}`, { sinDescuento: !sigue });
    }
  }

  function elegirMedio(opcion: OpcionMedio) {
    setMedio(opcion);
    if (opcion === "efectivo") {
      setRecibido("");
      irA("efectivo");
    } else if (opcion === "mixto") {
      irA("mixto");
    } else {
      void confirmar({ medio: opcion }, null);
    }
  }

  function confirmarEfectivoMixto() {
    if (revisionMixto.error !== null) {
      setErrorMixto(true);
      return;
    }
    irA("mixto-resto");
  }

  function elegirMedioResto(opcion: MedioResto) {
    setMedioResto(opcion);
    setRecibido("");
    irA("efectivo");
  }

  const esMixto = medio === "mixto";
  const aCobrarEnEfectivo = esMixto ? (revisionMixto.efectivo ?? 0) : precioFinal;
  const cobroEnEfectivo: CobroVenta = esMixto ? { pagos: partesMixto } : { medio: "efectivo" };

  function confirmarEfectivo() {
    if (recibido === "") {
      void confirmar(cobroEnEfectivo, null);
      return;
    }
    const monto = Number(recibido);
    const vuelto = calcularVuelto(aCobrarEnEfectivo, monto);
    if (vuelto < 0) {
      setErrorRecibido(`No alcanza: faltan ${formatearMoneda(-vuelto)}.`);
      return;
    }
    void confirmar(cobroEnEfectivo, monto);
  }

  if (grupos.length === 0) {
    return (
      <p className="rounded-lg border p-8 text-center text-2xl text-muted-foreground">
        No hay servicios para vender. Pedile al administrador que los cargue.
      </p>
    );
  }

  const volverDePatente = () => {
    irA(hayDescuentos ? "descuento" : "servicio");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section aria-label="Nueva venta" className="flex min-w-0 flex-col gap-4">
        {pasoVisible === "categoria" && (
          <ListaOpciones
            key="categoria"
            titulo="1. Categoría"
            opciones={grupos.map((g) => ({ valor: g.categoria.id, etiqueta: g.categoria.nombre }))}
            inicial={categoriaId ?? undefined}
            onElegir={(id) => {
              if (id !== categoriaId) {
                setServicioId(null);
                setDescuentoId(null);
              }
              setCategoriaId(id);
              irA("servicio");
            }}
          />
        )}

        {pasoVisible === "servicio" && grupo && (
          <>
            <BotonVolverPaso
              onVolver={() => {
                irA("categoria");
              }}
            />
            <ListaOpciones
              key={`servicio-${String(grupo.categoria.id)}`}
              titulo={`2. Servicio · ${grupo.categoria.nombre}`}
              opciones={grupo.servicios.map((s) => ({
                valor: s.id,
                etiqueta: s.nombre,
                detalle: formatearMoneda(s.precio),
              }))}
              inicial={servicioId ?? undefined}
              onElegir={(id) => {
                if (id !== servicioId) setDescuentoId(null);
                setServicioId(id);
                irA("descuento");
              }}
              onVolver={() => {
                irA("categoria");
              }}
            />
          </>
        )}

        {pasoVisible === "descuento" && servicio && (
          <>
            <BotonVolverPaso
              onVolver={() => {
                irA("servicio");
              }}
            />
            {descuentos.isPending ? (
              <p className="text-2xl text-muted-foreground">Buscando descuentos…</p>
            ) : (
              <ListaOpciones
                key={`descuento-${String(servicio.id)}`}
                titulo={`Descuento (opcional) · ${servicio.nombre}`}
                opciones={[
                  {
                    valor: SIN_DESCUENTO,
                    etiqueta: "Sin descuento",
                    detalle: formatearMoneda(servicio.precio),
                  },
                  ...opcionesDescuento.map((d) => ({
                    valor: d.id,
                    etiqueta: d.nombre,
                    detalle: (
                      <span className="flex flex-col items-end">
                        <span className="text-lg">−{formatearMoneda(d.monto_descuento)}</span>
                        <span>{formatearMoneda(d.precio_final)}</span>
                      </span>
                    ),
                  })),
                ]}
                inicial={descuento?.id ?? SIN_DESCUENTO}
                onElegir={(id) => {
                  setDescuentoId(id === SIN_DESCUENTO ? null : id);
                  irA("patente");
                }}
                onVolver={() => {
                  irA("servicio");
                }}
              />
            )}
          </>
        )}

        {pasoVisible === "patente" && (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              irA("medio");
            }}
          >
            <BotonVolverPaso onVolver={volverDePatente} />
            <Label htmlFor="venta-patente" className="text-2xl font-semibold md:text-3xl">
              3. Patente (opcional)
            </Label>
            <Input
              id="venta-patente"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              maxLength={LARGO_MAXIMO_PATENTE}
              placeholder="AB123CD"
              className={cn(CAMPO_GRANDE, "uppercase")}
              value={patente}
              onChange={(e) => {
                setPatente(limpiarPatente(e.target.value));
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  volverDePatente();
                }
              }}
            />
            <p className="text-base text-muted-foreground">
              Enter para seguir (vacía si no tiene) · Esc para volver
            </p>
            <Button type="submit" size="lg" className="h-14 self-start px-8 text-xl">
              Continuar
            </Button>
          </form>
        )}

        {pasoVisible === "medio" && (
          <>
            <BotonVolverPaso
              onVolver={() => {
                irA("patente");
              }}
            />
            <ListaOpciones
              key="medio"
              titulo="4. Medio de pago"
              horizontal
              deshabilitada={registrar.isPending}
              opciones={OPCIONES_MEDIO}
              inicial={medio ?? undefined}
              onElegir={elegirMedio}
              onVolver={() => {
                irA("patente");
              }}
            />
          </>
        )}

        {pasoVisible === "mixto" && servicio && (
          <PasoEfectivoMixto
            texto={efectivoMixto}
            revision={revisionMixto}
            mostrarError={errorMixto}
            ocupado={registrar.isPending}
            onCambiar={(texto) => {
              setErrorMixto(false);
              setEfectivoMixto(texto);
            }}
            onConfirmar={confirmarEfectivoMixto}
            onVolver={() => {
              irA("medio");
            }}
          />
        )}

        {pasoVisible === "mixto-resto" &&
          servicio &&
          revisionMixto.efectivo !== null &&
          revisionMixto.resto !== null && (
            <PasoRestoMixto
              efectivo={revisionMixto.efectivo}
              resto={revisionMixto.resto}
              inicial={medioResto ?? undefined}
              ocupado={registrar.isPending}
              onElegir={elegirMedioResto}
              onVolver={() => {
                irA("mixto");
              }}
            />
          )}

        {pasoVisible === "efectivo" && servicio && (
          <PasoEfectivo
            aCobrar={aCobrarEnEfectivo}
            mixto={esMixto}
            recibido={recibido}
            error={errorRecibido}
            ocupado={registrar.isPending}
            onCambiar={(texto) => {
              setErrorRecibido(null);
              setRecibido(texto);
            }}
            onConfirmar={confirmarEfectivo}
            onPagoJusto={() => {
              setRecibido("");
              void confirmar(cobroEnEfectivo, null);
            }}
            onVolver={() => {
              irA(esMixto ? "mixto-resto" : "medio");
            }}
          />
        )}

        {registrar.isPending && pasoVisible === "medio" && (
          <p className="text-2xl text-muted-foreground">Registrando…</p>
        )}
        <ErrorFormulario mensaje={errorServidor} />
      </section>

      <aside className="flex flex-col gap-4">
        <section
          aria-labelledby="titulo-venta-en-curso"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="titulo-venta-en-curso" className="text-xl font-semibold text-muted-foreground">
            Venta en curso
          </h2>
          {servicio ? (
            <dl className="flex flex-col gap-3">
              <DatoVenta etiqueta="Servicio">{servicio.nombre}</DatoVenta>
              <div className="flex flex-col">
                <dt className="text-base text-muted-foreground">
                  {descuento ? "Precio final" : "Precio"}
                </dt>
                <dd className="text-5xl font-bold tabular-nums md:text-6xl" data-testid="precio">
                  {formatearMoneda(precioFinal)}
                </dd>
                {descuento && (
                  <dd className="text-lg text-muted-foreground" data-testid="descuento-en-curso">
                    {`Lista ${formatearMoneda(descuento.precio_lista)} · ${descuento.nombre} −${formatearMoneda(descuento.monto_descuento)}`}
                  </dd>
                )}
              </div>
              {descuentoPerdido && (
                <p className="text-base text-destructive" data-testid="descuento-perdido">
                  El descuento elegido ya no está disponible.
                </p>
              )}
              {descuentos.isError && (
                <p className="text-base text-destructive">
                  No se pudieron cargar los descuentos: {mensajeDeError(descuentos.error)}
                </p>
              )}
              {(pasoVisible === "medio" ||
                pasoVisible === "mixto" ||
                pasoVisible === "mixto-resto" ||
                pasoVisible === "efectivo") && (
                <DatoVenta etiqueta="Patente">{patente || "—"}</DatoVenta>
              )}
              {pasoVisible === "efectivo" && (
                <DatoVenta etiqueta="Medio">
                  {esMixto ? `Mixto: ${detallePagos(partesMixto)}` : "Efectivo"}
                </DatoVenta>
              )}
              <AvisoCertificado servicio={servicio} />
            </dl>
          ) : (
            <p className="text-xl text-muted-foreground">
              {grupo ? `Categoría: ${grupo.categoria.nombre}` : "Elegí una categoría para empezar."}
            </p>
          )}
        </section>

        {ultima && <UltimaVentaRegistrada venta={ultima} />}
      </aside>
    </div>
  );
}
