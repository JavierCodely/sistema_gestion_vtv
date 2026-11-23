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
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Impreso({ c }: { c: Comprobante }) {
  const nombre = nombreComprobante(c.cbte_tipo);
  const numero = numeroComprobante(c.punto_venta, c.numero);
  return (
    <article
      className="flex flex-col gap-4 rounded-md border bg-background p-6 print:border-0 print:p-0"
      aria-label={`${nombre} ${numero}`}
    >
      {c.ambiente === "homologacion" && (
        <p className="rounded-md border border-dashed p-2 text-center text-sm font-semibold uppercase">
          Comprobante de prueba (homologación) · sin validez fiscal
        </p>
      )}

      <header className="grid gap-4 border-b pb-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-lg font-semibold">{c.emisor_razon_social ?? "—"}</p>
          <p>{c.emisor_domicilio ?? "—"}</p>
          <p>IVA Responsable Inscripto</p>
        </div>
        <div className="flex flex-col items-center">
          <span className="flex size-14 items-center justify-center rounded-md border-2 text-3xl font-bold">
            {c.clase}
          </span>
          <span className="text-xs text-muted-foreground">
            Cód. {String(c.cbte_tipo).padStart(3, "0")}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:text-right">
          <h1 className="text-lg font-semibold">{nombre}</h1>
          <p>N° {numero}</p>
          <p>Fecha: {dia(c.fecha)}</p>
          <p>CUIT: {formatearCuit(c.cuit_emisor)}</p>
          {c.emisor_iibb && <p>IIBB: {c.emisor_iibb}</p>}
          {c.emisor_inicio_actividades && (
            <p>Inicio de actividades: {dia(c.emisor_inicio_actividades)}</p>
          )}
        </div>
      </header>

      <dl className="grid gap-3 border-b pb-4 text-sm sm:grid-cols-2">
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

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 font-medium">Descripción</th>
            <th className="py-1 text-right font-medium">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1">
              {c.servicio_nombre}
              {c.patente && ` · Dominio ${c.patente}`} · Venta N° {c.venta_id}
            </td>
            <td className="py-1 text-right tabular-nums">
              {formatearMoneda(c.clase === "A" ? c.neto : c.total)}
            </td>
          </tr>
        </tbody>
      </table>

      <dl className="ml-auto grid w-full max-w-xs gap-1 text-sm">
        {c.clase === "A" ? (
          <>
            <div className="flex justify-between">
              <dt>Importe neto gravado</dt>
              <dd className="tabular-nums">{formatearMoneda(c.neto)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IVA 21 %</dt>
              <dd className="tabular-nums">{formatearMoneda(c.iva)}</dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-muted-foreground">
            {/* Ley 27.743 (transparencia fiscal): el IVA contenido se informa en la Factura B. */}
            <dt>IVA contenido</dt>
            <dd className="tabular-nums">{formatearMoneda(c.iva)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="comprobante-total">
            {formatearMoneda(c.total)}
          </dd>
        </div>
      </dl>

      <footer className="flex flex-wrap items-center gap-4 border-t pt-4">
        {c.qr_url && (
          <CodigoQr key={c.qr_url} texto={c.qr_url} etiqueta="Código QR para verificar en ARCA" />
        )}
        <dl className="grid gap-1 text-sm">
          <Dato etiqueta="CAE">
            <span data-testid="comprobante-cae">{c.cae ?? "—"}</span>
          </Dato>
          <Dato etiqueta="Vencimiento del CAE">{dia(c.cae_vencimiento)}</Dato>
          <p className="text-xs text-muted-foreground">Comprobante autorizado por ARCA</p>
        </dl>
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
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap gap-2 print:hidden">
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
