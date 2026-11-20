import type { Venta } from "@/modulos/caja/api/consultas";
import type { Turno } from "@/modulos/ventas/api/consultas";

export function turnoDePrueba(cambios: Partial<Turno> = {}): Turno {
  return {
    id: 5,
    caja_nombre: "Caja 1",
    usuario_nombre: "Ana",
    abierto_en: "2026-11-20T12:00:00Z",
    cerrado_en: null,
    abierto: true,
    observaciones: null,
    ventas_cantidad: 2,
    ventas_efectivo: 30000,
    ventas_transferencia: 0,
    ventas_tarjeta: 20000,
    ventas_total: 50000,
    gastos_total: 5000,
    neto: 45000,
    ...cambios,
  };
}

export function ventaDePrueba(cambios: Partial<Venta> = {}): Venta {
  return {
    id: 81,
    creado_en: "2026-11-20T12:30:00Z",
    turno_id: 5,
    servicio_nombre: "VTV auto",
    precio: 30000,
    medio_pago: "efectivo",
    patente: null,
    sin_stock: false,
    anulada: false,
    anulada_motivo: null,
    anulada_en: null,
    ...cambios,
  };
}
