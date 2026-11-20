// WSFEv1 (manual del desarrollador v4.7): armado de pedidos y lectura de respuestas.

import { type Ticket } from "./wsaa.ts";
import {
  type Codigo,
  ErrorArca,
  codigos,
  escapar,
  lista,
  llamar,
  nodo,
  texto,
  type Llamada,
  type Nodo,
} from "./soap.ts";

const NS = "http://ar.gov.afip.dif.FEV1/";

function sobre(operacion: string, ticket: Ticket, cuit: string, contenido = ""): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">` +
    `<soapenv:Header/><soapenv:Body><ar:${operacion}>` +
    `<ar:Auth><ar:Token>${escapar(ticket.token)}</ar:Token><ar:Sign>${escapar(ticket.firma)}</ar:Sign>` +
    `<ar:Cuit>${escapar(cuit)}</ar:Cuit></ar:Auth>${contenido}` +
    `</ar:${operacion}></soapenv:Body></soapenv:Envelope>`
  );
}

async function operar(url: string, operacion: string, cuerpo: string) {
  const llamada = await llamar(url, `${NS}${operacion}`, cuerpo);
  const resultado = nodo(nodo(llamada.cuerpo[`${operacion}Response`])[`${operacion}Result`]);
  return { llamada, resultado, errores: codigos(resultado.Errors, "Err") };
}

export function describir(codigosArca: Codigo[]): string {
  return codigosArca.map((c) => `${c.codigo}: ${c.mensaje}`).join(" · ");
}

function fallar(llamada: Llamada, errores: Codigo[], contexto: string): never {
  throw Object.assign(new ErrorArca(`${contexto}: ${describir(errores)}`, errores), { llamada });
}

export async function ultimoAutorizado(
  url: string,
  ticket: Ticket,
  cuit: string,
  puntoVenta: number,
  cbteTipo: number,
) {
  const { llamada, resultado, errores } = await operar(
    url,
    "FECompUltimoAutorizado",
    sobre(
      "FECompUltimoAutorizado",
      ticket,
      cuit,
      `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`,
    ),
  );
  if (errores.length > 0) fallar(llamada, errores, "ARCA no informó el último comprobante");
  const numero = Number(texto(resultado.CbteNro));
  if (!Number.isInteger(numero) || numero < 0) {
    throw Object.assign(new ErrorArca("ARCA devolvió un último número inválido"), { llamada });
  }
  return { numero, llamada };
}

export interface Consultado {
  numero: number;
  fecha: string;
  docTipo: number;
  docNro: number;
  total: number;
  cae: string;
  caeVencimiento: string;
}

/** FECompConsultar: null si el comprobante no existe en ARCA (error 602, "sin resultados"). */
export async function consultar(
  url: string,
  ticket: Ticket,
  cuit: string,
  puntoVenta: number,
  cbteTipo: number,
  numero: number,
): Promise<{ comprobante: Consultado | null; llamada: Llamada }> {
  const { llamada, resultado, errores } = await operar(
    url,
    "FECompConsultar",
    sobre(
      "FECompConsultar",
      ticket,
      cuit,
      `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro>` +
        `<ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`,
    ),
  );
  if (errores.some((e) => e.codigo === 602)) return { comprobante: null, llamada };
  if (errores.length > 0) fallar(llamada, errores, "No se pudo consultar el comprobante en ARCA");
  const r = nodo(resultado.ResultGet);
  return {
    llamada,
    comprobante: {
      numero: Number(texto(r.CbteDesde)),
      fecha: texto(r.CbteFch),
      docTipo: Number(texto(r.DocTipo)),
      docNro: Number(texto(r.DocNro)),
      total: Number(texto(r.ImpTotal)),
      cae: texto(r.CodAutorizacion),
      caeVencimiento: texto(r.FchVto),
    },
  };
}

export interface Pedido {
  cbteTipo: number;
  puntoVenta: number;
  numero: number;
  fecha: string; // yyyymmdd
  fechaServicio: string; // yyyymmdd
  docTipo: number;
  docNro: number;
  condicionIva: number;
  neto: number;
  iva: number;
  total: number;
  asociado: { cbteTipo: number; puntoVenta: number; numero: number; fecha: string } | null;
}

const importe = (n: number) => n.toFixed(2);

export function detalle(p: Pedido, cuit: string): string {
  // El orden de los elementos es el de la secuencia del WSDL (manual, FECAESolicitar).
  const asociado = p.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${p.asociado.cbteTipo}</ar:Tipo>` +
      `<ar:PtoVta>${p.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${p.asociado.numero}</ar:Nro>` +
      `<ar:Cuit>${escapar(cuit)}</ar:Cuit><ar:CbteFch>${p.asociado.fecha}</ar:CbteFch>` +
      "</ar:CbteAsoc></ar:CbtesAsoc>"
    : "";
  return (
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${p.puntoVenta}</ar:PtoVta>` +
    `<ar:CbteTipo>${p.cbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>` +
    // Concepto 2 = Servicios (la VTV): exige fechas de servicio y vencimiento de pago.
    `<ar:Concepto>2</ar:Concepto><ar:DocTipo>${p.docTipo}</ar:DocTipo><ar:DocNro>${p.docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${p.numero}</ar:CbteDesde><ar:CbteHasta>${p.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${p.fecha}</ar:CbteFch><ar:ImpTotal>${importe(p.total)}</ar:ImpTotal>` +
    `<ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${importe(p.neto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${importe(p.iva)}</ar:ImpIVA>` +
    `<ar:FchServDesde>${p.fechaServicio}</ar:FchServDesde><ar:FchServHasta>${p.fechaServicio}</ar:FchServHasta>` +
    `<ar:FchVtoPago>${p.fecha}</ar:FchVtoPago><ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${p.condicionIva}</ar:CondicionIVAReceptorId>${asociado}` +
    // Id 5 = IVA 21 % (FEParamGetTiposIva).
    `<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>${importe(p.neto)}</ar:BaseImp>` +
    `<ar:Importe>${importe(p.iva)}</ar:Importe></ar:AlicIva></ar:Iva>` +
    "</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>"
  );
}

export type Resultado =
  | { aprobado: true; cae: string; caeVencimiento: string; observaciones: Codigo[] }
  | { aprobado: false; errores: Codigo[]; observaciones: Codigo[] };

export async function solicitarCae(
  url: string,
  ticket: Ticket,
  cuit: string,
  pedido: Pedido,
): Promise<{ resultado: Resultado; llamada: Llamada }> {
  const { llamada, resultado, errores } = await operar(
    url,
    "FECAESolicitar",
    sobre("FECAESolicitar", ticket, cuit, detalle(pedido, cuit)),
  );
  const det: Nodo = lista(nodo(resultado.FeDetResp).FECAEDetResponse)[0] ?? {};
  const observaciones = codigos(det.Observaciones, "Obs");
  const cae = texto(det.CAE);
  if (texto(det.Resultado) === "A" && /^\d{14}$/.test(cae)) {
    return {
      llamada,
      resultado: { aprobado: true, cae, caeVencimiento: texto(det.CAEFchVto), observaciones },
    };
  }
  if (errores.length === 0 && observaciones.length === 0 && texto(det.Resultado) !== "R") {
    throw Object.assign(new ErrorArca("ARCA devolvió una respuesta sin resultado"), { llamada });
  }
  return { llamada, resultado: { aprobado: false, errores, observaciones } };
}

/** FEParamGetCondicionIvaReceptor sin clase: todas las combinaciones condición/clase. */
export async function condicionesIva(url: string, ticket: Ticket, cuit: string) {
  const { llamada, resultado, errores } = await operar(
    url,
    "FEParamGetCondicionIvaReceptor",
    sobre("FEParamGetCondicionIvaReceptor", ticket, cuit),
  );
  if (errores.length > 0) fallar(llamada, errores, "ARCA no informó las condiciones frente al IVA");
  const porId = new Map<number, { id: number; descripcion: string; clases: string[] }>();
  for (const c of lista(nodo(resultado.ResultGet).CondicionIvaReceptor)) {
    const id = Number(texto(c.Id));
    if (!Number.isInteger(id)) continue;
    const actual = porId.get(id) ?? { id, descripcion: texto(c.Desc), clases: [] };
    for (const clase of texto(c.Cmp_Clase)
      .split(/[,/\s]+/)
      .filter(Boolean)) {
      if (!actual.clases.includes(clase)) actual.clases.push(clase);
    }
    porId.set(id, actual);
  }
  return { condiciones: [...porId.values()], llamada };
}
