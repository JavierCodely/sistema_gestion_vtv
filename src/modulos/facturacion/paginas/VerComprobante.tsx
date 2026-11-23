import { ArrowLeft, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Cargando } from "@/compartido/componentes/Cargando";
import { mensajeDeError } from "@/compartido/lib/errores";
import { formatearDia, formatearMoneda } from "@/compartido/lib/formato";
import { Alert, AlertDescription, AlertTitle } from "@/compartido/ui/alert";
import { Button } from "@/compartido/ui/button";
import { type Comprobante, useComprobante } from "../api/consultas";
import { CodigoQr } from "../componentes/CodigoQr";
import {
  ESTADOS,
  formatearCuit,
  formatearDocumento,
  nombreComprobante,
  numeroComprobante,
} from "../lib/formato";

/** Las fechas de ARCA son días (YYYY-MM-DD): se muestran sin pasar por la zona horaria. */
function dia(fecha: string | null): string {
  return fecha ? formatearDia(fecha) : "—";
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{etiqueta}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function Linea({
  etiqueta,
  valor,
  fuerte = false,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div className={fuerte ? "flex justify-between text-[15px] font-bold" : "flex justify-between"}>
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums" data-testid={fuerte ? "comprobante-total" : undefined}>
        {valor}
      </dd>
    </div>
  );
}

/**
 * Ticket para impresora térmica (rollo de 80 o 58 mm, por USB desde Chrome): una columna de ancho
 * fluido (el ancho lo pone el papel elegido en el driver), todo en negro sobre blanco —el gris sale
 * pálido en papel térmico— y siempre claro aunque la app esté en modo oscuro. Los márgenes de la
 * página los fija `@page` en index.css.
 */
function Impreso({ c }: { c: Comprobante }) {
  const nombre = nombreComprobante(c.cbte_tipo);
  const numero = numeroComprobante(c.punto_venta, c.numero);
  const separador = "border-t border-dashed border-black pt-2";
  return (
    <article
      data-testid="ticket"
      className="mx-auto flex w-full max-w-[80mm] flex-col gap-2 bg-white p-3 font-sans text-[13px] leading-snug text-black shadow-sm ring-1 ring-black/10 print:max-w-none print:p-0 print:shadow-none print:ring-0"
      aria-label={`${nombre} ${numero}`}
    >
      {c.ambiente === "homologacion" && (
        <p className="border border-dashed border-black p-1 text-center text-[11px] font-bold uppercase">
          Comprobante de prueba (homologación) · sin validez fiscal
        </p>
      )}

      <header className="flex flex-col items-center gap-0.5 text-center">
        <p className="text-base font-bold">{c.emisor_razon_social ?? "—"}</p>
        <p>{c.emisor_domicilio ?? "—"}</p>
        <p>CUIT: {formatearCuit(c.cuit_emisor)}</p>
        {c.emisor_iibb && <p>IIBB: {c.emisor_iibb}</p>}
        {c.emisor_inicio_actividades && (
          <p>Inicio de actividades: {dia(c.emisor_inicio_actividades)}</p>
        )}
        <p>IVA Responsable Inscripto</p>
      </header>

      <div className={`${separador} flex flex-col items-center gap-0.5 text-center`}>
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center border-2 border-black text-2xl font-bold">
            {c.clase}
          </span>
          <h1 className="text-base font-bold">{nombre}</h1>
        </div>
        <p className="text-[11px]">Cód. {String(c.cbte_tipo).padStart(3, "0")}</p>
        <p className="font-semibold">N° {numero}</p>
        <p>Fecha: {dia(c.fecha)}</p>
      </div>

      <dl className={`${separador} flex flex-col gap-0.5`}>
        <Dato etiqueta="Cliente">{c.receptor_nombre ?? "Consumidor final"}</Dato>
        <Dato etiqueta="Documento">{formatearDocumento(c.doc_tipo, c.doc_nro)}</Dato>
        <Dato etiqueta="Condición frente al IVA">{c.condicion_iva_receptor}</Dato>
        <Dato etiqueta="Período del servicio">{dia(c.fecha_servicio)}</Dato>
        {c.asociado_numero !== null &&
          c.asociado_cbte_tipo !== null &&
          c.asociado_punto_venta !== null && (
            <Dato etiqueta="Comprobante asociado">
              {nombreComprobante(c.asociado_cbte_tipo)}{" "}
              {numeroComprobante(c.asociado_punto_venta, c.asociado_numero)} del{" "}
              {dia(c.asociado_fecha)}
            </Dato>
          )}
      </dl>

      <div className={`${separador} flex flex-col gap-0.5`}>
        <p className="font-semibold">
          {c.servicio_nombre}
          {c.patente && ` · Dominio ${c.patente}`}
        </p>
        <div className="flex justify-between">
          <span>Venta N° {c.venta_id}</span>
          <span className="tabular-nums">
            {formatearMoneda(c.clase === "A" ? c.neto : c.total)}
          </span>
        </div>
      </div>

      <dl className={`${separador} flex flex-col gap-0.5`}>
        {c.clase === "A" ? (
          <>
            <Linea etiqueta="Importe neto gravado" valor={formatearMoneda(c.neto)} />
            <Linea etiqueta="IVA 21 %" valor={formatearMoneda(c.iva)} />
          </>
        ) : (
          // Ley 27.743 (transparencia fiscal): el IVA contenido se informa en la Factura B.
          <Linea etiqueta="IVA contenido" valor={formatearMoneda(c.iva)} />
        )}
        <Linea etiqueta="Total" valor={formatearMoneda(c.total)} fuerte />
      </dl>

      <footer className={`${separador} flex flex-col items-center gap-1 text-center`}>
        {c.qr_url && (
          <CodigoQr
            key={c.qr_url}
            texto={c.qr_url}
            etiqueta="Código QR para verificar en ARCA"
            className="size-36 print:size-[38mm]"
          />
        )}
        <dl className="flex w-full flex-col gap-0.5">
          <Dato etiqueta="CAE">
            <span data-testid="comprobante-cae">{c.cae ?? "—"}</span>
          </Dato>
          <Dato etiqueta="Vencimiento del CAE">{dia(c.cae_vencimiento)}</Dato>
        </dl>
        <p className="text-[11px]">Comprobante autorizado por ARCA</p>
      </footer>
    </article>
  );
}

/** Representación impresa de un comprobante (cajero: los de ventas de turnos abiertos; admin: todos). */
export function VerComprobante() {
  const navegar = useNavigate();
  // Abierto directo (enlace o pestaña nueva): no hay a dónde volver, va al inicio del rol.
  const sinHistorial = useLocation().key === "default";
  const id = Number(useParams().id);
  const idValido = Number.isInteger(id) && id > 0;
  const comprobante = useComprobante(idValido ? id : 0);

  let contenido: ReactNode;
  if (!idValido || (comprobante.isSuccess && comprobante.data === null)) {
    contenido = <p className="text-muted-foreground">El comprobante no existe.</p>;
  } else if (comprobante.isPending) {
    contenido = <Cargando texto="Cargando comprobante…" />;
  } else if (comprobante.isError) {
    contenido = (
      <Alert variant="destructive">
        <AlertDescription>{mensajeDeError(comprobante.error)}</AlertDescription>
      </Alert>
    );
  } else if (comprobante.data && comprobante.data.estado !== "autorizado") {
    const c = comprobante.data;
    contenido = (
      <Alert>
        <AlertTitle>
          {nombreComprobante(c.cbte_tipo)} {ESTADOS[c.estado]?.toLowerCase()}
        </AlertTitle>
        <AlertDescription>Todavía no tiene CAE: no se puede imprimir. {c.mensaje}</AlertDescription>
      </Alert>
    );
  } else if (comprobante.data) {
    contenido = <Impreso c={comprobante.data} />;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6 print:max-w-none print:bg-white print:p-0">
      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <Button
          variant="ghost"
          onClick={() => {
            if (sinHistorial) void navegar("/");
            else void navegar(-1);
          }}
        >
          <ArrowLeft aria-hidden />
          Volver
        </Button>
        {comprobante.data?.estado === "autorizado" && (
          <Button
            variant="outline"
            onClick={() => {
              window.print();
            }}
          >
            <Printer aria-hidden />
            Imprimir
          </Button>
        )}
      </div>
      {contenido}
    </main>
  );
}
