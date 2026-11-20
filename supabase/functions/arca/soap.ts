// Transporte SOAP con ARCA: direcciones por ambiente, timeout, parseo y saneado para el log.

import { XMLParser } from "npm:fast-xml-parser@5.11.2";

export type Ambiente = "homologacion" | "produccion";

// Direcciones oficiales (manual WSFEv1 v4.7 y manual WSAA).
const URLS: Record<Ambiente, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
};

/**
 * Direcciones a usar. `ARCA_URL_SIMULADOR` existe solo en el entorno local (supabase/config.toml)
 * para que los tests usen el simulador de ARCA y nunca el servicio real.
 */
export function direcciones(ambiente: Ambiente): { wsaa: string; wsfe: string } {
  const simulador = Deno.env.get("ARCA_URL_SIMULADOR");
  if (simulador) return { wsaa: `${simulador}/wsaa`, wsfe: `${simulador}/wsfe` };
  return URLS[ambiente];
}

const TIMEOUT_MS = Number(Deno.env.get("ARCA_TIMEOUT_MS") ?? "30000");

/** No hubo respuesta utilizable de ARCA (red, timeout, HTTP 5xx sin SOAP): el resultado es incierto. */
export class ErrorComunicacion extends Error {}

/** ARCA respondió con un error (SOAP Fault o `Errors`). */
export class ErrorArca extends Error {
  constructor(
    message: string,
    public errores: Codigo[] = [],
  ) {
    super(message);
  }
}

export interface Codigo {
  codigo: number;
  mensaje: string;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  // Todo como texto: el CAE (14 dígitos) y los importes no deben pasar por Number.
  parseTagValue: false,
  isArray: (nombre) =>
    ["Err", "Obs", "Evt", "CondicionIvaReceptor", "FECAEDetResponse"].includes(nombre),
});

export type Nodo = Record<string, unknown>;

export function parsear(xml: string): Nodo {
  return parser.parse(xml) as Nodo;
}

export function nodo(valor: unknown): Nodo {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Nodo) : {};
}

export function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function lista(valor: unknown): Nodo[] {
  return Array.isArray(valor) ? valor.map(nodo) : [];
}

export function codigos(valor: unknown, item: "Err" | "Obs" | "Evt"): Codigo[] {
  return lista(nodo(valor)[item]).map((c) => ({
    codigo: Number(texto(c.Code)),
    mensaje: texto(c.Msg),
  }));
}

export function escapar(valor: string | number): string {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Saca del XML todo lo que da acceso: token, firma y el CMS firmado. */
export function sanear(xml: string): string {
  return xml
    .replace(/(<(?:\w+:)?Token>)[\s\S]*?(<\/(?:\w+:)?Token>)/gi, "$1[oculto]$2")
    .replace(/(<(?:\w+:)?Sign>)[\s\S]*?(<\/(?:\w+:)?Sign>)/gi, "$1[oculto]$2")
    .replace(/(<(?:\w+:)?in0>)[\s\S]*?(<\/(?:\w+:)?in0>)/gi, "$1[CMS oculto]$2")
    .replace(/(&lt;token&gt;)[\s\S]*?(&lt;\/token&gt;)/gi, "$1[oculto]$2")
    .replace(/(&lt;sign&gt;)[\s\S]*?(&lt;\/sign&gt;)/gi, "$1[oculto]$2")
    .replace(/(<token>)[\s\S]*?(<\/token>)/gi, "$1[oculto]$2")
    .replace(/(<sign>)[\s\S]*?(<\/sign>)/gi, "$1[oculto]$2");
}

export interface Llamada {
  solicitud: string;
  respuesta: string;
  duracionMs: number;
  cuerpo: Nodo;
}

/** POST SOAP 1.1. Devuelve el Body parseado; lanza ErrorComunicacion si no hay respuesta SOAP. */
export async function llamar(url: string, accion: string, sobre: string): Promise<Llamada> {
  const inicio = Date.now();
  let respuesta: Response;
  let xml: string;
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: accion },
      body: sobre,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    xml = await respuesta.text();
  } catch (e) {
    const llamada = {
      solicitud: sobre,
      respuesta: "",
      duracionMs: Date.now() - inicio,
      cuerpo: {},
    };
    const motivo =
      e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")
        ? `ARCA no respondió en ${Math.round(TIMEOUT_MS / 1000)} segundos`
        : "No se pudo conectar con ARCA";
    throw Object.assign(new ErrorComunicacion(motivo), { llamada });
  }
  const duracionMs = Date.now() - inicio;
  let cuerpo: Nodo;
  try {
    cuerpo = nodo(nodo(parsear(xml).Envelope).Body);
  } catch {
    cuerpo = {};
  }
  const llamada = { solicitud: sobre, respuesta: xml, duracionMs, cuerpo };
  const falla = nodo(cuerpo.Fault);
  if (Object.keys(falla).length > 0) {
    const mensaje = texto(falla.faultstring) || "ARCA devolvió un error";
    throw Object.assign(new ErrorArca(mensaje), { llamada });
  }
  if (!respuesta.ok || Object.keys(cuerpo).length === 0) {
    throw Object.assign(
      new ErrorComunicacion(`ARCA respondió con un error HTTP ${respuesta.status}`),
      { llamada },
    );
  }
  return llamada;
}

/** La llamada adjunta a un error de `llamar` (para registrar el intento aunque falle). */
export function llamadaDe(e: unknown): Llamada | null {
  if (e && typeof e === "object" && "llamada" in e) return (e as { llamada: Llamada }).llamada;
  return null;
}
