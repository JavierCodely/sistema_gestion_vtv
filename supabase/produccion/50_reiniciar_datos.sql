
  -- Reinicia los datos (ventas, turnos, gastos, Fondos…) sin tocar el esquema ni los usuarios.
  -- Requiere las migraciones hasta la 42 (condicional como certificado). Ver LEEME.md.
  begin;

  do $$
  declare
    v_confirmacion            text    := 'NO';                       -- <<< escribí exactamente: EMPEZAR DE CERO
    v_borrar_catalogo         boolean := true;                       -- <<< false = conservar cajas, servicios, certificados (también los condicionales), descuentos, impuestos
    v_borrar_categorias_gasto boolean := true;                       -- <<< false = conservar los rubros y subcategorías de gasto
    v_borrar_facturas_reales  text    := 'NO';                       -- <<< solo si hay facturas reales: BORRAR FACTURAS REALES

    v_facturas    bigint;
    v_tablas      text;
    v_rubro       record;
    v_padre       bigint;
    v_sub         text;
  begin
    if v_confirmacion <> 'EMPEZAR DE CERO' then
      raise exception 'Por seguridad no se borró nada. Cambiá v_confirmacion a ''EMPEZAR DE CERO'' para confirmar.';
    end if;

    select count(*) into v_facturas
    from public.comprobantes
    where estado = 'autorizado' and ambiente = 'produccion';
    if v_facturas > 0 and v_borrar_facturas_reales <> 'BORRAR FACTURAS REALES' then
      raise exception 'Hay % comprobante(s) autorizado(s) por ARCA en producción. No se borró nada. Si igual querés borrarlos de este sistema (en ARCA siguen existiendo), cambiá v_borrar_facturas_reales a ''BORRAR FACTURAS REALES''.', v_facturas;
    end if;

    -- Operaciones (y catálogo, si se eligió). TRUNCATE sin CASCADE: si alguna tabla que
    -- referencia a estas quedara afuera, falla y no borra nada (nunca borra de más).
    v_tablas :=
        -- Ventas: cobros, impuestos calculados, condicionales (enteras o al 50%) y sus vueltas
        -- (son columnas de ventas: condicional_*, vuelta_de; migraciones 40 a 42)
        'public.venta_impuestos, public.venta_pagos, public.ventas, '
        -- Facturación ARCA
      || 'public.comprobantes, public.arca_intentos, public.arca_tokens, '
        -- Gastos (los cargados a mano y los automáticos de las compras de certificados)
      || 'public.gastos, '
        -- Certificados: compras y kardex (stock)
      || 'public.compras_certificado, public.movimientos_certificado, '
        -- Fondos: caja de cambio y manuales de transferencia/tarjeta
      || 'public.movimientos_efectivo, public.movimientos_fondos, '
        -- Turnos y alertas
      || 'public.turnos, public.alertas';
    if v_borrar_catalogo then
      v_tablas := v_tablas || ', public.impuesto_servicios, public.impuestos, '
              || 'public.descuento_servicios, public.descuentos, public.certificado_destinos, public.certificados, '
              || 'public.servicios, public.categorias_servicio, public.cajas';
    end if;
    if v_borrar_categorias_gasto then
      -- TRUNCATE no dispara el trigger que protege la categoría del sistema: se vuelve a crear abajo.
      v_tablas := v_tablas || ', public.categorias_gasto';
    end if;
    execute 'truncate table ' || v_tablas || ' restart identity';

    -- Rubros y subcategorías de fábrica (los mismos de la instalación, migración 07).
    if v_borrar_categorias_gasto then
      for v_rubro in
        select * from (values
          (1, 'Insumos',              array['Compra de certificados', 'Papelería', 'Tóner y tinta']),
          (2, 'Limpieza',             array['Productos de limpieza', 'Servicio de limpieza']),
          (3, 'Personal',             array['Sueldos', 'Adelantos', 'Horas extra']),
          (4, 'Comida y refrigerio',  array['Comida', 'Café y bebidas']),
          (5, 'Servicios',            array['Luz', 'Agua', 'Gas', 'Internet y telefonía', 'Alquiler']),
          (6, 'Mantenimiento',        array['Edificio', 'Equipos de inspección', 'Informática']),
          (7, 'Impuestos y tasas',    array['Impuestos', 'Tasas municipales']),
          (8, 'Administración',       array['Honorarios', 'Bancos y comisiones', 'Seguros']),
          (9, 'Varios',               array['Otros'])
        ) as t(orden, nombre, subs)
        order by orden
      loop
        insert into public.categorias_gasto (nombre) values (v_rubro.nombre) returning id into v_padre;
        foreach v_sub in array v_rubro.subs loop
          insert into public.categorias_gasto (nombre, padre_id, habilitada_caja, sistema)
          values (
            v_sub,
            v_padre,
            v_sub in ('Papelería', 'Productos de limpieza', 'Comida', 'Café y bebidas', 'Otros'),
            case when v_sub = 'Compra de certificados' then 'compra_certificados' end
          );
        end loop;
      end loop;
    end if;

    -- Caja de cambio en $ 0 (fila única).
    update public.caja_efectivo set saldo = 0, actualizado_en = now() where id = 1;

    -- Certificados conservados: sin compras ni ventas, el stock y el costo vuelven a 0.
    if not v_borrar_catalogo then
      update public.certificados set stock_hojas = 0, costo_promedio = 0 where id is not null;
    end if;

    raise notice 'Listo. Datos reiniciados (usuarios intactos); catálogo borrado: %; categorías de gasto de fábrica: %.',
      case when v_borrar_catalogo then 'sí' else 'no' end,
      case when v_borrar_categorias_gasto then 'sí' else 'no (se conservaron las tuyas)' end;
  end;
  $$;

  commit;

  -- Verificación: operaciones en 0; usuarios igual que antes; catálogo según lo elegido.
  select
    (select count(*) from public.ventas)                as ventas,
    (select count(*) from public.turnos)                as turnos,
    (select count(*) from public.gastos)                as gastos,
    (select count(*) from public.ventas where condicional_servicio_id is not null or vuelta_de is not null)
                                                        as condicionales_y_vueltas,
    (select count(*) from public.ventas where condicional_saldo > 0) as condicionales_al_50,
    (select count(*) from public.venta_impuestos)       as impuestos_de_ventas,
    (select count(*) from public.movimientos_fondos)    as movimientos_fondos,
    (select count(*) from public.compras_certificado)   as compras,
    (select count(*) from public.comprobantes)          as comprobantes,
    (select saldo    from public.caja_efectivo)         as saldo_caja_cambio,
    (select count(*) from public.cajas)                 as cajas,
    (select count(*) from public.servicios)             as servicios,
    (select count(*) from public.certificados)          as certificados,
    (select count(*) from public.certificados where condicional) as certificados_condicionales,
    (select count(*) from public.descuentos)            as descuentos,
    (select count(*) from public.impuestos)             as impuestos,
    (select count(*) from public.categorias_gasto)      as categorias_gasto,
    (select count(*) from public.perfiles)              as usuarios;
