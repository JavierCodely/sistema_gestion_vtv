/** Tipos de comprobante que emite el sistema (códigos de FEParamGetTiposCbte). */
export const TIPOS_COMPROBANTE: Record<number, string> = {
  1: "Factura A",
  6: "Factura B",
  3: "Nota de crédito A",
  8: "Nota de crédito B",
};

/** Tipos de documento del receptor (FEParamGetTiposDoc). */
export const TIPOS_DOCUMENTO: Record<number, string> = {
  80: "CUIT",
  96: "DNI",
  99: "Sin identificar",
};

export function nombreComprobante(cbteTipo: number): string {
  return TIPOS_COMPROBANTE[cbteTipo] ?? `Comprobante ${String(cbteTipo)}`;
}

/** 3, 41 → "00003-00000041" (formato de impresión de ARCA). */
export function numeroComprobante(puntoVenta: number, numero: number | null): string {
  const pv = String(puntoVenta).padStart(5, "0");
  return numero === null ? `${pv}-(sin número)` : `${pv}-${String(numero).padStart(8, "0")}`;
}

/** "30712345671" → "30-71234567-1". */
export function formatearCuit(cuit: string | number): string {
  const s = String(cuit).padStart(11, "0");
  return `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}`;
}

export function formatearDocumento(docTipo: number, docNro: number): string {
  if (docTipo === 99) return "—";
  if (docTipo === 80) return `CUIT ${formatearCuit(docNro)}`;
  return `${TIPOS_DOCUMENTO[docTipo] ?? "Doc."} ${new Intl.NumberFormat("es-AR").format(docNro)}`;
}

/** Estado en femenino: concuerda con "factura" y "nota de crédito". */
export const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente",
  procesando: "Emitiéndose",
  autorizado: "Autorizada",
  rechazado: "Rechazada",
  cancelado: "Cancelada",
};
