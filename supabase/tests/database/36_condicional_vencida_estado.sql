-- Migración 48: lo que se hizo con una condicional vencida queda registrado en la venta.
begin;
\ir _helpers.psql
select plan(14);

select * from pg_temp.escenario() \gset

select ok(has_column_privilege('authenticated', 'public.ventas', 'vuelta_fuera_de_plazo', 'select')
  and has_column_privilege('authenticated', 'public.ventas', 'condicional_vencida_de', 'select'),
  'authenticated lee vuelta_fuera_de_plazo y condicional_vencida_de');
select ok(not has_function_privilege('authenticated', 'public._ventas_condicional_vencida()', 'execute'),
  'la función del trigger es interna');

select pg_temp.como(:'admin');
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Auto R', :categoria, 60000, true) returning id as auto \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Moto R', :categoria, 30000, true) returning id as moto \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja E R', 1) returning id as c_e \gset
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Hoja B R', 1, true, 30) returning id as c_b \gset
select fijar_destinos_certificado(:c_e, false, '{}', array[:auto, :moto]::bigint[]);
select fijar_destinos_certificado(:c_b, false, '{}', array[:auto, :moto]::bigint[]);
select ajustar_stock_certificado(:c_e, 20, 'Stock de prueba');
select ajustar_stock_certificado(:c_b, 20, 'Stock de prueba');
reset role;

select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
-- RA: vigente (vuelta en plazo). RB: vencida (vuelta fuera de plazo). RC: vencida (se cobra de nuevo).
-- RD: vencida (otra condicional).
select (registrar_venta(:turno, :auto, 'tarjeta', 'RA111AA', p_condicional => true)).id as c_ra \gset
select (registrar_venta(:turno, :auto, 'tarjeta', 'RB222BB', p_condicional => true)).id as c_rb \gset
select (registrar_venta(:turno, :auto, 'tarjeta', 'RC333CC', p_condicional => true)).id as c_rc \gset
select (registrar_venta(:turno, :auto, 'tarjeta', 'RD444DD', p_condicional => true)).id as c_rd \gset
reset role;
update ventas set condicional_vence = fecha_local(now()) - 1 where id in (:c_rb, :c_rc, :c_rd);
select pg_temp.como(:'cajero');

-- En plazo y fuera de plazo -------------------------------------------------------------------------
select (registrar_venta(:turno, :auto, 'efectivo', 'RA111AA', p_precio_esperado => 0)).id as v_ra \gset
select (registrar_venta(:turno, :auto, 'efectivo', 'RB222BB', p_precio_esperado => 0, p_vuelta_vencida => :c_rb)).id as v_rb \gset
reset role;
select is((select row(vuelta_de, vuelta_fuera_de_plazo, condicional_vencida_de)::text from ventas where id = :v_ra),
  row(:c_ra::bigint, false, null::bigint)::text, 'la vuelta en plazo no queda fuera de plazo');
select is((select row(vuelta_de, vuelta_fuera_de_plazo, condicional_vencida_de)::text from ventas where id = :v_rb),
  row(:c_rb::bigint, true, null::bigint)::text, 'la vuelta de una condicional vencida queda fuera de plazo');

-- Se cobra de nuevo: la condicional vencida queda resuelta --------------------------------------------
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :moto, 'tarjeta', 'RC333CC')).id as v_otro_servicio \gset
select is((select condicional_vencida_de from ventas where id = :v_otro_servicio), null::bigint,
  'otro servicio no toca la condicional vencida');
select (registrar_venta(:turno, :auto, 'tarjeta', 'RC333CC')).id as v_rc \gset
reset role;
select is((select row(precio, vuelta_de, condicional_vencida_de, vuelta_fuera_de_plazo)::text from ventas where id = :v_rc),
  row(60000.00::numeric(12,2), null::bigint, :c_rc::bigint, false)::text,
  'cobrar completo con una condicional vencida queda registrado');
select pg_temp.como(:'cajero');
select is((select count(*)::int from condicionales_de_patente('RC333CC')), 0,
  'la condicional cobrada de nuevo ya no aparece');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L, p_vuelta_vencida => %s)', :turno, :auto, 'efectivo', 'RC333CC', :c_rc),
  'P0001', 'La condicional de la patente RC333CC ya se cobró de nuevo en otra venta: revisá el historial',
  'y no admite la vuelta');
select (registrar_venta(:turno, :auto, 'tarjeta', 'RC333CC')).id as v_rc2 \gset
reset role;
select is((select condicional_vencida_de from ventas where id = :v_rc2), null::bigint,
  'una venta después ya no la marca');

-- Anular la venta que la cobró de nuevo la libera -----------------------------------------------------
select pg_temp.como(:'admin');
select anular_venta(:v_rc, 'error');
reset role;
select pg_temp.como(:'cajero');
select is((select count(*)::int from condicionales_de_patente('RC333CC') where not vigente), 1,
  'anular la venta libera la condicional vencida');

-- Otra condicional: también es cobrar de nuevo ----------------------------------------------------------
select (registrar_venta(:turno, :auto, 'tarjeta', 'RD444DD', p_condicional => true)).id as v_rd \gset
reset role;
select is((select row(condicional_vencida_de, condicional_vence is not null)::text from ventas where id = :v_rd),
  row(:c_rd::bigint, true)::text, 'otra condicional después de la vencida queda registrada');
select pg_temp.como(:'cajero');
select is((select array_agg(venta_id order by venta_id) from condicionales_de_patente('RD444DD')),
  array[:v_rd::bigint], 'queda solo la nueva (vigente)');
reset role;

-- Ventas con fecha pasada: no se marcan -----------------------------------------------------------------
select pg_temp.como(:'admin');
select (registrar_venta_pasada('2026-11-01', '10:00', :caja, :auto, 'tarjeta', 60000, 'RC333CC')).id as v_pasada \gset
reset role;
select is((select condicional_vencida_de from ventas where id = :v_pasada), null::bigint,
  'una venta con fecha pasada no se marca');
select throws_ok(format('update ventas set condicional_vencida_de = %s where id = %s', :c_rb, :v_rb),
  '23514', null, 'una venta no es vuelta y recobro a la vez');

select * from finish();
rollback;
