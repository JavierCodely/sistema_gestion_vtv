import type { ReactNode } from "react";
import { formatearDia, formatearMoneda } from "@/compartido/lib/formato";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/compartido/ui/dialog";
import type { CondicionalDePatente } from "../api/consultas";
import { ListaOpciones, type Opcion } from "./ListaOpciones";

/** Lo que se puede hacer con una condicional vencida. */
export type OpcionVencida = "continuar" | "completo" | "nueva" | "otra";

/**
 * Aviso de condicional vencida (migración 46): se pasó el límite de días. Ofrece continuar con el
 * certificado (vuelta fuera de plazo: cobra lo que faltaba, $ 0 si pagó el total), cobrar el servicio
 * completo, generar otra condicional (si el servicio tiene certificado condicional) o es otra venta.
 * Números o flechas y Enter; Esc vuelve a la patente.
 */
export function DialogoCondicionalVencida({
  vencida,
  patente,
  vendible,
  ofrecerNueva,
  aviso,
  revisando,
  onElegir,
  onVolver,
}: {
  vencida: CondicionalDePatente;
  patente: string;
  /** El servicio de la condicional se puede vender (activo, de una categoría activa). */
  vendible: boolean;
  /** El servicio tiene certificado condicional: se puede generar otra. */
  ofrecerNueva: boolean;
  /** Texto extra (ej. revisando o no se pudo revisar el certificado condicional). */
  aviso?: ReactNode;
  /** Todavía se revisa si el servicio tiene certificado condicional: las opciones esperan. */
  revisando: boolean;
  onElegir: (opcion: OpcionVencida) => void;
  onVolver: () => void;
}) {
  const opciones: Opcion<OpcionVencida>[] = [
    ...(vendible
      ? [
          {
            valor: "continuar" as const,
            etiqueta: "Continuar con el certificado",
            detalle: vencida.saldo > 0 ? formatearMoneda(vencida.saldo) : "Sin cargo",
          },
          {
            valor: "completo" as const,
            etiqueta: `Cobrar ${vencida.servicio_nombre} completo`,
          },
        ]
      : []),
    ...(vendible && ofrecerNueva
      ? [{ valor: "nueva" as const, etiqueta: "Generar otra condicional" }]
      : []),
    { valor: "otra", etiqueta: "Es otra venta" },
  ];
  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onVolver();
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="paso-condicional-vencida"
        showCloseButton={false}
        // El foco lo toma la lista de opciones (se maneja con el teclado).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl text-amber-700 dark:text-amber-400">
            Se pasó el límite de días de la condicional
          </DialogTitle>
          <DialogDescription className="text-lg text-foreground">
            {`La condicional de “${vencida.servicio_nombre}” de la patente ${patente} del ${formatearDia(vencida.fecha)} (certificado “${vencida.condicional_nombre}”) venció el ${formatearDia(vencida.vence)}. `}
            {vencida.saldo > 0
              ? `Pagó ${formatearMoneda(vencida.pagado)} (50%): si continúa con el certificado, paga los ${formatearMoneda(vencida.saldo)} que faltan.`
              : `Pagó el total (${formatearMoneda(vencida.pagado)}): si continúa con el certificado, es sin cargo.`}
            {!vendible &&
              ` El servicio “${vencida.servicio_nombre}” está desactivado: pedile al administrador que lo active.`}
          </DialogDescription>
        </DialogHeader>
        {aviso}
        {revisando ? (
          <p className="text-2xl text-muted-foreground">Revisando el certificado condicional…</p>
        ) : (
          <ListaOpciones
            key="vencida"
            titulo="¿Qué hacés con la condicional vencida?"
            opciones={opciones}
            onElegir={onElegir}
            onVolver={onVolver}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
