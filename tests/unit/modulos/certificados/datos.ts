import type { CertificadoConStock, Compra } from "@/modulos/certificados/api/consultas";

/** Certificado de prueba (cada test pisa lo que necesita). */
export function certificadoDePrueba(
  cambios: Partial<CertificadoConStock> = {},
): CertificadoConStock {
  return {
    id: 4,
    nombre: "Hoja VTV",
    unidad_compra: "caja",
    hojas_por_unidad: 25,
    todos_servicios: true,
    categoria_ids: [],
    servicio_ids: [],
    aplica_a: "Todos los servicios",
    stock_minimo: 10,
    stock_hojas: 0,
    costo_promedio: 0,
    valor_stock: 0,
    semaforo: "sin_stock",
    activo: true,
    condicional: false,
    dias_vuelta: null,
    ...cambios,
  };
}

/** Compra de prueba, como la devuelve `v_compras_certificado`. */
export function compraDePrueba(cambios: Partial<Compra> = {}): Compra {
  return {
    id: 12,
    creado_en: "2026-11-20T13:00:00Z",
    certificado_id: 4,
    certificado: "Hoja VTV",
    unidad_compra: "caja",
    hojas_por_unidad: 25,
    unidades: 2,
    costo_unidad: 50000,
    hojas: 50,
    costo_total: 100000,
    fuente: "efectivo",
    proveedor: "Imprenta Sur",
    usuario: "Admin",
    anulada: false,
    anulada_motivo: null,
    anulada_en: null,
    anulada_por: null,
    reemplazada_por: null,
    editable: true,
    ...cambios,
  };
}
