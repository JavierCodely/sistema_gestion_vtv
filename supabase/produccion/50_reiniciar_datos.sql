-- =====================================================================
-- Sistema VTV — REINICIAR LOS DATOS (empezar de cero conservando los usuarios)
--
-- ⚠ DESTRUCTIVO E IRREVERSIBLE. Hacé un backup antes si hay algo que quieras guardar
--   (Dashboard → Database → Backups).
--
-- A diferencia de 99_borrar_todo.sql, NO toca el esquema (tablas, funciones, permisos,
-- historial de migraciones): la base queda instalada y lista para usar.
--
-- Borra SIEMPRE (operaciones):
--   ventas y sus pagos, turnos, gastos, compras de certificados, kardex de certificados,
--   libro de la caja de cambio (saldo a $ 0), movimientos manuales de Fondos, alertas,
--   comprobantes (facturas / NC), el log de ARCA y los impuestos calculados de cada venta.
--   Los números (venta, turno, gasto…) vuelven a empezar en 1.
--
-- Borra SI ELEGÍS (abajo):
--   v_borrar_catalogo       → cajas, categorías de servicio, servicios, certificados, descuentos
--                             e impuestos.
--                             Si queda en false, se conservan y el stock de los certificados
--                             vuelve a 0 hojas con costo promedio 0.
--   v_borrar_categorias_gasto → rubros y subcategorías de gasto: borra los que creaste y deja los
--                             que trae el sistema al instalarse (9 rubros con sus subcategorías,
--                             incluida "Insumos › Compra de certificados", que usa la BD), tal
--                             como vienen de fábrica (cuáles puede usar el cajero, todos activos).
--
-- Conserva SIEMPRE:
--   TODOS los usuarios (login, perfil, rol y contraseña), la configuración de
--   ARCA (CUIT, punto de venta, certificado y clave en Vault) y las condiciones de IVA.
--
-- Facturas reales: si hay facturas AUTORIZADAS en ambiente de PRODUCCIÓN, el script se niega
-- salvo que confirmes v_borrar_facturas_reales. Esas facturas siguen existiendo en ARCA (la
-- numeración continúa desde el último número autorizado en ARCA); solo se borran de este sistema.
--
-- Uso: completá los valores marcados con <<< y ejecutá TODO el script en el SQL Editor.
-- Corre en una transacción: si algo falla, no se borra nada.
-- Después: Fondos → Efectivo → "Fondo inicial", y Ventas → "Abrir turno".
-- =====================================================================

begin;

do $$
declare
  v_confirmacion            text    := 'NO';                       -- <<< escribí exactamente: EMPEZAR DE CERO
  v_borrar_catalogo         boolean := true;                       -- <<< false = conservar cajas, servicios, certificados, descuentos
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
  v_tablas := 'public.venta_impuestos, public.venta_pagos, public.comprobantes, public.arca_intentos, public.arca_tokens, '
           || 'public.alertas, public.ventas, public.compras_certificado, public.gastos, '
           || 'public.movimientos_certificado, public.movimientos_efectivo, public.movimientos_fondos, '
           || 'public.turnos';
  if v_borrar_catalogo then
    v_tablas := v_tablas || ', public.impuesto_servicios, public.impuestos, '
             || 'public.descuento_servicios, public.descuentos, public.certificados, '
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
  (select count(*) from public.compras_certificado)   as compras,
  (select count(*) from public.comprobantes)          as comprobantes,
  (select saldo    from public.caja_efectivo)         as saldo_caja_cambio,
  (select count(*) from public.cajas)                 as cajas,
  (select count(*) from public.servicios)             as servicios,
  (select count(*) from public.certificados)          as certificados,
  (select count(*) from public.descuentos)            as descuentos,
  (select count(*) from public.categorias_gasto)      as categorias_gasto,
  (select count(*) from public.perfiles)              as usuarios;
