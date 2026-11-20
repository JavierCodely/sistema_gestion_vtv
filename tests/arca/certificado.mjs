// Certificados X.509 de prueba (autofirmados) con el CUIT en serialNumber, como los de ARCA.
// Solo para tests contra el simulador: ARCA real no los acepta.
import forge from "node-forge";

/**
 * @param {{ cuit?: string | null, venceEn?: number, bits?: number }} opciones
 *   venceEn: milisegundos desde ahora (negativo = ya vencido).
 * @returns {{ certificado: string, clave: string }} PEM
 */
export function generarCertificado({
  cuit = "30712345671",
  venceEn = 365 * 86400_000,
  bits = 2048,
} = {}) {
  const claves = forge.pki.rsa.generateKeyPair(bits);
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = "0" + Date.now().toString(16);
  cert.validity.notBefore = new Date(Date.now() - 2 * 365 * 86400_000);
  cert.validity.notAfter = new Date(Date.now() + venceEn);
  const atributos = [
    { name: "commonName", value: "vtv-pruebas" },
    { name: "organizationName", value: "VTV Pruebas" },
    { name: "countryName", value: "AR" },
  ];
  if (cuit) atributos.push({ name: "serialNumber", value: `CUIT ${cuit}` });
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(claves.privateKey, forge.md.sha256.create());
  return {
    certificado: forge.pki.certificateToPem(cert),
    clave: forge.pki.privateKeyToPem(claves.privateKey),
  };
}
