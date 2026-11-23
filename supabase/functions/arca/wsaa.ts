// WSAA: Ticket de Acceso (token + sign) para el servicio wsfe.
// TRA firmado en CMS (PKCS#7 SignedData con el contenido incluido) con el certificado del CUIT.

import forge from "npm:node-forge@1.4.3";
import { ErrorArca, escapar, llamar, nodo, parsear, texto, type Llamada } from "./soap.ts";

export interface Ticket {
  token: string;
  firma: string;
  expira: string;
}

export function crearTra(ahora = new Date()): string {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${iso(new Date(ahora.getTime() - 10 * 60_000))}</generationTime>` +
    `<expirationTime>${iso(new Date(ahora.getTime() + 10 * 60_000))}</expirationTime>` +
    "</header><service>wsfe</service></loginTicketRequest>"
  );
}

export function firmarCms(tra: string, certificadoPem: string, clavePem: string): string {
  const certificado = forge.pki.certificateFromPem(certificadoPem);
  const clave = forge.pki.privateKeyFromPem(clavePem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(certificado);
  p7.addSigner({
    key: clave,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

/** WSAA rechaza un TRA nuevo mientras haya un ticket vigente para el mismo certificado. */
export function yaTieneTicket(e: unknown): boolean {
  return e instanceof ErrorArca && /alreadyAuthenticated/i.test(e.message);
}

export async function pedirTicket(
  url: string,
  certificadoPem: string,
  clavePem: string,
): Promise<{ ticket: Ticket; llamada: Llamada }> {
  const cms = firmarCms(crearTra(), certificadoPem, clavePem);
  const sobre =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${escapar(cms)}</wsaa:in0>` +
    "</wsaa:loginCms></soapenv:Body></soapenv:Envelope>";
  const llamada = await llamar(url, '""', sobre);
  const retorno = texto(nodo(llamada.cuerpo.loginCmsResponse).loginCmsReturn);
  const respuesta = nodo(parsear(retorno).loginTicketResponse);
  const credenciales = nodo(respuesta.credentials);
  const ticket = {
    token: texto(credenciales.token),
    firma: texto(credenciales.sign),
    expira: texto(nodo(respuesta.header).expirationTime),
  };
  if (!ticket.token || !ticket.firma || Number.isNaN(Date.parse(ticket.expira))) {
    throw Object.assign(new ErrorArca("WSAA devolvió un ticket de acceso inválido"), { llamada });
  }
  return { ticket, llamada };
}
