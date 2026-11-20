import type { CertificadoConStock } from "@/modulos/certificados/api/consultas";

/** Certificado de prueba (cada test pisa lo que necesita). */
export function certificadoDePrueba(
  cambios: Partial<CertificadoConStock> = {},
): CertificadoConStock {
  return {
    id: 4,
    nombre: "Hoja VTV",
    unidad_compra: "caja",
    hojas_por_unidad: 25,
    alcance: "global",
    categoria_id: null,
    servicio_id: null,
    aplica_a: "Todos los servicios",
    stock_minimo: 10,
    stock_hojas: 0,
    costo_promedio: 0,
    valor_stock: 0,
    semaforo: "sin_stock",
    activo: true,
    ...cambios,
  };
}
