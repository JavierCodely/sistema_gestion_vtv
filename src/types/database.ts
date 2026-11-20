
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "alertas": {
                  Row: {
                    "certificado_id": number | null,"creado_en": string,"id": number,"leida": boolean,"leida_en": string | null,"leida_por": string | null,"mensaje": string,"tipo": Database["public"]['Enums']["tipo_alerta"],"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "certificado_id"?: number | null,"creado_en"?: string,"id"?: never,"leida"?: boolean,"leida_en"?: string | null,"leida_por"?: string | null,"mensaje": string,"tipo": Database["public"]['Enums']["tipo_alerta"],"venta_id"?: number | null
                  }
                  Update: {
                    "certificado_id"?: number | null,"creado_en"?: string,"id"?: never,"leida"?: boolean,"leida_en"?: string | null,"leida_por"?: string | null,"mensaje"?: string,"tipo"?: Database["public"]['Enums']["tipo_alerta"],"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "alertas_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "v_stock_certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_leida_por_fkey"
      columns: ["leida_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_venta_fk"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"caja_efectivo": {
                  Row: {
                    "actualizado_en": string,"id": number,"saldo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"id"?: number,"saldo"?: number
                  }
                  Update: {
                    "actualizado_en"?: string,"id"?: number,"saldo"?: number
                  }
                  Relationships: [
                    
                  ]
                },"cajas": {
                  Row: {
                    "activa": boolean,"creado_en": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"creado_en"?: string,"id"?: never,"nombre": string
                  }
                  Update: {
                    "activa"?: boolean,"creado_en"?: string,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categorias_gasto": {
                  Row: {
                    "activa": boolean,"creado_en": string,"habilitada_caja": boolean,"id": number,"nombre": string,"padre_id": number | null,"sistema": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"creado_en"?: string,"habilitada_caja"?: boolean,"id"?: never,"nombre": string,"padre_id"?: number | null,"sistema"?: string | null
                  }
                  Update: {
                    "activa"?: boolean,"creado_en"?: string,"habilitada_caja"?: boolean,"id"?: never,"nombre"?: string,"padre_id"?: number | null,"sistema"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_gasto_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "categorias_gasto"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_gasto_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_gastos_por_categoria"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "categorias_gasto_padre_id_fkey"
      columns: ["padre_id"]
isOneToOne: false
      referencedRelation: "v_gastos_por_categoria"
      referencedColumns: ["rubro_id"]
    }
                  ]
                },"categorias_servicio": {
                  Row: {
                    "activa": boolean,"creado_en": string,"id": number,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"creado_en"?: string,"id"?: never,"nombre": string
                  }
                  Update: {
                    "activa"?: boolean,"creado_en"?: string,"id"?: never,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"certificados": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"alcance": Database["public"]['Enums']["alcance_certificado"],"categoria_id": number | null,"costo_promedio": number,"creado_en": string,"hojas_por_unidad": number,"id": number,"nombre": string,"servicio_id": number | null,"stock_hojas": number,"stock_minimo": number,"unidad_compra": Database["public"]['Enums']["unidad_compra"]
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"alcance"?: Database["public"]['Enums']["alcance_certificado"],"categoria_id"?: number | null,"costo_promedio"?: number,"creado_en"?: string,"hojas_por_unidad": number,"id"?: never,"nombre": string,"servicio_id"?: number | null,"stock_hojas"?: number,"stock_minimo"?: number,"unidad_compra"?: Database["public"]['Enums']["unidad_compra"]
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"alcance"?: Database["public"]['Enums']["alcance_certificado"],"categoria_id"?: number | null,"costo_promedio"?: number,"creado_en"?: string,"hojas_por_unidad"?: number,"id"?: never,"nombre"?: string,"servicio_id"?: number | null,"stock_hojas"?: number,"stock_minimo"?: number,"unidad_compra"?: Database["public"]['Enums']["unidad_compra"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificados_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_servicio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificados_servicio_id_fkey"
      columns: ["servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    }
                  ]
                },"compras_certificado": {
                  Row: {
                    "certificado_id": number,"costo_hoja": number,"costo_total": number,"costo_unidad": number,"creado_en": string,"fuente": Database["public"]['Enums']["fuente_fondos"],"gasto_id": number,"hojas": number,"id": number,"proveedor": string | null,"unidades": number,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "certificado_id": number,"costo_hoja": number,"costo_total": number,"costo_unidad": number,"creado_en"?: string,"fuente": Database["public"]['Enums']["fuente_fondos"],"gasto_id": number,"hojas": number,"id"?: never,"proveedor"?: string | null,"unidades": number,"usuario_id": string
                  }
                  Update: {
                    "certificado_id"?: number,"costo_hoja"?: number,"costo_total"?: number,"costo_unidad"?: number,"creado_en"?: string,"fuente"?: Database["public"]['Enums']["fuente_fondos"],"gasto_id"?: number,"hojas"?: number,"id"?: never,"proveedor"?: string | null,"unidades"?: number,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compras_certificado_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_certificado_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "v_stock_certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_certificado_gasto_id_fkey"
      columns: ["gasto_id"]
isOneToOne: false
      referencedRelation: "gastos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_certificado_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gastos": {
                  Row: {
                    "anulado": boolean,"anulado_en": string | null,"anulado_motivo": string | null,"anulado_por": string | null,"caja_id": number | null,"categoria_id": number,"creado_en": string,"fuente": Database["public"]['Enums']["fuente_fondos"],"id": number,"monto": number,"nota": string,"turno_id": number | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anulado"?: boolean,"anulado_en"?: string | null,"anulado_motivo"?: string | null,"anulado_por"?: string | null,"caja_id"?: number | null,"categoria_id": number,"creado_en"?: string,"fuente": Database["public"]['Enums']["fuente_fondos"],"id"?: never,"monto": number,"nota": string,"turno_id"?: number | null,"usuario_id": string
                  }
                  Update: {
                    "anulado"?: boolean,"anulado_en"?: string | null,"anulado_motivo"?: string | null,"anulado_por"?: string | null,"caja_id"?: number | null,"categoria_id"?: number,"creado_en"?: string,"fuente"?: Database["public"]['Enums']["fuente_fondos"],"id"?: never,"monto"?: number,"nota"?: string,"turno_id"?: number | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gastos_anulado_por_fkey"
      columns: ["anulado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_gasto"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gastos_por_categoria"
      referencedColumns: ["categoria_id"]
    },{
      foreignKeyName: "gastos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "v_gastos_por_categoria"
      referencedColumns: ["rubro_id"]
    },{
      foreignKeyName: "gastos_turno_id_fkey"
      columns: ["turno_id"]
isOneToOne: false
      referencedRelation: "turnos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_turno_id_fkey"
      columns: ["turno_id"]
isOneToOne: false
      referencedRelation: "v_turnos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gastos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"movimientos_certificado": {
                  Row: {
                    "certificado_id": number,"compra_id": number | null,"costo_promedio_resultante": number,"costo_total": number,"costo_unitario": number,"creado_en": string,"hojas": number,"id": number,"nota": string | null,"stock_resultante": number,"tipo": Database["public"]['Enums']["tipo_mov_certificado"],"usuario_id": string | null,"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "certificado_id": number,"compra_id"?: number | null,"costo_promedio_resultante": number,"costo_total": number,"costo_unitario": number,"creado_en"?: string,"hojas": number,"id"?: never,"nota"?: string | null,"stock_resultante": number,"tipo": Database["public"]['Enums']["tipo_mov_certificado"],"usuario_id"?: string | null,"venta_id"?: number | null
                  }
                  Update: {
                    "certificado_id"?: number,"compra_id"?: number | null,"costo_promedio_resultante"?: number,"costo_total"?: number,"costo_unitario"?: number,"creado_en"?: string,"hojas"?: number,"id"?: never,"nota"?: string | null,"stock_resultante"?: number,"tipo"?: Database["public"]['Enums']["tipo_mov_certificado"],"usuario_id"?: string | null,"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_certificado_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_certificado_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "v_stock_certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_certificado_compra_fk"
      columns: ["compra_id"]
isOneToOne: false
      referencedRelation: "compras_certificado"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_certificado_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_certificado_venta_fk"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"movimientos_efectivo": {
                  Row: {
                    "creado_en": string,"gasto_id": number | null,"id": number,"monto": number,"nota": string | null,"saldo_resultante": number,"tipo": Database["public"]['Enums']["tipo_mov_efectivo"],"turno_id": number | null,"usuario_id": string | null,"venta_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"gasto_id"?: number | null,"id"?: never,"monto": number,"nota"?: string | null,"saldo_resultante": number,"tipo": Database["public"]['Enums']["tipo_mov_efectivo"],"turno_id"?: number | null,"usuario_id"?: string | null,"venta_id"?: number | null
                  }
                  Update: {
                    "creado_en"?: string,"gasto_id"?: number | null,"id"?: never,"monto"?: number,"nota"?: string | null,"saldo_resultante"?: number,"tipo"?: Database["public"]['Enums']["tipo_mov_efectivo"],"turno_id"?: number | null,"usuario_id"?: string | null,"venta_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_efectivo_gasto_fk"
      columns: ["gasto_id"]
isOneToOne: false
      referencedRelation: "gastos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_efectivo_turno_id_fkey"
      columns: ["turno_id"]
isOneToOne: false
      referencedRelation: "turnos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_efectivo_turno_id_fkey"
      columns: ["turno_id"]
isOneToOne: false
      referencedRelation: "v_turnos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_efectivo_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_efectivo_venta_fk"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"creado_en": string,"email": string | null,"id": string,"nombre": string,"rol": Database["public"]['Enums']["rol_usuario"]
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"email"?: string | null,"id": string,"nombre": string,"rol"?: Database["public"]['Enums']["rol_usuario"]
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"email"?: string | null,"id"?: string,"nombre"?: string,"rol"?: Database["public"]['Enums']["rol_usuario"]
                  }
                  Relationships: [
                    
                  ]
                },"servicios": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"categoria_id": number,"creado_en": string,"id": number,"nombre": string,"precio": number,"requiere_certificado": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"categoria_id": number,"creado_en"?: string,"id"?: never,"nombre": string,"precio": number,"requiere_certificado"?: boolean
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"categoria_id"?: number,"creado_en"?: string,"id"?: never,"nombre"?: string,"precio"?: number,"requiere_certificado"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "servicios_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_servicio"
      referencedColumns: ["id"]
    }
                  ]
                },"turnos": {
                  Row: {
                    "abierto_en": string,"caja_id": number,"cantidad_ventas": number | null,"cerrado_en": string | null,"id": number,"observaciones": string | null,"total_efectivo": number | null,"total_gastos": number | null,"total_tarjeta": number | null,"total_transferencia": number | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "abierto_en"?: string,"caja_id": number,"cantidad_ventas"?: number | null,"cerrado_en"?: string | null,"id"?: never,"observaciones"?: string | null,"total_efectivo"?: number | null,"total_gastos"?: number | null,"total_tarjeta"?: number | null,"total_transferencia"?: number | null,"usuario_id": string
                  }
                  Update: {
                    "abierto_en"?: string,"caja_id"?: number,"cantidad_ventas"?: number | null,"cerrado_en"?: string | null,"id"?: never,"observaciones"?: string | null,"total_efectivo"?: number | null,"total_gastos"?: number | null,"total_tarjeta"?: number | null,"total_transferencia"?: number | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "turnos_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "turnos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ventas": {
                  Row: {
                    "anulada": boolean,"anulada_en": string | null,"anulada_motivo": string | null,"anulada_por": string | null,"caja_id": number,"categoria_id": number,"certificado_id": number | null,"costo_certificado": number,"creado_en": string,"id": number,"medio_pago": Database["public"]['Enums']["medio_pago"],"patente": string | null,"precio": number,"servicio_id": number,"servicio_nombre": string,"sin_stock": boolean,"turno_id": number,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anulada"?: boolean,"anulada_en"?: string | null,"anulada_motivo"?: string | null,"anulada_por"?: string | null,"caja_id": number,"categoria_id": number,"certificado_id"?: number | null,"costo_certificado"?: number,"creado_en"?: string,"id"?: never,"medio_pago": Database["public"]['Enums']["medio_pago"],"patente"?: string | null,"precio": number,"servicio_id": number,"servicio_nombre": string,"sin_stock"?: boolean,"turno_id": number,"usuario_id": string
                  }
                  Update: {
                    "anulada"?: boolean,"anulada_en"?: string | null,"anulada_motivo"?: string | null,"anulada_por"?: string | null,"caja_id"?: number,"categoria_id"?: number,"certificado_id"?: number | null,"costo_certificado"?: number,"creado_en"?: string,"id"?: never,"medio_pago"?: Database["public"]['Enums']["medio_pago"],"patente"?: string | null,"precio"?: number,"servicio_id"?: number,"servicio_nombre"?: string,"sin_stock"?: boolean,"turno_id"?: number,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ventas_anulada_por_fkey"
      columns: ["anulada_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_servicio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "v_stock_certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_servicio_id_fkey"
      columns: ["servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_turno_id_fkey"
      columns: ["turno_id"]
isOneToOne: false
      referencedRelation: "turnos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_turno_id_fkey"
      columns: ["turno_id"]
isOneToOne: false
      referencedRelation: "v_turnos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_gastos_por_categoria": {
                  Row: {
                    "cantidad": number | null,"categoria": string,"categoria_id": number,"fecha": string | null,"fuente": Database["public"]['Enums']["fuente_fondos"],"rubro": string,"rubro_id": number,"total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_movimientos_caja": {
                  Row: {
                    "anulada": boolean | null,"caja_id": number | null,"caja_nombre": string | null,"categoria_gasto_id": number | null,"concepto": string | null,"detalle": string | null,"fecha": string | null,"fecha_local": string | null,"id": number | null,"medio": string | null,"monto": number | null,"motivo_anulacion": string | null,"nota": string | null,"patente": string | null,"servicio_id": number | null,"sin_stock": boolean | null,"tipo": string | null,"turno_id": number | null,"usuario_id": string | null,"usuario_nombre": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_stock_certificados": {
                  Row: {
                    "activo": boolean,"alcance": Database["public"]['Enums']["alcance_certificado"],"aplica_a": string | null,"categoria_id": number | null,"hojas_por_unidad": number,"id": number,"nombre": string,"semaforo": string | null,"servicio_id": number | null,"stock_hojas": number,"stock_minimo": number,"unidad_compra": Database["public"]['Enums']["unidad_compra"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "certificados_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_servicio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificados_servicio_id_fkey"
      columns: ["servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    }
                  ]
                },"v_turnos": {
                  Row: {
                    "abierto": boolean | null,"abierto_en": string,"caja_id": number,"caja_nombre": string,"cantidad_ventas": number | null,"cerrado_en": string | null,"gastos_total": number | null,"id": number,"neto": number | null,"observaciones": string | null,"total_efectivo": number | null,"total_gastos": number | null,"total_tarjeta": number | null,"total_transferencia": number | null,"usuario_id": string,"usuario_nombre": string | null,"ventas_cantidad": number | null,"ventas_efectivo": number | null,"ventas_tarjeta": number | null,"ventas_total": number | null,"ventas_transferencia": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "turnos_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "turnos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_exigir_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_exigir_usuario":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["rol_usuario"]
                           },
"_insertar_gasto":
{ Args: { "p_categoria_id": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_monto": number,"p_nota": string }; Returns: {
              "anulado": boolean,
"anulado_en": string | null,
"anulado_motivo": string | null,
"anulado_por": string | null,
"caja_id": number | null,
"categoria_id": number,
"creado_en": string,
"fuente": Database["public"]['Enums']["fuente_fondos"],
"id": number,
"monto": number,
"nota": string,
"turno_id": number | null,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "gastos"
        isOneToOne: true
        isSetofReturn: false
      } },
"_mover_efectivo":
{ Args: { "p_gasto_id"?: number,"p_monto": number,"p_nota"?: string,"p_tipo": Database["public"]['Enums']["tipo_mov_efectivo"],"p_turno_id"?: number,"p_venta_id"?: number }; Returns: number
                           },
"_texto_obligatorio":
{ Args: { "p_mensaje": string,"p_valor": string }; Returns: string
                           },
"_validar_monto":
{ Args: { "p_campo": string,"p_monto": number }; Returns: undefined
                           },
"abrir_turno":
{ Args: { "p_caja_id": number }; Returns: {
              "abierto_en": string,
"caja_id": number,
"cantidad_ventas": number | null,
"cerrado_en": string | null,
"id": number,
"observaciones": string | null,
"total_efectivo": number | null,
"total_gastos": number | null,
"total_tarjeta": number | null,
"total_transferencia": number | null,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "turnos"
        isOneToOne: true
        isSetofReturn: false
      } },
"ajustar_stock_certificado":
{ Args: { "p_certificado_id": number,"p_hojas": number,"p_nota": string }; Returns: {
              "certificado_id": number,
"compra_id": number | null,
"costo_promedio_resultante": number,
"costo_total": number,
"costo_unitario": number,
"creado_en": string,
"hojas": number,
"id": number,
"nota": string | null,
"stock_resultante": number,
"tipo": Database["public"]['Enums']["tipo_mov_certificado"],
"usuario_id": string | null,
"venta_id": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "movimientos_certificado"
        isOneToOne: true
        isSetofReturn: false
      } },
"anular_gasto":
{ Args: { "p_gasto_id": number,"p_motivo": string }; Returns: {
              "anulado": boolean,
"anulado_en": string | null,
"anulado_motivo": string | null,
"anulado_por": string | null,
"caja_id": number | null,
"categoria_id": number,
"creado_en": string,
"fuente": Database["public"]['Enums']["fuente_fondos"],
"id": number,
"monto": number,
"nota": string,
"turno_id": number | null,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "gastos"
        isOneToOne: true
        isSetofReturn: false
      } },
"anular_venta":
{ Args: { "p_motivo": string,"p_venta_id": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
"caja_id": number,
"categoria_id": number,
"certificado_id": number | null,
"costo_certificado": number,
"creado_en": string,
"id": number,
"medio_pago": Database["public"]['Enums']["medio_pago"],
"patente": string | null,
"precio": number,
"servicio_id": number,
"servicio_nombre": string,
"sin_stock": boolean,
"turno_id": number,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "ventas"
        isOneToOne: true
        isSetofReturn: false
      } },
"cerrar_turno":
{ Args: { "p_observaciones"?: string,"p_turno_id"?: number }; Returns: {
              "abierto_en": string,
"caja_id": number,
"cantidad_ventas": number | null,
"cerrado_en": string | null,
"id": number,
"observaciones": string | null,
"total_efectivo": number | null,
"total_gastos": number | null,
"total_tarjeta": number | null,
"total_transferencia": number | null,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "turnos"
        isOneToOne: true
        isSetofReturn: false
      } },
"certificado_para_servicio":
{ Args: { "p_servicio_id": number }; Returns: number
                           },
"es_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"fecha_local":
{ Args: { "ts": string }; Returns: string
                           },
"marcar_alertas_leidas":
{ Args: { "p_ids"?: (number)[] }; Returns: number
                           },
"movimiento_efectivo":
{ Args: { "p_monto": number,"p_nota": string,"p_tipo": Database["public"]['Enums']["tipo_mov_efectivo"] }; Returns: {
              "creado_en": string,
"gasto_id": number | null,
"id": number,
"monto": number,
"nota": string | null,
"saldo_resultante": number,
"tipo": Database["public"]['Enums']["tipo_mov_efectivo"],
"turno_id": number | null,
"usuario_id": string | null,
"venta_id": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "movimientos_efectivo"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_compra_certificado":
{ Args: { "p_certificado_id": number,"p_costo_unidad": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_proveedor"?: string,"p_unidades": number }; Returns: {
              "certificado_id": number,
"costo_hoja": number,
"costo_total": number,
"costo_unidad": number,
"creado_en": string,
"fuente": Database["public"]['Enums']["fuente_fondos"],
"gasto_id": number,
"hojas": number,
"id": number,
"proveedor": string | null,
"unidades": number,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "compras_certificado"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_gasto":
{ Args: { "p_categoria_id": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_monto": number,"p_nota": string }; Returns: {
              "anulado": boolean,
"anulado_en": string | null,
"anulado_motivo": string | null,
"anulado_por": string | null,
"caja_id": number | null,
"categoria_id": number,
"creado_en": string,
"fuente": Database["public"]['Enums']["fuente_fondos"],
"id": number,
"monto": number,
"nota": string,
"turno_id": number | null,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "gastos"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_venta":
{ Args: { "p_medio_pago": Database["public"]['Enums']["medio_pago"],"p_patente"?: string,"p_servicio_id": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
"caja_id": number,
"categoria_id": number,
"certificado_id": number | null,
"costo_certificado": number,
"creado_en": string,
"id": number,
"medio_pago": Database["public"]['Enums']["medio_pago"],
"patente": string | null,
"precio": number,
"servicio_id": number,
"servicio_nombre": string,
"sin_stock": boolean,
"turno_id": number,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "ventas"
        isOneToOne: true
        isSetofReturn: false
      } },
"resumen_diario":
{ Args: { "p_desde"?: string,"p_hasta"?: string }; Returns: {
              "cantidad_ventas": number,"costo_certificados": number,"fecha": string,"flujo_neto": number,"margen_bruto": number,"total_efectivo": number,"total_gastos": number,"total_tarjeta": number,"total_transferencia": number,"total_ventas": number,"ventas_sin_stock": number
            }[]
                           },
"rol_actual":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["rol_usuario"]
                           },
"stock_certificados_valorizado":
{ Args: Record<PropertyKey, never>; Returns: {
              "activo": boolean,"alcance": Database["public"]['Enums']["alcance_certificado"],"aplica_a": string,"categoria_id": number,"costo_promedio": number,"hojas_por_unidad": number,"id": number,"nombre": string,"semaforo": string,"servicio_id": number,"stock_hojas": number,"stock_minimo": number,"unidad_compra": Database["public"]['Enums']["unidad_compra"],"valor_stock": number
            }[]
                           }
          }
          Enums: {
            "alcance_certificado": "global"|"categoria"|"servicio","fuente_fondos": "efectivo"|"transferencia","medio_pago": "efectivo"|"transferencia"|"tarjeta","rol_usuario": "admin"|"cajero","tipo_alerta": "venta_sin_stock"|"stock_bajo","tipo_mov_certificado": "compra"|"venta"|"ajuste","tipo_mov_efectivo": "fondo_inicial"|"ingreso"|"retiro"|"venta"|"anulacion_venta"|"gasto"|"anulacion_gasto","unidad_compra": "caja"|"libreta"|"unidad"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "alcance_certificado": ["global", "categoria", "servicio"],"fuente_fondos": ["efectivo", "transferencia"],"medio_pago": ["efectivo", "transferencia", "tarjeta"],"rol_usuario": ["admin", "cajero"],"tipo_alerta": ["venta_sin_stock", "stock_bajo"],"tipo_mov_certificado": ["compra", "venta", "ajuste"],"tipo_mov_efectivo": ["fondo_inicial", "ingreso", "retiro", "venta", "anulacion_venta", "gasto", "anulacion_gasto"],"unidad_compra": ["caja", "libreta", "unidad"]
          }
        }
} as const
