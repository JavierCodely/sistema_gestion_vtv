import type { Venta } from "@/modulos/caja/api/consultas";
import type { Turno } from "@/modulos/ventas/api/consultas";

/** Id del cajero de `perfilDePrueba()`: quien hizo las ventas de prueba, salvo que se cambie. */
export const CAJERO_ID = "00000000-0000-0000-0000-0000000000c1";

export function turnoDePrueba(cambios: Partial<Turno> = {}): Turno {
  return {
    id: 5,
    caja_nombre: "Caja 1",
    abierto_por_nombre: "Ana Administradora",
    atendido_por: ["Ana Administradora", "Carlos Demo"],
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
    efectivo_inicial: 10000,
    gastos_efectivo: 5000,
    efectivo_en_caja: 35000,
    efectivo_cierre: null,
    total_efectivo: null,
    ...cambios,
  };
}

/**
 * Venta de un solo medio y sin descuento, salvo que se cambie. Con `medio_pago` y `precio` arma su
 * fila de `venta_pagos` como la BD; un pago mixto pasa `medio_pago: null` y sus `venta_pagos`.
 */
export function ventaDePrueba(cambios: Partial<Venta> = {}): Venta {
  const precio = cambios.precio ?? 30000;
  const medio = cambios.medio_pago === undefined ? "efectivo" : cambios.medio_pago;
  return {
    id: 81,
    creado_en: "2026-11-20T12:30:00Z",
    turno_id: 5,
    usuario_id: CAJERO_ID,
    servicio_nombre: "VTV auto",
    precio,
    precio_lista: precio,
    monto_descuento: 0,
    descuento_nombre: null,
    medio_pago: medio,
    vuelta_de: null,
    condicional_vence: null,
    condicional_saldo: null,
    vuelta_fuera_de_plazo: false,
    condicional_vencida_de: null,
    patente: null,
    sin_stock: false,
    anulada: false,
    anulada_motivo: null,
    anulada_en: null,
    anulada_por: null,
    venta_pagos: medio === null ? [] : [{ medio, monto: precio }],
    certificados: null,
    ...cambios,
  };
}
