
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
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alertas_venta_fk"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"arca_condiciones_iva": {
                  Row: {
                    "actualizado_en": string,"clases": (string)[],"descripcion": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"clases": (string)[],"descripcion": string,"id": number
                  }
                  Update: {
                    "actualizado_en"?: string,"clases"?: (string)[],"descripcion"?: string,"id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"arca_configuracion": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"ambiente": Database["public"]['Enums']["ambiente_arca"],"certificado_cargado_en": string | null,"certificado_cuit": string | null,"certificado_secreto_id": string | null,"certificado_sujeto": string | null,"certificado_vence": string | null,"clave_secreto_id": string | null,"condiciones_actualizadas_en": string | null,"cuit": string | null,"domicilio": string | null,"id": boolean,"iibb": string | null,"inicio_actividades": string | null,"punto_venta": number | null,"razon_social": string | null,"tope_identificacion": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"ambiente"?: Database["public"]['Enums']["ambiente_arca"],"certificado_cargado_en"?: string | null,"certificado_cuit"?: string | null,"certificado_secreto_id"?: string | null,"certificado_sujeto"?: string | null,"certificado_vence"?: string | null,"clave_secreto_id"?: string | null,"condiciones_actualizadas_en"?: string | null,"cuit"?: string | null,"domicilio"?: string | null,"id"?: boolean,"iibb"?: string | null,"inicio_actividades"?: string | null,"punto_venta"?: number | null,"razon_social"?: string | null,"tope_identificacion"?: number
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"ambiente"?: Database["public"]['Enums']["ambiente_arca"],"certificado_cargado_en"?: string | null,"certificado_cuit"?: string | null,"certificado_secreto_id"?: string | null,"certificado_sujeto"?: string | null,"certificado_vence"?: string | null,"clave_secreto_id"?: string | null,"condiciones_actualizadas_en"?: string | null,"cuit"?: string | null,"domicilio"?: string | null,"id"?: boolean,"iibb"?: string | null,"inicio_actividades"?: string | null,"punto_venta"?: number | null,"razon_social"?: string | null,"tope_identificacion"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "arca_configuracion_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"arca_intentos": {
                  Row: {
                    "ambiente": Database["public"]['Enums']["ambiente_arca"],"comprobante_id": number | null,"creado_en": string,"duracion_ms": number,"errores": NonNullable<Json>,"exito": boolean,"id": number,"mensaje": string | null,"observaciones": NonNullable<Json>,"operacion": string,"respuesta": string | null,"solicitud": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ambiente": Database["public"]['Enums']["ambiente_arca"],"comprobante_id"?: number | null,"creado_en"?: string,"duracion_ms": number,"errores"?: NonNullable<Json>,"exito": boolean,"id"?: never,"mensaje"?: string | null,"observaciones"?: NonNullable<Json>,"operacion": string,"respuesta"?: string | null,"solicitud"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "ambiente"?: Database["public"]['Enums']["ambiente_arca"],"comprobante_id"?: number | null,"creado_en"?: string,"duracion_ms"?: number,"errores"?: NonNullable<Json>,"exito"?: boolean,"id"?: never,"mensaje"?: string | null,"observaciones"?: NonNullable<Json>,"operacion"?: string,"respuesta"?: string | null,"solicitud"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "arca_intentos_comprobante_id_fkey"
      columns: ["comprobante_id"]
isOneToOne: false
      referencedRelation: "comprobantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "arca_intentos_comprobante_id_fkey"
      columns: ["comprobante_id"]
isOneToOne: false
      referencedRelation: "v_comprobantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "arca_intentos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"arca_tokens": {
                  Row: {
                    "ambiente": Database["public"]['Enums']["ambiente_arca"],"cuit": string,"expira": string,"firma": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ambiente": Database["public"]['Enums']["ambiente_arca"],"cuit": string,"expira": string,"firma": string,"token": string
                  }
                  Update: {
                    "ambiente"?: Database["public"]['Enums']["ambiente_arca"],"cuit"?: string,"expira"?: string,"firma"?: string,"token"?: string
                  }
                  Relationships: [
                    
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
                },"certificado_destinos": {
                  Row: {
                    "activo": boolean,"categoria_id": number | null,"certificado_id": number,"condicional": boolean,"id": number,"servicio_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo": boolean,"categoria_id"?: number | null,"certificado_id": number,"condicional"?: boolean,"id"?: never,"servicio_id"?: number | null
                  }
                  Update: {
                    "activo"?: boolean,"categoria_id"?: number | null,"certificado_id"?: number,"condicional"?: boolean,"id"?: never,"servicio_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificado_destinos_categoria_id_fkey"
      columns: ["categoria_id"]
isOneToOne: false
      referencedRelation: "categorias_servicio"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificado_destinos_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificado_destinos_certificado_id_fkey"
      columns: ["certificado_id"]
isOneToOne: false
      referencedRelation: "v_stock_certificados"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificado_destinos_servicio_id_fkey"
      columns: ["servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    }
                  ]
                },"certificados": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"condicional": boolean,"costo_promedio": number,"creado_en": string,"dias_vuelta": number | null,"hojas_por_unidad": number,"id": number,"nombre": string,"stock_hojas": number,"stock_minimo": number,"todos_servicios": boolean,"unidad_compra": Database["public"]['Enums']["unidad_compra"]
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"condicional"?: boolean,"costo_promedio"?: number,"creado_en"?: string,"dias_vuelta"?: number | null,"hojas_por_unidad": number,"id"?: never,"nombre": string,"stock_hojas"?: number,"stock_minimo"?: number,"todos_servicios"?: boolean,"unidad_compra"?: Database["public"]['Enums']["unidad_compra"]
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"condicional"?: boolean,"costo_promedio"?: number,"creado_en"?: string,"dias_vuelta"?: number | null,"hojas_por_unidad"?: number,"id"?: never,"nombre"?: string,"stock_hojas"?: number,"stock_minimo"?: number,"todos_servicios"?: boolean,"unidad_compra"?: Database["public"]['Enums']["unidad_compra"]
                  }
                  Relationships: [
                    
                  ]
                },"compras_certificado": {
                  Row: {
                    "anulada": boolean,"anulada_en": string | null,"anulada_motivo": string | null,"anulada_por": string | null,"certificado_id": number,"costo_hoja": number,"costo_total": number,"costo_unidad": number,"creado_en": string,"fuente": Database["public"]['Enums']["fuente_fondos"],"gasto_id": number,"hojas": number,"id": number,"proveedor": string | null,"reemplazada_por": number | null,"unidades": number,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anulada"?: boolean,"anulada_en"?: string | null,"anulada_motivo"?: string | null,"anulada_por"?: string | null,"certificado_id": number,"costo_hoja": number,"costo_total": number,"costo_unidad": number,"creado_en"?: string,"fuente": Database["public"]['Enums']["fuente_fondos"],"gasto_id": number,"hojas": number,"id"?: never,"proveedor"?: string | null,"reemplazada_por"?: number | null,"unidades": number,"usuario_id": string
                  }
                  Update: {
                    "anulada"?: boolean,"anulada_en"?: string | null,"anulada_motivo"?: string | null,"anulada_por"?: string | null,"certificado_id"?: number,"costo_hoja"?: number,"costo_total"?: number,"costo_unidad"?: number,"creado_en"?: string,"fuente"?: Database["public"]['Enums']["fuente_fondos"],"gasto_id"?: number,"hojas"?: number,"id"?: never,"proveedor"?: string | null,"reemplazada_por"?: number | null,"unidades"?: number,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compras_certificado_anulada_por_fkey"
      columns: ["anulada_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
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
      foreignKeyName: "compras_certificado_reemplazada_por_fkey"
      columns: ["reemplazada_por"]
isOneToOne: false
      referencedRelation: "compras_certificado"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_certificado_reemplazada_por_fkey"
      columns: ["reemplazada_por"]
isOneToOne: false
      referencedRelation: "v_compras_certificado"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_certificado_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comprobantes": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"ambiente": Database["public"]['Enums']["ambiente_arca"],"asociado_id": number | null,"autorizado_en": string | null,"cae": string | null,"cae_vencimiento": string | null,"cbte_tipo": number,"clase": string,"condicion_iva_receptor_id": number,"creado_en": string,"creado_por": string,"cuit_emisor": string,"doc_nro": number,"doc_tipo": number,"emisor_domicilio": string | null,"emisor_iibb": string | null,"emisor_inicio_actividades": string | null,"emisor_razon_social": string | null,"estado": Database["public"]['Enums']["estado_comprobante"],"fecha": string | null,"fecha_servicio": string,"id": number,"intentos": number,"iva": number,"mensaje": string | null,"neto": number,"numero": number | null,"numero_intentado": number | null,"procesando_desde": string | null,"punto_venta": number,"receptor_nombre": string | null,"tipo": Database["public"]['Enums']["tipo_comprobante"],"toma": string | null,"tomado_en": string | null,"total": number,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"ambiente": Database["public"]['Enums']["ambiente_arca"],"asociado_id"?: number | null,"autorizado_en"?: string | null,"cae"?: string | null,"cae_vencimiento"?: string | null,"cbte_tipo": number,"clase": string,"condicion_iva_receptor_id": number,"creado_en"?: string,"creado_por": string,"cuit_emisor": string,"doc_nro": number,"doc_tipo": number,"emisor_domicilio"?: string | null,"emisor_iibb"?: string | null,"emisor_inicio_actividades"?: string | null,"emisor_razon_social"?: string | null,"estado"?: Database["public"]['Enums']["estado_comprobante"],"fecha"?: string | null,"fecha_servicio": string,"id"?: never,"intentos"?: number,"iva": number,"mensaje"?: string | null,"neto": number,"numero"?: number | null,"numero_intentado"?: number | null,"procesando_desde"?: string | null,"punto_venta": number,"receptor_nombre"?: string | null,"tipo": Database["public"]['Enums']["tipo_comprobante"],"toma"?: string | null,"tomado_en"?: string | null,"total": number,"venta_id": number
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"ambiente"?: Database["public"]['Enums']["ambiente_arca"],"asociado_id"?: number | null,"autorizado_en"?: string | null,"cae"?: string | null,"cae_vencimiento"?: string | null,"cbte_tipo"?: number,"clase"?: string,"condicion_iva_receptor_id"?: number,"creado_en"?: string,"creado_por"?: string,"cuit_emisor"?: string,"doc_nro"?: number,"doc_tipo"?: number,"emisor_domicilio"?: string | null,"emisor_iibb"?: string | null,"emisor_inicio_actividades"?: string | null,"emisor_razon_social"?: string | null,"estado"?: Database["public"]['Enums']["estado_comprobante"],"fecha"?: string | null,"fecha_servicio"?: string,"id"?: never,"intentos"?: number,"iva"?: number,"mensaje"?: string | null,"neto"?: number,"numero"?: number | null,"numero_intentado"?: number | null,"procesando_desde"?: string | null,"punto_venta"?: number,"receptor_nombre"?: string | null,"tipo"?: Database["public"]['Enums']["tipo_comprobante"],"toma"?: string | null,"tomado_en"?: string | null,"total"?: number,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "comprobantes_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_asociado_id_fkey"
      columns: ["asociado_id"]
isOneToOne: false
      referencedRelation: "comprobantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_asociado_id_fkey"
      columns: ["asociado_id"]
isOneToOne: false
      referencedRelation: "v_comprobantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_condicion_iva_receptor_id_fkey"
      columns: ["condicion_iva_receptor_id"]
isOneToOne: false
      referencedRelation: "arca_condiciones_iva"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"cuentas_fondos": {
                  Row: {
                    "cuenta": Database["public"]['Enums']["cuenta_fondos"]
                  }
                  ComputedFields: never
                  Insert: {
                    "cuenta": Database["public"]['Enums']["cuenta_fondos"]
                  }
                  Update: {
                    "cuenta"?: Database["public"]['Enums']["cuenta_fondos"]
                  }
                  Relationships: [
                    
                  ]
                },"descuento_servicios": {
                  Row: {
                    "descuento_id": number,"servicio_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "descuento_id": number,"servicio_id": number
                  }
                  Update: {
                    "descuento_id"?: number,"servicio_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "descuento_servicios_descuento_id_fkey"
      columns: ["descuento_id"]
isOneToOne: false
      referencedRelation: "descuentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "descuento_servicios_servicio_id_fkey"
      columns: ["servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    }
                  ]
                },"descuentos": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"creado_en": string,"id": number,"nombre": string,"tipo": Database["public"]['Enums']["tipo_descuento"],"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"id"?: never,"nombre": string,"tipo": Database["public"]['Enums']["tipo_descuento"],"valor": number
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"id"?: never,"nombre"?: string,"tipo"?: Database["public"]['Enums']["tipo_descuento"],"valor"?: number
                  }
                  Relationships: [
                    
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
                },"impuesto_servicios": {
                  Row: {
                    "impuesto_id": number,"servicio_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "impuesto_id": number,"servicio_id": number
                  }
                  Update: {
                    "impuesto_id"?: number,"servicio_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "impuesto_servicios_impuesto_id_fkey"
      columns: ["impuesto_id"]
isOneToOne: false
      referencedRelation: "impuestos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "impuesto_servicios_servicio_id_fkey"
      columns: ["servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    }
                  ]
                },"impuestos": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"creado_en": string,"id": number,"medios": (Database["public"]['Enums']["medio_pago"])[],"nombre": string,"tipo": Database["public"]['Enums']["tipo_impuesto"],"todos_servicios": boolean,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"id"?: never,"medios"?: (Database["public"]['Enums']["medio_pago"])[],"nombre": string,"tipo": Database["public"]['Enums']["tipo_impuesto"],"todos_servicios"?: boolean,"valor": number
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"id"?: never,"medios"?: (Database["public"]['Enums']["medio_pago"])[],"nombre"?: string,"tipo"?: Database["public"]['Enums']["tipo_impuesto"],"todos_servicios"?: boolean,"valor"?: number
                  }
                  Relationships: [
                    
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
      foreignKeyName: "movimientos_certificado_compra_fk"
      columns: ["compra_id"]
isOneToOne: false
      referencedRelation: "v_compras_certificado"
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
      referencedRelation: "v_ventas_mixtas"
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
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_efectivo_venta_fk"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"movimientos_fondos": {
                  Row: {
                    "creado_en": string,"cuenta": Database["public"]['Enums']["cuenta_fondos"],"id": number,"monto": number,"nota": string,"tipo": Database["public"]['Enums']["tipo_mov_fondos"],"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"cuenta": Database["public"]['Enums']["cuenta_fondos"],"id"?: never,"monto": number,"nota": string,"tipo": Database["public"]['Enums']["tipo_mov_fondos"],"usuario_id": string
                  }
                  Update: {
                    "creado_en"?: string,"cuenta"?: Database["public"]['Enums']["cuenta_fondos"],"id"?: never,"monto"?: number,"nota"?: string,"tipo"?: Database["public"]['Enums']["tipo_mov_fondos"],"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimientos_fondos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"apellido": string | null,"creado_en": string,"email": string | null,"id": string,"nombre": string,"nombre_completo": string,"rol": Database["public"]['Enums']["rol_usuario"]
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"apellido"?: string | null,"creado_en"?: string,"email"?: string | null,"id": string,"nombre": string,"nombre_completo"?: never,"rol"?: Database["public"]['Enums']["rol_usuario"]
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"apellido"?: string | null,"creado_en"?: string,"email"?: string | null,"id"?: string,"nombre"?: string,"nombre_completo"?: never,"rol"?: Database["public"]['Enums']["rol_usuario"]
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
                    "abierto_en": string,"abierto_por": string | null,"caja_id": number,"cantidad_ventas": number | null,"cerrado_en": string | null,"efectivo_cierre": number | null,"efectivo_inicial": number | null,"id": number,"observaciones": string | null,"total_efectivo": number | null,"total_gastos": number | null,"total_tarjeta": number | null,"total_transferencia": number | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "abierto_en"?: string,"abierto_por"?: string | null,"caja_id": number,"cantidad_ventas"?: number | null,"cerrado_en"?: string | null,"efectivo_cierre"?: number | null,"efectivo_inicial"?: number | null,"id"?: never,"observaciones"?: string | null,"total_efectivo"?: number | null,"total_gastos"?: number | null,"total_tarjeta"?: number | null,"total_transferencia"?: number | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "abierto_en"?: string,"abierto_por"?: string | null,"caja_id"?: number,"cantidad_ventas"?: number | null,"cerrado_en"?: string | null,"efectivo_cierre"?: number | null,"efectivo_inicial"?: number | null,"id"?: never,"observaciones"?: string | null,"total_efectivo"?: number | null,"total_gastos"?: number | null,"total_tarjeta"?: number | null,"total_transferencia"?: number | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "turnos_abierto_por_fkey"
      columns: ["abierto_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
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
                },"venta_impuestos": {
                  Row: {
                    "base": number,"impuesto_id": number,"impuesto_nombre": string,"medio": Database["public"]['Enums']["medio_pago"],"monto": number,"tipo": Database["public"]['Enums']["tipo_impuesto"],"valor": number,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base": number,"impuesto_id": number,"impuesto_nombre": string,"medio": Database["public"]['Enums']["medio_pago"],"monto": number,"tipo": Database["public"]['Enums']["tipo_impuesto"],"valor": number,"venta_id": number
                  }
                  Update: {
                    "base"?: number,"impuesto_id"?: number,"impuesto_nombre"?: string,"medio"?: Database["public"]['Enums']["medio_pago"],"monto"?: number,"tipo"?: Database["public"]['Enums']["tipo_impuesto"],"valor"?: number,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venta_impuestos_impuesto_id_fkey"
      columns: ["impuesto_id"]
isOneToOne: false
      referencedRelation: "impuestos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venta_impuestos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venta_impuestos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"venta_pagos": {
                  Row: {
                    "medio": Database["public"]['Enums']["medio_pago"],"monto": number,"venta_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "medio": Database["public"]['Enums']["medio_pago"],"monto": number,"venta_id": number
                  }
                  Update: {
                    "medio"?: Database["public"]['Enums']["medio_pago"],"monto"?: number,"venta_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "venta_pagos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venta_pagos_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"ventas": {
                  Row: {
                    "anulada": boolean,"anulada_en": string | null,"anulada_motivo": string | null,"anulada_por": string | null,"caja_id": number,"cargada_en": string | null,"categoria_id": number,"certificado_id": number | null,"condicional_saldo": number | null,"condicional_servicio_id": number | null,"condicional_vence": string | null,"costo_certificado": number,"creado_en": string,"descuento_id": number | null,"descuento_nombre": string | null,"descuento_tipo": Database["public"]['Enums']["tipo_descuento"] | null,"descuento_valor": number | null,"id": number,"medio_pago": Database["public"]['Enums']["medio_pago"] | null,"monto_descuento": number,"patente": string | null,"precio": number,"precio_lista": number,"servicio_id": number,"servicio_nombre": string,"sin_stock": boolean,"turno_id": number | null,"usuario_id": string,"vuelta_de": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anulada"?: boolean,"anulada_en"?: string | null,"anulada_motivo"?: string | null,"anulada_por"?: string | null,"caja_id": number,"cargada_en"?: string | null,"categoria_id": number,"certificado_id"?: number | null,"condicional_saldo"?: number | null,"condicional_servicio_id"?: number | null,"condicional_vence"?: string | null,"costo_certificado"?: number,"creado_en"?: string,"descuento_id"?: number | null,"descuento_nombre"?: string | null,"descuento_tipo"?: Database["public"]['Enums']["tipo_descuento"] | null,"descuento_valor"?: number | null,"id"?: never,"medio_pago"?: Database["public"]['Enums']["medio_pago"] | null,"monto_descuento"?: number,"patente"?: string | null,"precio": number,"precio_lista": number,"servicio_id": number,"servicio_nombre": string,"sin_stock"?: boolean,"turno_id"?: number | null,"usuario_id": string,"vuelta_de"?: number | null
                  }
                  Update: {
                    "anulada"?: boolean,"anulada_en"?: string | null,"anulada_motivo"?: string | null,"anulada_por"?: string | null,"caja_id"?: number,"cargada_en"?: string | null,"categoria_id"?: number,"certificado_id"?: number | null,"condicional_saldo"?: number | null,"condicional_servicio_id"?: number | null,"condicional_vence"?: string | null,"costo_certificado"?: number,"creado_en"?: string,"descuento_id"?: number | null,"descuento_nombre"?: string | null,"descuento_tipo"?: Database["public"]['Enums']["tipo_descuento"] | null,"descuento_valor"?: number | null,"id"?: never,"medio_pago"?: Database["public"]['Enums']["medio_pago"] | null,"monto_descuento"?: number,"patente"?: string | null,"precio"?: number,"precio_lista"?: number,"servicio_id"?: number,"servicio_nombre"?: string,"sin_stock"?: boolean,"turno_id"?: number | null,"usuario_id"?: string,"vuelta_de"?: number | null
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
      foreignKeyName: "ventas_condicional_servicio_id_fkey"
      columns: ["condicional_servicio_id"]
isOneToOne: false
      referencedRelation: "servicios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_descuento_id_fkey"
      columns: ["descuento_id"]
isOneToOne: false
      referencedRelation: "descuentos"
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
    },{
      foreignKeyName: "ventas_vuelta_de_fkey"
      columns: ["vuelta_de"]
isOneToOne: false
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ventas_vuelta_de_fkey"
      columns: ["vuelta_de"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_compras_certificado": {
                  Row: {
                    "anulada": boolean,"anulada_en": string | null,"anulada_motivo": string | null,"anulada_por": string | null,"certificado": string,"certificado_id": number,"costo_total": number,"costo_unidad": number,"creado_en": string,"editable": boolean | null,"fuente": Database["public"]['Enums']["fuente_fondos"],"hojas": number,"hojas_por_unidad": number | null,"id": number,"proveedor": string | null,"reemplazada_por": number | null,"unidad_compra": Database["public"]['Enums']["unidad_compra"],"unidades": number,"usuario": string
                  }
                  ComputedFields: never
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
      foreignKeyName: "compras_certificado_reemplazada_por_fkey"
      columns: ["reemplazada_por"]
isOneToOne: false
      referencedRelation: "compras_certificado"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compras_certificado_reemplazada_por_fkey"
      columns: ["reemplazada_por"]
isOneToOne: false
      referencedRelation: "v_compras_certificado"
      referencedColumns: ["id"]
    }
                  ]
                },"v_comprobantes": {
                  Row: {
                    "a_reconciliar": boolean | null,"actualizado_en": string,"actualizado_por": string | null,"ambiente": Database["public"]['Enums']["ambiente_arca"],"asociado_cbte_tipo": number | null,"asociado_fecha": string | null,"asociado_id": number | null,"asociado_numero": number | null,"asociado_punto_venta": number | null,"autorizado_en": string | null,"cae": string | null,"cae_vencimiento": string | null,"cbte_tipo": number,"clase": string,"condicion_iva_receptor": string,"condicion_iva_receptor_id": number,"creado_en": string,"creado_por": string,"cuit_emisor": string,"doc_nro": number,"doc_tipo": number,"emisor_domicilio": string | null,"emisor_iibb": string | null,"emisor_inicio_actividades": string | null,"emisor_razon_social": string | null,"estado": Database["public"]['Enums']["estado_comprobante"],"fecha": string | null,"fecha_servicio": string,"id": number,"intentos": number,"iva": number,"mensaje": string | null,"neto": number,"numero": number | null,"patente": string | null,"punto_venta": number,"qr_url": string | null,"receptor_nombre": string | null,"servicio_nombre": string,"tipo": Database["public"]['Enums']["tipo_comprobante"],"total": number,"turno_id": number | null,"venta_id": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "comprobantes_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_asociado_id_fkey"
      columns: ["asociado_id"]
isOneToOne: false
      referencedRelation: "comprobantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_asociado_id_fkey"
      columns: ["asociado_id"]
isOneToOne: false
      referencedRelation: "v_comprobantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_condicion_iva_receptor_id_fkey"
      columns: ["condicion_iva_receptor_id"]
isOneToOne: false
      referencedRelation: "arca_condiciones_iva"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comprobantes_venta_id_fkey"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
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
    }
                  ]
                },"v_gastos_por_categoria": {
                  Row: {
                    "cantidad": number | null,"categoria": string,"categoria_id": number,"fecha": string | null,"fuente": Database["public"]['Enums']["fuente_fondos"],"rubro": string,"rubro_id": number,"total": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_movimientos_caja": {
                  Row: {
                    "anulada": boolean | null,"caja_id": number | null,"caja_nombre": string | null,"categoria_gasto_id": number | null,"concepto": string | null,"descuento_nombre": string | null,"detalle": string | null,"fecha": string | null,"fecha_local": string | null,"id": number | null,"medio": string | null,"monto": number | null,"monto_descuento": number | null,"motivo_anulacion": string | null,"nota": string | null,"pagos": Json | null,"patente": string | null,"precio_lista": number | null,"servicio_id": number | null,"sin_stock": boolean | null,"tipo": string | null,"turno_id": number | null,"usuario_id": string | null,"usuario_nombre": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_movimientos_efectivo": {
                  Row: {
                    "creado_en": string,"gasto_id": number | null,"id": number,"monto": number,"nota": string | null,"saldo_resultante": number,"tipo": Database["public"]['Enums']["tipo_mov_efectivo"],"turno_id": number | null,"usuario_id": string | null,"usuario_nombre": string | null,"venta_id": number | null
                  }
                  ComputedFields: never
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
      referencedRelation: "v_ventas_mixtas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimientos_efectivo_venta_fk"
      columns: ["venta_id"]
isOneToOne: false
      referencedRelation: "ventas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_movimientos_fondos": {
                  Row: {
                    "caja_id": number | null,"caja_nombre": string | null,"clave": string | null,"compra_id": number | null,"cuenta": Database["public"]['Enums']["cuenta_fondos"] | null,"descripcion": string | null,"fecha": string | null,"fecha_local": string | null,"gasto_id": number | null,"monto": number | null,"movimiento_id": number | null,"nota": string | null,"origen": string | null,"pago_mixto": boolean | null,"sentido": string | null,"tipo": string | null,"turno_id": number | null,"usuario_id": string | null,"usuario_nombre": string | null,"venta_id": number | null,"venta_pasada": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_stock_certificados": {
                  Row: {
                    "activo": boolean,"aplica_a": string | null,"categoria_ids": (number)[] | null,"condicional": boolean,"dias_vuelta": number | null,"hojas_por_unidad": number,"id": number,"nombre": string,"semaforo": string | null,"servicio_ids": (number)[] | null,"stock_hojas": number,"stock_minimo": number,"todos_servicios": boolean,"unidad_compra": Database["public"]['Enums']["unidad_compra"]
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_turnos": {
                  Row: {
                    "abierto": boolean | null,"abierto_en": string,"abierto_por": string | null,"abierto_por_nombre": string | null,"atendido_por": (string)[] | null,"caja_id": number,"caja_nombre": string,"cantidad_ventas": number | null,"cerrado_en": string | null,"efectivo_cierre": number | null,"efectivo_en_caja": number | null,"efectivo_inicial": number | null,"fecha_apertura": string | null,"gastos_efectivo": number | null,"gastos_total": number | null,"id": number,"neto": number | null,"observaciones": string | null,"total_efectivo": number | null,"total_gastos": number | null,"total_tarjeta": number | null,"total_transferencia": number | null,"ventas_cantidad": number | null,"ventas_efectivo": number | null,"ventas_tarjeta": number | null,"ventas_total": number | null,"ventas_transferencia": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "turnos_abierto_por_fkey"
      columns: ["abierto_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "turnos_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
      referencedColumns: ["id"]
    }
                  ]
                },"v_turnos_abiertos": {
                  Row: {
                    "abierto_en": string | null,"caja_id": number | null,"caja_nombre": string | null,"id": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_ventas_mixtas": {
                  Row: {
                    "anulada": boolean,"anulada_en": string | null,"anulada_motivo": string | null,"caja_id": number,"caja_nombre": string | null,"creado_en": string,"fecha_local": string | null,"id": number,"pago_efectivo": number | null,"pago_tarjeta": number | null,"pago_transferencia": number | null,"pagos": Json | null,"patente": string | null,"precio": number,"servicio_nombre": string,"turno_id": number | null,"usuario_id": string,"usuario_nombre": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "ventas_caja_id_fkey"
      columns: ["caja_id"]
isOneToOne: false
      referencedRelation: "cajas"
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
          Functions: {
            "_arca_actualizar_condiciones":
{ Args: { "p_condiciones": Json }; Returns: number
                           },
"_arca_autorizar":
{ Args: { "p_cae": string,"p_cae_vencimiento": string,"p_comprobante_id": number,"p_fecha": string,"p_mensaje"?: string,"p_numero": number,"p_toma": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_config_lista":
{ Args: Record<PropertyKey, never>; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"certificado_cargado_en": string | null,
"certificado_cuit": string | null,
"certificado_secreto_id": string | null,
"certificado_sujeto": string | null,
"certificado_vence": string | null,
"clave_secreto_id": string | null,
"condiciones_actualizadas_en": string | null,
"cuit": string | null,
"domicilio": string | null,
"id": boolean,
"iibb": string | null,
"inicio_actividades": string | null,
"punto_venta": number | null,
"razon_social": string | null,
"tope_identificacion": number
            }
                          SetofOptions: {
        from: "*"
        to: "arca_configuracion"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_credenciales":
{ Args: Record<PropertyKey, never>; Returns: Record<string, unknown>
                           },
"_arca_descartar_numero":
{ Args: { "p_comprobante_id": number,"p_toma": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_en_emision":
{ Args: { "p_comprobante_id": number,"p_toma": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_guardar_credenciales":
{ Args: { "p_certificado": string,"p_clave": string,"p_cuit": string,"p_sujeto": string,"p_usuario_id": string,"p_vence": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"certificado_cargado_en": string | null,
"certificado_cuit": string | null,
"certificado_secreto_id": string | null,
"certificado_sujeto": string | null,
"certificado_vence": string | null,
"clave_secreto_id": string | null,
"condiciones_actualizadas_en": string | null,
"cuit": string | null,
"domicilio": string | null,
"id": boolean,
"iibb": string | null,
"inicio_actividades": string | null,
"punto_venta": number | null,
"razon_social": string | null,
"tope_identificacion": number
            }
                          SetofOptions: {
        from: "*"
        to: "arca_configuracion"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_guardar_token":
{ Args: { "p_ambiente": Database["public"]['Enums']["ambiente_arca"],"p_cuit": string,"p_expira": string,"p_firma": string,"p_token": string }; Returns: undefined
                           },
"_arca_liberar":
{ Args: { "p_comprobante_id": number,"p_mensaje": string,"p_toma": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_rechazar":
{ Args: { "p_comprobante_id": number,"p_mensaje": string,"p_toma": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_registrar_intento":
{ Args: { "p_ambiente": Database["public"]['Enums']["ambiente_arca"],"p_comprobante_id": number,"p_duracion_ms": number,"p_errores": Json,"p_exito": boolean,"p_mensaje": string,"p_observaciones": Json,"p_operacion": string,"p_respuesta": string,"p_solicitud": string,"p_usuario_id": string }; Returns: undefined
                           },
"_arca_registrar_numero":
{ Args: { "p_comprobante_id": number,"p_fecha": string,"p_numero": number,"p_toma": string }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_token":
{ Args: { "p_ambiente": Database["public"]['Enums']["ambiente_arca"],"p_cuit": string }; Returns: {
              "ambiente": Database["public"]['Enums']["ambiente_arca"],
"cuit": string,
"expira": string,
"firma": string,
"token": string
            }
                          SetofOptions: {
        from: "*"
        to: "arca_tokens"
        isOneToOne: true
        isSetofReturn: false
      } },
"_arca_tomar":
{ Args: { "p_comprobante_id": number }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"_calcular_impuestos_venta":
{ Args: { "p_venta_id": number }; Returns: undefined
                           },
"_certificado_para":
{ Args: { "p_condicional": boolean,"p_servicio_id": number }; Returns: number
                           },
"_efectivo_en_caja":
{ Args: { "p_turno_id": number }; Returns: number
                           },
"_exigir_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_exigir_usuario":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["rol_usuario"]
                           },
"_insertar_gasto":
{ Args: { "p_categoria_id": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_monto": number,"p_nota": string,"p_turno_id"?: number }; Returns: {
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
"_monto_descuento":
{ Args: { "p_precio": number,"p_tipo": Database["public"]['Enums']["tipo_descuento"],"p_valor": number }; Returns: number
                           },
"_mover_efectivo":
{ Args: { "p_gasto_id"?: number,"p_monto": number,"p_nota"?: string,"p_tipo": Database["public"]['Enums']["tipo_mov_efectivo"],"p_turno_id"?: number,"p_venta_id"?: number }; Returns: number
                           },
"_neto_iva":
{ Args: { "p_total": number }; Returns: Record<string, unknown>
                           },
"_normalizar_patente":
{ Args: { "p_patente": string }; Returns: string
                           },
"_pesos":
{ Args: { "p_monto": number }; Returns: string
                           },
"_registrar_compra":
{ Args: { "p_cert": Omit<Database["public"]['Tables']["certificados"]['Row'], Database["public"]['Tables']["certificados"]['ComputedFields']>,"p_costo_unidad": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_hojas_por_unidad": number,"p_proveedor": string,"p_unidades": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
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
"reemplazada_por": number | null,
"unidades": number,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "compras_certificado"
        isOneToOne: true
        isSetofReturn: false
      } },
"_texto_obligatorio":
{ Args: { "p_mensaje": string,"p_valor": string }; Returns: string
                           },
"_turno_para_trabajar":
{ Args: { "p_para_actualizar": boolean,"p_turno_id": number }; Returns: {
              "abierto_en": string,
"abierto_por": string | null,
"caja_id": number,
"cantidad_ventas": number | null,
"cerrado_en": string | null,
"efectivo_cierre": number | null,
"efectivo_inicial": number | null,
"id": number,
"observaciones": string | null,
"total_efectivo": number | null,
"total_gastos": number | null,
"total_tarjeta": number | null,
"total_transferencia": number | null,
"usuario_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "turnos"
        isOneToOne: true
        isSetofReturn: false
      } },
"_validar_destinos_certificado":
{ Args: { "p_categoria_ids": (number)[],"p_certificado_id": number,"p_condicional": boolean,"p_servicio_ids": (number)[],"p_todos": boolean }; Returns: undefined
                           },
"_validar_monto":
{ Args: { "p_campo": string,"p_monto": number }; Returns: undefined
                           },
"_validar_pagos_mixtos":
{ Args: { "p_pagos": Json }; Returns: Json
                           },
"_validar_rango_reporte":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: undefined
                           },
"_verificar_pagos_venta":
{ Args: { "p_venta_id": number }; Returns: undefined
                           },
"abrir_turno":
{ Args: { "p_caja_id": number,"p_efectivo_inicial": number }; Returns: {
              "abierto_en": string,
"abierto_por": string | null,
"caja_id": number,
"cantidad_ventas": number | null,
"cerrado_en": string | null,
"efectivo_cierre": number | null,
"efectivo_inicial": number | null,
"id": number,
"observaciones": string | null,
"total_efectivo": number | null,
"total_gastos": number | null,
"total_tarjeta": number | null,
"total_transferencia": number | null,
"usuario_id": string | null
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
"cargada_en": string | null,
"categoria_id": number,
"certificado_id": number | null,
"condicional_saldo": number | null,
"condicional_servicio_id": number | null,
"condicional_vence": string | null,
"costo_certificado": number,
"creado_en": string,
"descuento_id": number | null,
"descuento_nombre": string | null,
"descuento_tipo": Database["public"]['Enums']["tipo_descuento"] | null,
"descuento_valor": number | null,
"id": number,
"medio_pago": Database["public"]['Enums']["medio_pago"] | null,
"monto_descuento": number,
"patente": string | null,
"precio": number,
"precio_lista": number,
"servicio_id": number,
"servicio_nombre": string,
"sin_stock": boolean,
"turno_id": number | null,
"usuario_id": string,
"vuelta_de": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "ventas"
        isOneToOne: true
        isSetofReturn: false
      } },
"cajas_para_turno":
{ Args: Record<PropertyKey, never>; Returns: {
              "abierto_en": string,"id": number,"nombre": string,"ocupada": boolean,"turno_id": number
            }[]
                           },
"cerrar_turno":
{ Args: { "p_observaciones"?: string,"p_turno_id": number }; Returns: {
              "abierto_en": string,
"abierto_por": string | null,
"caja_id": number,
"cantidad_ventas": number | null,
"cerrado_en": string | null,
"efectivo_cierre": number | null,
"efectivo_inicial": number | null,
"id": number,
"observaciones": string | null,
"total_efectivo": number | null,
"total_gastos": number | null,
"total_tarjeta": number | null,
"total_transferencia": number | null,
"usuario_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "turnos"
        isOneToOne: true
        isSetofReturn: false
      } },
"certificado_condicional_para_servicio":
{ Args: { "p_servicio_id": number }; Returns: number
                           },
"certificado_para_servicio":
{ Args: { "p_servicio_id": number }; Returns: number
                           },
"condicionales_de_patente":
{ Args: { "p_patente": string }; Returns: {
              "condicional_nombre": string,"fecha": string,"pagado": number,"saldo": number,"servicio_id": number,"servicio_nombre": string,"vence": string,"venta_id": number,"vigente": boolean
            }[]
                           },
"corregir_compra_certificado":
{ Args: { "p_compra_id": number,"p_costo_unidad": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_motivo": string,"p_proveedor": string,"p_unidades": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
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
"reemplazada_por": number | null,
"unidades": number,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "compras_certificado"
        isOneToOne: true
        isSetofReturn: false
      } },
"cuit_valido":
{ Args: { "p_cuit": string }; Returns: boolean
                           },
"descuentos_para_servicio":
{ Args: { "p_servicio_id": number }; Returns: {
              "id": number,"monto_descuento": number,"nombre": string,"precio_final": number,"precio_lista": number,"tipo": Database["public"]['Enums']["tipo_descuento"],"valor": number
            }[]
                           },
"es_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"fecha_local":
{ Args: { "ts": string }; Returns: string
                           },
"fijar_destinos_certificado":
{ Args: { "p_categoria_ids": (number)[],"p_certificado_id": number,"p_servicio_ids": (number)[],"p_todos": boolean }; Returns: undefined
                           },
"fijar_servicios_descuento":
{ Args: { "p_descuento_id": number,"p_servicio_ids": (number)[] }; Returns: {
              "activo": boolean,
"actualizado_en": string,
"creado_en": string,
"id": number,
"nombre": string,
"tipo": Database["public"]['Enums']["tipo_descuento"],
"valor": number
            }
                          SetofOptions: {
        from: "*"
        to: "descuentos"
        isOneToOne: true
        isSetofReturn: false
      } },
"fijar_servicios_impuesto":
{ Args: { "p_impuesto_id": number,"p_servicio_ids": (number)[],"p_todos": boolean }; Returns: {
              "activo": boolean,
"actualizado_en": string,
"creado_en": string,
"id": number,
"medios": (Database["public"]['Enums']["medio_pago"])[],
"nombre": string,
"tipo": Database["public"]['Enums']["tipo_impuesto"],
"todos_servicios": boolean,
"valor": number
            }
                          SetofOptions: {
        from: "*"
        to: "impuestos"
        isOneToOne: true
        isSetofReturn: false
      } },
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
"movimiento_fondos":
{ Args: { "p_cuenta": Database["public"]['Enums']["cuenta_fondos"],"p_monto": number,"p_nota": string,"p_tipo": Database["public"]['Enums']["tipo_mov_fondos"] }; Returns: {
              "caja_id": number | null,
"caja_nombre": string | null,
"clave": string | null,
"compra_id": number | null,
"cuenta": Database["public"]['Enums']["cuenta_fondos"] | null,
"descripcion": string | null,
"fecha": string | null,
"fecha_local": string | null,
"gasto_id": number | null,
"monto": number | null,
"movimiento_id": number | null,
"nota": string | null,
"origen": string | null,
"pago_mixto": boolean | null,
"sentido": string | null,
"tipo": string | null,
"turno_id": number | null,
"usuario_id": string | null,
"usuario_nombre": string | null,
"venta_id": number | null,
"venta_pasada": boolean | null
            }
                          SetofOptions: {
        from: "*"
        to: "v_movimientos_fondos"
        isOneToOne: true
        isSetofReturn: false
      } },
"nombre_usuario":
{ Args: { "p_usuario_id": string }; Returns: string
                           },
"preparar_factura":
{ Args: { "p_condicion_iva_id": number,"p_doc_nro": number,"p_doc_tipo": number,"p_receptor_nombre"?: string,"p_venta_id": number }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"puede_emitir_comprobante":
{ Args: { "p_comprobante_id": number }; Returns: {
              "actualizado_en": string,
"actualizado_por": string | null,
"ambiente": Database["public"]['Enums']["ambiente_arca"],
"asociado_id": number | null,
"autorizado_en": string | null,
"cae": string | null,
"cae_vencimiento": string | null,
"cbte_tipo": number,
"clase": string,
"condicion_iva_receptor_id": number,
"creado_en": string,
"creado_por": string,
"cuit_emisor": string,
"doc_nro": number,
"doc_tipo": number,
"emisor_domicilio": string | null,
"emisor_iibb": string | null,
"emisor_inicio_actividades": string | null,
"emisor_razon_social": string | null,
"estado": Database["public"]['Enums']["estado_comprobante"],
"fecha": string | null,
"fecha_servicio": string,
"id": number,
"intentos": number,
"iva": number,
"mensaje": string | null,
"neto": number,
"numero": number | null,
"numero_intentado": number | null,
"procesando_desde": string | null,
"punto_venta": number,
"receptor_nombre": string | null,
"tipo": Database["public"]['Enums']["tipo_comprobante"],
"toma": string | null,
"tomado_en": string | null,
"total": number,
"venta_id": number
            }
                          SetofOptions: {
        from: "*"
        to: "comprobantes"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_compra_certificado":
{ Args: { "p_certificado_id": number,"p_costo_unidad": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_proveedor"?: string,"p_unidades": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
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
"reemplazada_por": number | null,
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
{ Args: { "p_categoria_id": number,"p_fuente": Database["public"]['Enums']["fuente_fondos"],"p_monto": number,"p_nota": string,"p_turno_id"?: number }; Returns: {
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
{ Args: { "p_condicional"?: boolean,"p_condicional_mitad"?: boolean,"p_descuento_id"?: number,"p_medio_pago"?: Database["public"]['Enums']["medio_pago"],"p_pagos"?: Json,"p_patente"?: string,"p_precio_esperado"?: number,"p_servicio_id": number,"p_turno_id": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
"caja_id": number,
"cargada_en": string | null,
"categoria_id": number,
"certificado_id": number | null,
"condicional_saldo": number | null,
"condicional_servicio_id": number | null,
"condicional_vence": string | null,
"costo_certificado": number,
"creado_en": string,
"descuento_id": number | null,
"descuento_nombre": string | null,
"descuento_tipo": Database["public"]['Enums']["tipo_descuento"] | null,
"descuento_valor": number | null,
"id": number,
"medio_pago": Database["public"]['Enums']["medio_pago"] | null,
"monto_descuento": number,
"patente": string | null,
"precio": number,
"precio_lista": number,
"servicio_id": number,
"servicio_nombre": string,
"sin_stock": boolean,
"turno_id": number | null,
"usuario_id": string,
"vuelta_de": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "ventas"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_venta_pasada":
{ Args: { "p_caja_id": number,"p_fecha": string,"p_hora": string,"p_medio_pago": Database["public"]['Enums']["medio_pago"],"p_patente"?: string,"p_precio": number,"p_servicio_id": number }; Returns: {
              "anulada": boolean,
"anulada_en": string | null,
"anulada_motivo": string | null,
"anulada_por": string | null,
"caja_id": number,
"cargada_en": string | null,
"categoria_id": number,
"certificado_id": number | null,
"condicional_saldo": number | null,
"condicional_servicio_id": number | null,
"condicional_vence": string | null,
"costo_certificado": number,
"creado_en": string,
"descuento_id": number | null,
"descuento_nombre": string | null,
"descuento_tipo": Database["public"]['Enums']["tipo_descuento"] | null,
"descuento_valor": number | null,
"id": number,
"medio_pago": Database["public"]['Enums']["medio_pago"] | null,
"monto_descuento": number,
"patente": string | null,
"precio": number,
"precio_lista": number,
"servicio_id": number,
"servicio_nombre": string,
"sin_stock": boolean,
"turno_id": number | null,
"usuario_id": string,
"vuelta_de": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "ventas"
        isOneToOne: true
        isSetofReturn: false
      } },
"resumen_dashboard":
{ Args: { "p_desde"?: string,"p_hasta"?: string,"p_turno_id"?: number }; Returns: {
              "agrupacion": string,"cantidad": number,"id": number,"nombre": string,"total": number,"total_descontado": number
            }[]
                           },
"resumen_descuentos":
{ Args: { "p_desde"?: string,"p_hasta"?: string }; Returns: {
              "agrupacion": string,"cantidad_ventas": number,"id": number,"nombre": string,"total_descontado": number
            }[]
                           },
"resumen_diario":
{ Args: { "p_desde"?: string,"p_hasta"?: string }; Returns: {
              "cantidad_ventas": number,"costo_certificados": number,"fecha": string,"flujo_neto": number,"margen_bruto": number,"total_efectivo": number,"total_gastos": number,"total_tarjeta": number,"total_transferencia": number,"total_ventas": number,"ventas_sin_stock": number
            }[]
                           },
"resumen_fondos":
{ Args: { "p_desde"?: string,"p_hasta"?: string }; Returns: {
              "cantidad_movimientos": number,"cuenta": Database["public"]['Enums']["cuenta_fondos"],"egresos": number,"ingresos": number,"neto": number,"saldo": number
            }[]
                           },
"resumen_gastos":
{ Args: { "p_desde"?: string,"p_hasta"?: string,"p_turno_id"?: number }; Returns: {
              "agrupacion": string,"cantidad": number,"id": number,"nombre": string,"total": number
            }[]
                           },
"resumen_impuestos":
{ Args: { "p_desde"?: string,"p_hasta"?: string,"p_turno_id"?: number }; Returns: {
              "agrupacion": string,"cantidad_ventas": number,"id": number,"nombre": string,"total": number,"total_efectivo": number,"total_tarjeta": number,"total_transferencia": number
            }[]
                           },
"resumen_turnos":
{ Args: { "p_desde"?: string,"p_hasta"?: string }; Returns: {
              "cantidad_turnos": number,"gastos_total": number,"neto": number,"turnos_abiertos": number,"ventas_cantidad": number,"ventas_efectivo": number,"ventas_tarjeta": number,"ventas_total": number,"ventas_transferencia": number
            }[]
                           },
"resumen_ventas_mixtas":
{ Args: { "p_desde"?: string,"p_hasta"?: string }; Returns: {
              "cantidad_ventas": number,"incluido_en_cuentas": boolean,"total": number,"total_efectivo": number,"total_tarjeta": number,"total_transferencia": number
            }[]
                           },
"rol_actual":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["rol_usuario"]
                           },
"stock_certificados_valorizado":
{ Args: Record<PropertyKey, never>; Returns: {
              "activo": boolean,"aplica_a": string,"categoria_ids": (number)[],"condicional": boolean,"costo_promedio": number,"dias_vuelta": number,"hojas_por_unidad": number,"id": number,"nombre": string,"semaforo": string,"servicio_ids": (number)[],"stock_hojas": number,"stock_minimo": number,"todos_servicios": boolean,"unidad_compra": Database["public"]['Enums']["unidad_compra"],"valor_stock": number
            }[]
                           },
"turno_abierto":
{ Args: { "p_turno_id": number }; Returns: boolean
                           },
"turnos_abiertos":
{ Args: Record<PropertyKey, never>; Returns: {
              "abierto_en": string,"caja_id": number,"caja_nombre": string,"id": number
            }[]
                           },
"ventas_por_dia":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "cantidad": number,"fecha": string,"total": number
            }[]
                           },
"ventas_por_patente":
{ Args: { "p_patente": string }; Returns: {
              "anulada": boolean,"caja_nombre": string,"categoria_nombre": string,"certificado_nombre": string,"condicional_saldo": number,"condicional_servicio": string,"condicional_vence": string,"creado_en": string,"id": number,"medio": string,"patente": string,"precio": number,"servicio_nombre": string,"sin_stock": boolean,"usuario_nombre": string,"venta_pasada": boolean,"vuelta_de": number,"vuelta_venta_id": number
            }[]
                           }
          }
          Enums: {
            "ambiente_arca": "homologacion"|"produccion","cuenta_fondos": "efectivo"|"transferencia"|"tarjeta","estado_comprobante": "pendiente"|"procesando"|"autorizado"|"rechazado"|"cancelado","fuente_fondos": "efectivo"|"transferencia","medio_pago": "efectivo"|"transferencia"|"tarjeta","rol_usuario": "admin"|"cajero","tipo_alerta": "venta_sin_stock"|"stock_bajo","tipo_comprobante": "factura"|"nota_credito","tipo_descuento": "porcentaje"|"monto_fijo","tipo_impuesto": "porcentaje"|"monto_fijo","tipo_mov_certificado": "compra"|"venta"|"ajuste"|"anulacion_compra","tipo_mov_efectivo": "fondo_inicial"|"ingreso"|"retiro"|"venta"|"anulacion_venta"|"gasto"|"anulacion_gasto"|"apertura_turno"|"cierre_turno","tipo_mov_fondos": "fondo_inicial"|"ingreso"|"retiro","unidad_compra": "caja"|"libreta"|"unidad"
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
            "ambiente_arca": ["homologacion", "produccion"],"cuenta_fondos": ["efectivo", "transferencia", "tarjeta"],"estado_comprobante": ["pendiente", "procesando", "autorizado", "rechazado", "cancelado"],"fuente_fondos": ["efectivo", "transferencia"],"medio_pago": ["efectivo", "transferencia", "tarjeta"],"rol_usuario": ["admin", "cajero"],"tipo_alerta": ["venta_sin_stock", "stock_bajo"],"tipo_comprobante": ["factura", "nota_credito"],"tipo_descuento": ["porcentaje", "monto_fijo"],"tipo_impuesto": ["porcentaje", "monto_fijo"],"tipo_mov_certificado": ["compra", "venta", "ajuste", "anulacion_compra"],"tipo_mov_efectivo": ["fondo_inicial", "ingreso", "retiro", "venta", "anulacion_venta", "gasto", "anulacion_gasto", "apertura_turno", "cierre_turno"],"tipo_mov_fondos": ["fondo_inicial", "ingreso", "retiro"],"unidad_compra": ["caja", "libreta", "unidad"]
          }
        }
} as const
