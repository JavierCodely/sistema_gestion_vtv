/** Certificado autofirmado con el CUIT en el serialNumber del sujeto (solo para el simulador). */
export function generarCertificado(opciones?: {
  cuit?: string | null;
  /** Milisegundos desde ahora (negativo = ya vencido). */
  venceEn?: number;
  bits?: number;
}): { certificado: string; clave: string };
