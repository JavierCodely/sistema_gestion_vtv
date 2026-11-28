-- Migración 51: estadísticas del admin (vehículos, tipo, condicionales, horarios, año contra año).
-- Los datos se mueven a 2001 y 2002 para no mezclarse con otros (seed incluido).
begin;
\ir _helpers.psql
select plan(20);

select * from pg_temp.escenario() \gset

-- Privilegios -------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.estadisticas_vehiculos(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.estadisticas_categorias(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.estadisticas_condicionales(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.estadisticas_horarios(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.comparacion_anual(integer)', 'execute'),
  'authenticated ejecuta las RPC de estadísticas (el control es _exigir_admin)');
select ok(not has_function_privilege('anon', 'public.estadisticas_vehiculos(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.comparacion_anual(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public._inicio_dia_local(date)', 'execute')
  and not has_function_privilege('authenticated', 'public._validar_rango_estadisticas(date, date)', 'execute'),
  'anon no las ejecuta y las auxiliares son internas');

-- Catálogo: servicio de la categoría de prueba (20000) con certificado de siempre y condicional;
-- moto (10000) en otra categoría.
select pg_temp.como(:'admin');
insert into categorias_servicio (nombre) values ('Motos est') returning id as cat_motos \gset
insert into servicios (categoria_id, nombre, precio) values (:cat_motos, 'Moto est', 10000) returning id as moto \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja E est', 1) returning id as c_e \gset
insert into certificados (nombre, hojas_por_unidad, condicional, dias_vuelta)
  values ('Hoja B est', 1, true, 30) returning id as c_b \gset
select fijar_destinos_certificado(:c_e, false, '{}', array[:servicio]::bigint[]);
select fijar_destinos_certificado(:c_b, false, '{}', array[:servicio]::bigint[]);
reset role;

select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
-- Año anterior
select (registrar_venta(:turno, :servicio, 'efectivo', 'AAA111')).id as p1 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'DDD444')).id as p2 \gset
-- Marzo 2002
select (registrar_venta(:turno, :servicio, 'efectivo', 'AAA111')).id as v1 \gset
select (registrar_venta(:turno, :moto, 'transferencia', 'BBB222')).id as v2 \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'AAA111')).id as v3 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'CCC333')).id as v4 \gset
select anular_venta(:v4, 'Se cargó mal');
-- Condicionales: KKK vuelve en plazo, LLL al 50% sigue vigente, MMM vuelve fuera de plazo,
-- NNN vence sin volver, PPP vence y se cobra de nuevo.
select (registrar_venta(:turno, :servicio, 'transferencia', 'KKK111', p_condicional => true)).id as c1 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'KKK111', p_precio_esperado => 0)).id as vk1 \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'LLL222', p_condicional => true, p_condicional_mitad => true)).id as c2 \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'MMM333', p_condicional => true)).id as c3 \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'NNN444', p_condicional => true)).id as c4 \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'PPP555', p_condicional => true)).id as c5 \gset
reset role;
update ventas set condicional_vence = fecha_local(now()) - 1 where id in (:c3, :c4, :c5);
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo', 'MMM333', p_precio_esperado => 0, p_vuelta_vencida => :c3)).id as vm3 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'PPP555')).id as r5 \gset
-- Abril 2002
select (registrar_venta(:turno, :servicio, 'efectivo', 'ZZZ999')).id as v_abril \gset
reset role;
-- Ventas con fecha pasada (sin hora: 00:00): no cuentan en los horarios.
select pg_temp.como(:'admin');
select (registrar_venta_pasada('2002-03-06', '00:00', :caja, :moto, 'efectivo', 15000, 'EEE555')).id as vp1 \gset
select (registrar_venta_pasada('2002-03-20', '00:00', :caja, :moto, 'efectivo', 5000)).id as vp2 \gset
reset role;

select is((select condicional_vencida_de from ventas where id = :r5), :c5::bigint,
  'la venta de PPP555 resuelve su condicional vencida');

update ventas set creado_en = case id
    when :p1 then '2001-05-10 10:00-03'::timestamptz
    when :p2 then '2001-03-10 10:00-03'
    when :v1 then '2002-03-04 09:30-03'   -- lunes
    when :v2 then '2002-03-04 11:10-03'
    when :v3 then '2002-03-05 11:45-03'   -- martes
    when :v4 then '2002-03-05 10:00-03'
    when :c1 then '2002-03-06 11:00-03'   -- miércoles
    when :c2 then '2002-03-06 11:30-03'
    when :vk1 then '2002-03-07 11:20-03'  -- jueves
    when :c3 then '2002-03-08 11:00-03'   -- viernes
    when :c4 then '2002-03-08 11:15-03'
    when :c5 then '2002-03-08 11:30-03'
    when :vm3 then '2002-03-09 11:00-03'  -- sábado
    when :r5 then '2002-03-09 12:00-03'
    when :v_abril then '2002-04-02 10:00-03'
  end
where id in (:p1, :p2, :v1, :v2, :v3, :v4, :c1, :c2, :vk1, :c3, :c4, :c5, :vm3, :r5, :v_abril);

-- Permisos y validaciones -------------------------------------------------------------------------
select pg_temp.como(:'cajero');
select throws_ok($$select * from estadisticas_vehiculos('2002-03-01', '2002-03-31')$$, '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve las estadísticas de vehículos');
select throws_ok('select * from comparacion_anual(2002)', '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve la comparación anual');
reset role;

select pg_temp.como(:'admin');
select throws_ok($$select * from estadisticas_categorias(null, '2002-03-31')$$, '22023',
  'Indicá las fechas desde y hasta', 'sin fecha desde se rechaza');
select throws_ok($$select * from estadisticas_horarios('2002-04-01', '2002-03-01')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'un rango invertido se rechaza');
select throws_ok('select * from comparacion_anual(1999)', '22023',
  'Elegí un año entre 2000 y 2100', 'un año fuera de rango se rechaza');

-- Vehículos ---------------------------------------------------------------------------------------
select is((select row(e.*)::text from estadisticas_vehiculos('2002-03-01', '2002-03-31') e),
  row(13::bigint, 180000.00, 13846.15, 1::bigint, 8::bigint, 7::bigint, 1::bigint, 2::bigint,
      1::bigint, 20000.00)::text,
  'marzo: 13 ventas, 8 vehículos (7 nuevos, AAA111 vuelve), 2 repetidos sin contar vueltas, 1 anulada');
select is((select row(e.vehiculos, e.vehiculos_nuevos, e.vehiculos_que_vuelven)::text
           from estadisticas_vehiculos('2001-01-01', '2001-12-31') e),
  row(2::bigint, 2::bigint, 0::bigint)::text, 'en 2001 los dos vehículos son nuevos');
select is((select row(e.*)::text from estadisticas_vehiculos('2003-01-01', '2003-01-31') e),
  row(0::bigint, 0.00, 0.00, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0.00)::text,
  'un período sin ventas da todo en 0');

-- Tipo de vehículo --------------------------------------------------------------------------------
select results_eq(
  $$select nombre, ventas, vehiculos, total from estadisticas_categorias('2002-03-01', '2002-03-31')$$,
  $$values ('Categoría Test'::text, 10::bigint, 6::bigint, 150000.00::numeric(14,2)),
           ('Motos est', 3, 2, 30000.00)$$,
  'por categoría: ventas, vehículos distintos (sin contar los sin patente) y total');

-- Condicionales -----------------------------------------------------------------------------------
select is((select row(e.*)::text from estadisticas_condicionales('2002-03-01', '2002-03-31') e),
  row(5::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint)::text,
  '5 condicionales: 1 al 50%, 1 volvió en plazo, 1 fuera de plazo, 1 cobrada de nuevo, 1 vigente, 1 vencida');
select is((select condicionales from estadisticas_condicionales('2002-04-01', '2002-04-30')), 0::bigint,
  'abril no tiene condicionales');

-- Horarios ----------------------------------------------------------------------------------------
select results_eq(
  $$select valor, cantidad, total from estadisticas_horarios('2002-03-01', '2002-03-31')
    where agrupacion = 'dia'$$,
  $$values (1, 2::bigint, 30000.00::numeric(14,2)), (2, 1, 20000.00), (3, 2, 30000.00),
           (4, 1, 0.00), (5, 3, 60000.00), (6, 2, 20000.00), (7, 0, 0.00)$$,
  'los 7 días (1 = lunes), sin anuladas ni ventas con fecha pasada');
select results_eq(
  $$select valor, cantidad, total from estadisticas_horarios('2002-03-01', '2002-03-31')
    where agrupacion = 'hora'$$,
  $$values (9, 1::bigint, 20000.00::numeric(14,2)), (10, 0, 0.00), (11, 9, 120000.00), (12, 1, 20000.00)$$,
  'las horas de la primera a la última con ventas, sin huecos');
select is((select count(*) from estadisticas_horarios('2003-01-01', '2003-01-31') where agrupacion = 'hora'),
  0::bigint, 'sin ventas no hay horas');

-- Año contra año ----------------------------------------------------------------------------------
select results_eq(
  $$select mes, ventas, total, vehiculos, ventas_anterior, total_anterior, vehiculos_anterior
    from comparacion_anual(2002) where ventas > 0 or ventas_anterior > 0$$,
  $$values (3, 13::bigint, 180000.00::numeric(14,2), 8::bigint, 1::bigint, 20000.00::numeric(14,2), 1::bigint),
           (4, 1, 20000.00, 1, 0, 0.00, 0),
           (5, 0, 0.00, 0, 1, 20000.00, 1)$$,
  'cada mes del año contra el mismo mes del anterior');
select is((select count(*) from comparacion_anual(2002)), 12::bigint, 'siempre 12 meses');
reset role;

select pg_temp.como_anonimo();
select throws_ok($$select * from estadisticas_vehiculos('2002-03-01', '2002-03-31')$$, '42501', null,
  'anon no ve las estadísticas');
reset role;

select * from finish();
rollback;
