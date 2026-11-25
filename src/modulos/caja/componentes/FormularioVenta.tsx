import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorFormulario } from "@/compartido/componentes/ErrorFormulario";
import { clavesDescuentos } from "@/compartido/lib/claves-descuentos";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearDia, formatearMoneda } from "@/compartido/lib/formato";
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
  consultaCondicionales,
  consultaVentasAnteriores,
  esPrecioCambiado,
  esTurnoNoDisponible,
  esVueltaDeCondicional,
  MEDIOS_PAGO,
  MENSAJES_ERROR_VENTA,
  ORDEN_MEDIOS,
  useCertificadoDeServicio,
  useRegistrarVenta,
  type CobroVenta,
  type CondicionalDePatente,
  type MedioPago,
  type VentaAnteriorDePatente,
} from "../api/consultas";
import { mitadCondicional, saldoCondicional } from "../lib/condicional";
import { CAMPO_GRANDE } from "../lib/estilos";
import { pagosMixtos, revisarPagoMixto, type MedioResto } from "../lib/pago-mixto";
import { detallePagos } from "../lib/pagos";
import { validarVenta } from "../lib/validaciones";
import { calcularVuelto, limpiarPatente } from "../lib/vuelto";
import { AvisoCertificado } from "./AvisoCertificado";
import { BotonVolverPaso } from "./BotonVolverPaso";
import { DatoVenta } from "./DatoVenta";
import { DialogoCondicionalVencida } from "./DialogoCondicionalVencida";
import { DialogoPatenteRepetida } from "./DialogoPatenteRepetida";
import { ListaOpciones } from "./ListaOpciones";
import { PasoConfirmarVenta } from "./PasoConfirmarVenta";
import { PasoEfectivo } from "./PasoEfectivo";
import { PasoEfectivoMixto, PasoRestoMixto } from "./PasoPagoMixto";
import { UltimaVentaRegistrada, type UltimaVenta } from "./UltimaVentaRegistrada";

type Paso =
  | "patente"
  | "condicional"
  | "vencida"
  | "categoria"
  | "servicio"
  | "certificado"
  | "descuento"
  | "pago-condicional"
  | "medio"
  | "mixto"
  | "mixto-resto"
  | "efectivo"
  | "confirmar";

type OpcionMedio = MedioPago | "mixto";

const OPCIONES_MEDIO: { valor: OpcionMedio; etiqueta: string }[] = [
  ...ORDEN_MEDIOS.map((m) => ({ valor: m, etiqueta: MEDIOS_PAGO[m] })),
  { valor: "mixto", etiqueta: "Mixto" },
];

/** Valor de la opción "Sin descuento" en la lista (los descuentos tienen id > 0). */
const SIN_DESCUENTO = 0;
/** "Es otra venta" en las listas de la condicional (las condicionales tienen id > 0). */
const OTRA_VENTA = 0;

const AVISO_DESCUENTO_NO_DISPONIBLE = "El descuento elegido ya no está disponible: elegí otro.";
const AVISO_DESCUENTO_SIN_OTROS =
  "El descuento elegido ya no está disponible y este servicio no tiene otros: la venta sigue sin descuento. Revisá el precio y confirmá.";

/** Lo que se va a registrar al confirmar (se arma en el paso del medio o del efectivo). */
interface Pendiente {
  cobro: CobroVenta;
  recibido: number | null;
  /** Paso al que vuelve Esc desde la confirmación. */
  desde: Paso;
}

/**
 * Venta paso a paso, pensada para usar solo con el teclado y leer de lejos:
 * patente → (si ya tiene ventas) aviso con sus ventas anteriores y "¿Continuar?" → (si tiene una condicional vigente) la vuelta del servicio, que cobra lo que faltaba, o (si
 * venció) otra condicional o el servicio completo → categoría → servicio → (si el servicio tiene un
 * certificado condicional) el de siempre o el condicional → (si el servicio tiene) descuento →
 * (condicional sin descuento) total o 50% → medio de pago → (mixto) cuánto paga en efectivo → con qué
 * paga el resto → (con efectivo) cuánto entregó y el vuelto → confirmación con la patente en grande.
 * Números o flechas para marcar, Enter para seguir, Esc para volver.
 *
 * Los montos en pantalla son una vista previa (precio del servicio, precio final que calculó la BD en
 * `descuentos_para_servicio`, la mitad de la condicional o el saldo de `condicionales_de_patente`); lo
 * que se cobra lo decide y lo devuelve `registrar_venta`. La venta manda el precio que ve el cajero
 * (`p_precio_esperado`): si cambió, la BD la rechaza, se relee el catálogo y el cajero vuelve a revisar
 * antes de confirmar otra vez. Nunca se reintenta sola, y un descuento elegido que dejó de existir
 * nunca se cobra "sin descuento" sin que el cajero lo vea.
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
  const [paso, setPaso] = useState<Paso>("patente");
  const [patente, setPatente] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [servicioId, setServicioId] = useState<number | null>(null);
  const [descuentoId, setDescuentoId] = useState<number | null>(null);
  // Se eligió el certificado condicional del servicio (migración 42).
  const [condicional, setCondicional] = useState(false);
  const [mitad, setMitad] = useState(false);
  const [medio, setMedio] = useState<OpcionMedio | null>(null);
  const [efectivoMixto, setEfectivoMixto] = useState("");
  const [medioResto, setMedioResto] = useState<MedioResto | null>(null);
  const [errorMixto, setErrorMixto] = useState(false);
  const [recibido, setRecibido] = useState("");
  const [errorRecibido, setErrorRecibido] = useState<string | null>(null);
  const [errorPatente, setErrorPatente] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [ultima, setUltima] = useState<UltimaVenta | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  // Condicionales sin usar de la patente, leídas al pasar el paso de la patente (migración 41).
  const [condicionales, setCondicionales] = useState<CondicionalDePatente[]>([]);
  // La vuelta se eligió en la pantalla "Vuelve de condicional" (Esc desde el medio vuelve ahí).
  const [vueltaElegida, setVueltaElegida] = useState(false);
  // "Continuar con el certificado" en el aviso de condicional vencida: vuelta fuera de plazo (migración 46).
  const [vueltaVencida, setVueltaVencida] = useState(false);
  const [buscandoCondicional, setBuscandoCondicional] = useState(false);
  // Patente repetida (migración 45): sus ventas anteriores y el paso al que sigue si continúa.
  const [repetida, setRepetida] = useState<{
    ventas: VentaAnteriorDePatente[];
    siguiente: Paso;
  } | null>(null);
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
  const vendible = (id: number) => grupos.some((g) => g.servicios.some((s) => s.id === id));

  const vigentes = condicionales.filter((c) => c.vigente);
  const vencida = vigentes.length === 0 ? (condicionales.find((c) => !c.vigente) ?? null) : null;
  // Vuelve de una condicional de este servicio: cobra lo que faltaba, sin descuento (lo confirma la BD).
  // Fuera de plazo, solo si se eligió continuar con el certificado de la vencida.
  const vuelta =
    vigentes.find((c) => c.servicio_id === servicioId) ??
    (vueltaVencida && vencida?.servicio_id === servicioId ? vencida : null);
  const esVueltaVencida = vuelta !== null && !vuelta.vigente;
  // Certificados del servicio: el de siempre y, si tiene, el condicional (solo los que llevan hoja).
  const conHoja = servicio?.requiere_certificado ? servicio.id : null;
  const certificadoDeSiempre = useCertificadoDeServicio(conHoja);
  const certificadoCondicional = useCertificadoDeServicio(conHoja, true);
  const servicioVencida = servicios.find((s) => s.id === vencida?.servicio_id);
  const certificadoCondicionalVencida = useCertificadoDeServicio(
    servicioVencida?.requiere_certificado ? servicioVencida.id : null,
    true,
  );
  const esCondicional = condicional && vuelta === null;

  const opcionesDescuento = descuentos.data ?? [];
  const hayDescuentos = opcionesDescuento.length > 0;
  const descuento =
    vuelta === null ? (opcionesDescuento.find((d) => d.id === descuentoId) ?? null) : null;
  // El elegido ya no se ofrece (el admin lo desactivó, lo quitó del servicio o cambió el precio y
  // ahora redondea a $ 0): no se registra la venta sin él.
  const descuentoPerdido = vuelta === null && descuentoId !== null && descuento === null;
  // Al 50% solo una condicional sin descuento (con descuento se paga completa).
  const alMitad = mitad && esCondicional && descuentoId === null && servicio !== undefined;
  // Vista previa de lo que se cobra ahora.
  const precioFinal =
    vuelta !== null
      ? vuelta.saldo
      : alMitad
        ? mitadCondicional(servicio.precio)
        : (descuento?.precio_final ?? servicio?.precio ?? 0);
  const revisionMixto = revisarPagoMixto(efectivoMixto, precioFinal);
  const partesMixto =
    revisionMixto.efectivo !== null && revisionMixto.resto !== null && medioResto !== null
      ? pagosMixtos(revisionMixto.efectivo, revisionMixto.resto, medioResto)
      : [];

  // Sin certificado condicional (o si no lleva hoja) el paso del certificado no existe. Si no se pudo
  // leer, tampoco: se vende con el de siempre y se avisa en el paso del descuento.
  const sinPasoCertificado =
    conHoja === null ||
    certificadoCondicional.isError ||
    (certificadoCondicional.isSuccess && certificadoCondicional.data === null);
  // Sin descuentos para el servicio (o si no se pudieron leer: la venta no se traba), el paso de
  // descuento no existe y se sigue con el siguiente.
  const sinPasoDescuento = descuentos.isError || (descuentos.isSuccess && !hayDescuentos);
  // Después del descuento: total o 50% en una condicional sin descuento; si no, el medio.
  const despuesDeDescuento: Paso =
    esCondicional && descuentoId === null ? "pago-condicional" : "medio";
  const antesDeDescuento: Paso = sinPasoCertificado ? "servicio" : "certificado";
  const pasoSinCertificado: Paso =
    paso === "certificado" && sinPasoCertificado ? "descuento" : paso;
  const pasoVisible: Paso =
    pasoSinCertificado === "descuento" && sinPasoDescuento
      ? despuesDeDescuento
      : pasoSinCertificado;

  function irA(destino: Paso) {
    setErrorServidor(null);
    setErrorRecibido(null);
    setErrorPatente(null);
    setErrorMixto(false);
    setPaso(destino);
  }

  function limpiarCobro() {
    setMedio(null);
    setEfectivoMixto("");
    setMedioResto(null);
    setRecibido("");
    setPendiente(null);
  }

  function reiniciar() {
    setPatente("");
    setCategoriaId(null);
    setServicioId(null);
    setDescuentoId(null);
    setCondicional(false);
    setMitad(false);
    setCondicionales([]);
    setVueltaElegida(false);
    setVueltaVencida(false);
    setRepetida(null);
    limpiarCobro();
    irA("patente");
  }

  /** Elige un servicio (con su categoría) desde las pantallas de la condicional. */
  function elegirServicio(id: number) {
    const elegido = servicios.find((s) => s.id === id);
    if (!elegido) return;
    if (id !== servicioId) {
      setDescuentoId(null);
      setCondicional(false);
      setMitad(false);
    }
    setCategoriaId(elegido.categoria_id);
    setServicioId(id);
    limpiarCobro();
  }

  /**
   * Lo que sigue al elegir un servicio: la vuelta va directo al cobro; el resto, a elegir el
   * certificado (si tiene uno condicional) y al descuento.
   */
  function despuesDeServicio(id: number, desde: "condicional" | "servicio") {
    const vigente = vigentes.find((c) => c.servicio_id === id);
    if (!vigente) {
      irA("certificado");
      return;
    }
    irAlCobroDeVuelta(vigente.saldo, desde);
  }

  /**
   * La vuelta (dentro o fuera de plazo) entrega el certificado de siempre, sin descuento ni 50%: sin
   * saldo va directo a confirmar; si falta el 50%, al medio de pago.
   */
  function irAlCobroDeVuelta(saldo: number, desde: Paso) {
    setCondicional(false);
    setDescuentoId(null);
    setMitad(false);
    if (saldo === 0) {
      // Sin cargo: no hay medio que elegir (va como efectivo, $ 0); directo a confirmar.
      setPendiente({ cobro: { medio: "efectivo" }, recibido: null, desde });
      irA("confirmar");
    } else {
      irA("medio");
    }
  }

  /**
   * Vuelve al paso del descuento (o al siguiente, si el servicio ya no tiene) con el mensaje a la
   * vista: el precio final cambió y el reparto o lo entregado de antes ya no sirven.
   */
  function volverARevisar(mensaje: string, { sinDescuento }: { sinDescuento: boolean }) {
    if (sinDescuento) setDescuentoId(null);
    limpiarCobro();
    irA("descuento");
    setErrorServidor(mensaje);
  }

  /** Descuentos vigentes del servicio, ya releídos (`useRegistrarVenta` los invalida en onError). */
  function descuentosVigentes(id: number): DescuentoParaServicio[] {
    return (
      queryClient.getQueryData<DescuentoParaServicio[]>(clavesDescuentos.paraServicio(id)) ?? []
    );
  }

  /**
   * Al pasar la patente: busca sus condicionales sin usar (vigentes o vencidas) y sus ventas
   * anteriores. Si ya tiene ventas, primero el aviso de patente repetida; al continuar, lo de siempre.
   */
  async function revisarPatente() {
    if (buscandoCondicional) return;
    setBuscandoCondicional(true);
    const [condicionalesLeidas, anteriores] = await Promise.allSettled([
      queryClient.query(consultaCondicionales(patente)),
      queryClient.query(consultaVentasAnteriores(patente)),
    ]);
    setBuscandoCondicional(false);
    if (condicionalesLeidas.status === "rejected") {
      setCondicionales([]);
      setErrorPatente(
        `No se pudo revisar si la patente tiene una condicional: ${mensajeDeError(condicionalesLeidas.reason)}`,
      );
      return;
    }
    if (anteriores.status === "rejected") {
      setCondicionales([]);
      setErrorPatente(
        `No se pudieron revisar las ventas anteriores de la patente: ${mensajeDeError(anteriores.reason)}`,
      );
      return;
    }
    const lista = condicionalesLeidas.value;
    setCondicionales(lista);
    setVueltaElegida(false);
    setVueltaVencida(false);
    const siguiente: Paso = lista.some((c) => c.vigente)
      ? "condicional"
      : lista.length > 0
        ? "vencida"
        : "categoria";
    if (anteriores.value.length > 0) {
      setRepetida({ ventas: anteriores.value, siguiente });
      return;
    }
    irA(siguiente);
  }

  function prepararConfirmacion(cobro: CobroVenta, montoRecibido: number | null, desde: Paso) {
    if (descuentoPerdido) {
      volverARevisar(hayDescuentos ? AVISO_DESCUENTO_NO_DISPONIBLE : AVISO_DESCUENTO_SIN_OTROS, {
        sinDescuento: true,
      });
      return;
    }
    setPendiente({ cobro, recibido: montoRecibido, desde });
    irA("confirmar");
  }

  async function confirmar() {
    if (!servicio || !pendiente || registrar.isPending) return;
    const { cobro, recibido: montoRecibido } = pendiente;
    const resultado = validarVenta({
      servicioId: servicio.id,
      cobro,
      patente,
      descuentoId: vuelta === null ? (descuento?.id ?? null) : null,
      precioEsperado: precioFinal,
      condicional: esCondicional,
      condicionalMitad: alMitad,
      vueltaVencida: esVueltaVencida ? vuelta.venta_id : null,
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
      // Una vuelta sin saldo es sin cargo: no hay efectivo ni vuelto.
      const sinCargo = venta.vuelta_de !== null && venta.precio === 0;
      const efectivo = sinCargo
        ? null
        : "medio" in cobro
          ? cobro.medio === "efectivo"
            ? venta.precio
            : null
          : (cobro.pagos.find((p) => p.medio === "efectivo")?.monto ?? null);
      const nueva: UltimaVenta = {
        id: venta.id,
        servicio: venta.servicio_nombre,
        patente: venta.patente ?? patente,
        vuelta: venta.vuelta_de !== null,
        saldoCondicional: venta.condicional_saldo ?? 0,
        precio: venta.precio,
        descuento:
          venta.descuento_nombre === null
            ? null
            : { nombre: venta.descuento_nombre, monto: venta.monto_descuento },
        medio: sinCargo ? "Sin cargo" : "medio" in cobro ? MEDIOS_PAGO[cobro.medio] : "Mixto",
        detallePagos: "medio" in cobro ? null : detallePagos(cobro.pagos),
        efectivo,
        recibido: montoRecibido,
        sinStock: venta.sin_stock,
      };
      const marca =
        venta.vuelta_de !== null
          ? esVueltaVencida
            ? " (vuelta de condicional fuera de plazo)"
            : " (vuelta de condicional)"
          : (venta.condicional_saldo ?? 0) > 0
            ? " (condicional al 50%)"
            : venta.condicional_vence !== null
              ? " (condicional)"
              : "";
      const texto = `Venta N° ${String(venta.id)}: ${venta.servicio_nombre} · ${formatearMoneda(venta.precio)}${marca}`;
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
      if (esVueltaDeCondicional(e)) {
        // La caja no vio la condicional o su saldo cambió: se revisa la patente otra vez.
        setCondicionales([]);
        setVueltaVencida(false);
        setServicioId(null);
        setCategoriaId(null);
        setDescuentoId(null);
        setCondicional(false);
        setMitad(false);
        limpiarCobro();
        irA("patente");
        setErrorServidor(mensaje);
        return;
      }
      if (!esPrecioCambiado(e)) {
        setErrorServidor(mensaje);
        return;
      }
      // El catálogo y los descuentos ya se releyeron: el cajero ve el precio nuevo y confirma de nuevo.
      const vigentesDesc = descuentosVigentes(servicio.id);
      const sigue = descuentoId === null || vigentesDesc.some((d) => d.id === descuentoId);
      const aviso =
        vigentesDesc.length > 0 ? AVISO_DESCUENTO_NO_DISPONIBLE : AVISO_DESCUENTO_SIN_OTROS;
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
      prepararConfirmacion({ medio: opcion }, null, "medio");
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
      prepararConfirmacion(cobroEnEfectivo, null, "efectivo");
      return;
    }
    const monto = Number(recibido);
    const vuelto = calcularVuelto(aCobrarEnEfectivo, monto);
    if (vuelto < 0) {
      setErrorRecibido(`No alcanza: faltan ${formatearMoneda(-vuelto)}.`);
      return;
    }
    prepararConfirmacion(cobroEnEfectivo, monto, "efectivo");
  }

  if (grupos.length === 0) {
    return (
      <p className="rounded-lg border p-8 text-center text-2xl text-muted-foreground">
        No hay servicios para vender. Pedile al administrador que los cargue.
      </p>
    );
  }

  /** Esc desde el medio de pago. */
  const volverDeMedio = () => {
    if (vuelta !== null)
      irA(esVueltaVencida ? "vencida" : vueltaElegida ? "condicional" : "servicio");
    else if (esCondicional && descuentoId === null) irA("pago-condicional");
    else irA(hayDescuentos ? "descuento" : antesDeDescuento);
  };
  /** Esc desde el pago de la condicional. */
  const volverDePagoCondicional = () => {
    irA(hayDescuentos ? "descuento" : antesDeDescuento);
  };
  /** Esc desde la categoría: a la pantalla de la condicional si la hubo; si no, a la patente. */
  const volverDeCategoria = () => {
    irA(vigentes.length > 0 ? "condicional" : vencida ? "vencida" : "patente");
  };

  // Texto del medio en la confirmación.
  const textoMedio =
    pendiente === null
      ? ""
      : vuelta !== null && precioFinal === 0
        ? "Sin cargo"
        : "medio" in pendiente.cobro
          ? MEDIOS_PAGO[pendiente.cobro.medio]
          : `Mixto: ${detallePagos(pendiente.cobro.pagos)}`;
  const detalleConfirmacion = [
    ...(vuelta !== null
      ? [
          `${esVueltaVencida ? "Vuelta fuera de plazo" : "Vuelta"} de la condicional del ${formatearDia(vuelta.fecha)}${esVueltaVencida ? ` (venció el ${formatearDia(vuelta.vence)})` : ""}${vuelta.saldo > 0 ? ": cobra el 50% que faltaba" : ": sin cargo"}.`,
        ]
      : []),
    ...(esCondicional
      ? [
          `Condicional${certificadoCondicional.data ? ` con “${certificadoCondicional.data.nombre}”` : ""}${certificadoCondicional.data?.dias_vuelta ? `: vuelve dentro de ${String(certificadoCondicional.data.dias_vuelta)} días` : ""}.`,
        ]
      : []),
    ...(alMitad
      ? [
          `Condicional al 50%: al volver dentro del plazo paga ${formatearMoneda(saldoCondicional(servicio.precio))}.`,
        ]
      : []),
    ...(pendiente?.recibido !== null && pendiente?.recibido !== undefined
      ? [
          `Entregó ${formatearMoneda(pendiente.recibido)} · Vuelto ${formatearMoneda(calcularVuelto(aCobrarEnEfectivo, pendiente.recibido))}`,
        ]
      : []),
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section aria-label="Nueva venta" className="flex min-w-0 flex-col gap-4">
        {pasoVisible === "patente" && (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              // Obligatoria (migración 38): la BD también la exige en toda venta con turno.
              if (patente === "") {
                setErrorPatente("Ingresá la patente del vehículo.");
                return;
              }
              void revisarPatente();
            }}
          >
            <Label htmlFor="venta-patente" className="text-2xl font-semibold md:text-3xl">
              1. Patente
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
              required
              aria-invalid={errorPatente ? true : undefined}
              aria-describedby={errorPatente ? "venta-patente-error" : undefined}
              onChange={(e) => {
                setErrorPatente(null);
                setCondicionales([]);
                setPatente(limpiarPatente(e.target.value));
              }}
            />
            {errorPatente && (
              <p
                id="venta-patente-error"
                role="alert"
                className="text-2xl font-semibold text-destructive"
              >
                {errorPatente}
              </p>
            )}
            <p className="text-base text-muted-foreground">
              Enter para seguir: se revisa si ya tiene ventas o una condicional.
            </p>
            <Button
              type="submit"
              size="lg"
              className="h-14 self-start px-8 text-xl"
              disabled={buscandoCondicional}
            >
              {buscandoCondicional ? "Revisando…" : "Continuar"}
            </Button>
          </form>
        )}

        {pasoVisible === "condicional" && (
          <div className="flex flex-col gap-4" data-testid="paso-condicional">
            <BotonVolverPaso
              onVolver={() => {
                irA("patente");
              }}
            />
            {vigentes.map((c) => (
              <p key={c.venta_id} className="text-xl">
                {`La patente ${patente} tiene una condicional de “${c.servicio_nombre}” del ${formatearDia(c.fecha)} (certificado “${c.condicional_nombre}”, vence el ${formatearDia(c.vence)}). `}
                {c.saldo > 0
                  ? `Pagó ${formatearMoneda(c.pagado)} (50%): faltan ${formatearMoneda(c.saldo)}.`
                  : "Pagó el total: la vuelta es sin cargo."}
                {!vendible(c.servicio_id) &&
                  ` El servicio “${c.servicio_nombre}” está desactivado: pedile al administrador que lo active.`}
              </p>
            ))}
            <ListaOpciones
              key="condicional"
              titulo="Vuelve de condicional"
              opciones={[
                ...vigentes
                  .filter((c) => vendible(c.servicio_id))
                  .map((c) => ({
                    valor: c.venta_id,
                    etiqueta: `Aprobó: ${c.servicio_nombre}`,
                    detalle: c.saldo > 0 ? formatearMoneda(c.saldo) : "Sin cargo",
                  })),
                { valor: OTRA_VENTA, etiqueta: "Es otra venta" },
              ]}
              onElegir={(valor) => {
                const elegida = vigentes.find((c) => c.venta_id === valor);
                if (!elegida) {
                  setVueltaElegida(false);
                  irA("categoria");
                  return;
                }
                setVueltaElegida(true);
                elegirServicio(elegida.servicio_id);
                despuesDeServicio(elegida.servicio_id, "condicional");
              }}
              onVolver={() => {
                irA("patente");
              }}
            />
          </div>
        )}

        {pasoVisible === "vencida" && vencida && (
          <DialogoCondicionalVencida
            vencida={vencida}
            patente={patente}
            vendible={vendible(vencida.servicio_id)}
            ofrecerNueva={Boolean(certificadoCondicionalVencida.data)}
            revisando={
              servicioVencida?.requiere_certificado === true &&
              certificadoCondicionalVencida.isPending
            }
            aviso={
              certificadoCondicionalVencida.isError && (
                <p className="text-base text-destructive">
                  {`No se pudo revisar el certificado condicional: ${mensajeDeError(certificadoCondicionalVencida.error)}`}
                </p>
              )
            }
            onElegir={(opcion) => {
              if (opcion === "otra") {
                setVueltaVencida(false);
                irA("categoria");
                return;
              }
              elegirServicio(vencida.servicio_id);
              if (opcion === "continuar") {
                // Vuelta fuera de plazo: cobra lo que faltaba con el certificado de siempre.
                setVueltaVencida(true);
                irAlCobroDeVuelta(vencida.saldo, "vencida");
                return;
              }
              setVueltaVencida(false);
              // Después de elegirServicio (que lo reinicia al cambiar de servicio).
              setCondicional(opcion === "nueva");
              irA("descuento");
            }}
            onVolver={() => {
              irA("patente");
            }}
          />
        )}

        {pasoVisible === "categoria" && (
          <>
            <BotonVolverPaso onVolver={volverDeCategoria} />
            <ListaOpciones
              key="categoria"
              titulo="2. Categoría"
              opciones={grupos.map((g) => ({
                valor: g.categoria.id,
                etiqueta: g.categoria.nombre,
              }))}
              inicial={categoriaId ?? undefined}
              onElegir={(id) => {
                if (id !== categoriaId) {
                  setServicioId(null);
                  setDescuentoId(null);
                  setMitad(false);
                }
                setCategoriaId(id);
                irA("servicio");
              }}
              onVolver={volverDeCategoria}
            />
          </>
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
              titulo={`3. Servicio · ${grupo.categoria.nombre}`}
              opciones={grupo.servicios.map((s) => ({
                valor: s.id,
                etiqueta: s.nombre,
                detalle: formatearMoneda(s.precio),
              }))}
              inicial={servicioId ?? undefined}
              onElegir={(id) => {
                setVueltaElegida(false);
                elegirServicio(id);
                despuesDeServicio(id, "servicio");
              }}
              onVolver={() => {
                irA("categoria");
              }}
            />
          </>
        )}

        {pasoVisible === "certificado" && servicio && (
          <>
            <BotonVolverPaso
              onVolver={() => {
                irA("servicio");
              }}
            />
            {certificadoCondicional.isPending ? (
              <p className="text-2xl text-muted-foreground">Buscando los certificados…</p>
            ) : (
              <ListaOpciones
                key={`certificado-${String(servicio.id)}`}
                titulo={`Certificado · ${servicio.nombre}`}
                opciones={[
                  {
                    valor: false,
                    etiqueta: certificadoDeSiempre.data?.nombre ?? "Certificado de siempre",
                    detalle: "Aprobado",
                  },
                  {
                    valor: true,
                    etiqueta: certificadoCondicional.data?.nombre ?? "Certificado condicional",
                    detalle: certificadoCondicional.data?.dias_vuelta
                      ? `Condicional · ${String(certificadoCondicional.data.dias_vuelta)} días`
                      : "Condicional",
                  },
                ]}
                inicial={condicional}
                onElegir={(valor) => {
                  setCondicional(valor);
                  if (!valor) setMitad(false);
                  limpiarCobro();
                  irA("descuento");
                }}
                onVolver={() => {
                  irA("servicio");
                }}
              />
            )}
          </>
        )}

        {pasoVisible === "descuento" && servicio && (
          <>
            <BotonVolverPaso
              onVolver={() => {
                irA(antesDeDescuento);
              }}
            />
            {certificadoCondicional.isError && (
              <p className="text-base text-destructive">
                {`No se pudo revisar si el servicio tiene un certificado condicional: ${mensajeDeError(certificadoCondicional.error)}`}
              </p>
            )}
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
                  const elegido = id === SIN_DESCUENTO ? null : id;
                  setDescuentoId(elegido);
                  if (elegido !== null) setMitad(false);
                  irA(esCondicional && elegido === null ? "pago-condicional" : "medio");
                }}
                onVolver={() => {
                  irA(antesDeDescuento);
                }}
              />
            )}
            {esCondicional && hayDescuentos && (
              <p className="text-base text-muted-foreground">
                Con un descuento la condicional se paga completa (no al 50%).
              </p>
            )}
          </>
        )}

        {pasoVisible === "pago-condicional" && servicio && (
          <>
            <BotonVolverPaso onVolver={volverDePagoCondicional} />
            <ListaOpciones
              key={`pago-condicional-${String(servicio.id)}`}
              titulo={`¿Cuánto paga? · ${servicio.nombre}`}
              opciones={[
                { valor: false, etiqueta: "Total", detalle: formatearMoneda(servicio.precio) },
                {
                  valor: true,
                  etiqueta: "50% ahora, el resto al volver",
                  detalle: formatearMoneda(mitadCondicional(servicio.precio)),
                },
              ]}
              inicial={mitad}
              onElegir={(valor) => {
                setMitad(valor);
                limpiarCobro();
                irA("medio");
              }}
              onVolver={volverDePagoCondicional}
            />
          </>
        )}

        {pasoVisible === "medio" && (
          <>
            <BotonVolverPaso onVolver={volverDeMedio} />
            <ListaOpciones
              key="medio"
              titulo="4. Medio de pago"
              horizontal
              deshabilitada={registrar.isPending}
              opciones={OPCIONES_MEDIO}
              inicial={medio ?? undefined}
              onElegir={elegirMedio}
              onVolver={volverDeMedio}
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
              prepararConfirmacion(cobroEnEfectivo, null, "efectivo");
            }}
            onVolver={() => {
              irA(esMixto ? "mixto-resto" : "medio");
            }}
          />
        )}

        {pasoVisible === "confirmar" && servicio && pendiente && (
          <PasoConfirmarVenta
            patente={patente}
            servicio={servicio.nombre}
            precio={precioFinal}
            medio={textoMedio}
            detalle={detalleConfirmacion}
            ocupado={registrar.isPending}
            onConfirmar={() => void confirmar()}
            onVolver={() => {
              irA(pendiente.desde);
            }}
          />
        )}

        <ErrorFormulario mensaje={errorServidor} />
        {repetida && pasoVisible === "patente" && (
          <DialogoPatenteRepetida
            patente={patente}
            ventas={repetida.ventas}
            onContinuar={() => {
              const { siguiente } = repetida;
              setRepetida(null);
              irA(siguiente);
            }}
            onCancelar={() => {
              setRepetida(null);
              setCondicionales([]);
            }}
          />
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <section
          aria-labelledby="titulo-venta-en-curso"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="titulo-venta-en-curso" className="text-xl font-semibold text-muted-foreground">
            Venta en curso
          </h2>
          {paso !== "patente" && patente !== "" && (
            <DatoVenta etiqueta="Patente">
              <span className="font-mono text-3xl font-bold tracking-widest">{patente}</span>
            </DatoVenta>
          )}
          {servicio ? (
            <dl className="flex flex-col gap-3">
              <DatoVenta etiqueta="Servicio">{servicio.nombre}</DatoVenta>
              <div className="flex flex-col">
                <dt className="text-base text-muted-foreground">
                  {descuento || vuelta || alMitad ? "Precio final" : "Precio"}
                </dt>
                <dd className="text-5xl font-bold tabular-nums md:text-6xl" data-testid="precio">
                  {formatearMoneda(precioFinal)}
                </dd>
                {vuelta && (
                  <dd className="text-lg text-muted-foreground" data-testid="vuelta-en-curso">
                    {`Vuelta de condicional${esVueltaVencida ? " fuera de plazo" : ""}: ${vuelta.saldo > 0 ? "el 50% que faltaba" : "sin cargo"}`}
                  </dd>
                )}
                {alMitad && (
                  <dd className="text-lg text-muted-foreground" data-testid="mitad-en-curso">
                    {`Condicional al 50% · al volver: ${formatearMoneda(saldoCondicional(servicio.precio))}`}
                  </dd>
                )}
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
              {pasoVisible === "efectivo" && (
                <DatoVenta etiqueta="Medio">
                  {esMixto ? `Mixto: ${detallePagos(partesMixto)}` : "Efectivo"}
                </DatoVenta>
              )}
              {esCondicional && (
                <DatoVenta etiqueta="Certificado">
                  <span data-testid="condicional-en-curso">
                    {`Condicional${certificadoCondicional.data?.dias_vuelta ? ` · vuelve dentro de ${String(certificadoCondicional.data.dias_vuelta)} días` : ""}`}
                  </span>
                </DatoVenta>
              )}
              <AvisoCertificado servicio={servicio} condicional={esCondicional} />
            </dl>
          ) : (
            <p className="text-xl text-muted-foreground">
              {grupo
                ? `Categoría: ${grupo.categoria.nombre}`
                : paso === "patente"
                  ? "Escribí la patente para empezar."
                  : "Elegí una categoría."}
            </p>
          )}
        </section>

        {ultima && <UltimaVentaRegistrada venta={ultima} />}
      </aside>
    </div>
  );
}
