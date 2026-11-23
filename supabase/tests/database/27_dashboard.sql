-- Migración 37: dashboard del admin (ventas por día, servicios/categorías/descuentos y gastos).
-- Los datos de prueba se mueven a marzo de 2001 para no mezclarse con otros (seed incluido).
begin;
\ir _helpers.psql
select plan(27);

select * from pg_temp.escenario() \gset
insert into categorias_servicio (nombre) values ('Motos test') returning id as cat_motos \gset
insert into servicios (categoria_id, nombre, precio) values (:cat_motos, 'VTV moto test', 10000) returning id as moto \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja dashboard', 10) returning id as cert \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset
select id as luz from categorias_gasto where nombre = 'Luz' \gset

-- Privilegios -------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.ventas_por_dia(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.resumen_dashboard(date, date, bigint)', 'execute')
  and has_function_privilege('authenticated', 'public.resumen_gastos(date, date, bigint)', 'execute'),
  'authenticated ejecuta las RPC del dashboard (el control es _exigir_admin)');
select ok(not has_function_privilege('anon', 'public.ventas_por_dia(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.resumen_dashboard(date, date, bigint)', 'execute')
  and not has_function_privilege('anon', 'public.resumen_gastos(date, date, bigint)', 'execute')
  and not has_function_privilege('authenticated', 'public._validar_rango_reporte(date, date)', 'execute'),
  'anon no las ejecuta y la validación del rango es interna');

-- Datos: un turno con ventas (una con descuento, una anulada) y gastos ----------------------------
select pg_temp.como(:'admin');
insert into descuentos (nombre, tipo, valor) values ('Jubilados test', 'porcentaje', 10) returning id as desc_j \gset
select fijar_servicios_descuento(:desc_j, array[:servicio]);
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo')).id as v1 \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', p_descuento_id => :desc_j)).id as v2 \gset
select (registrar_venta(:turno, :moto, 'transferencia')).id as v3 \gset
select (registrar_venta(:turno, :moto, 'efectivo')).id as v4 \gset
select (registrar_gasto(:comida, 1500, 'efectivo', 'Almuerzo', :turno)).id as g1 \gset
reset role;
select pg_temp.como(:'admin');
select anular_venta(:v4, 'Prueba');
select (registrar_gasto(:luz, 8000, 'transferencia', 'Luz del mes')).id as g2 \gset
select (registrar_gasto(:comida, 700, 'transferencia', 'Café')).id as g3 \gset
select anular_gasto(:g3, 'Prueba');
select (registrar_compra_certificado(:cert, 2, 5000, 'transferencia')).gasto_id as g4 \gset
-- Venta con fecha pasada (sin turno) un día después
select (registrar_venta_pasada('2001-03-06', '10:00', :caja, :moto, 'efectivo', 12000)).id as v5 \gset
reset role;

-- Todo al lunes 5 de marzo de 2001 (hora AR), salvo la venta pasada (martes 6)
update ventas set creado_en = '2001-03-05 12:00-03' where id in (:v1, :v2, :v3, :v4);
update gastos set creado_en = '2001-03-05 13:00-03' where id in (:g1, :g2, :g3, :g4);

-- El cajero no ve el dashboard ----------------------------------------------------------------------
select pg_temp.como(:'cajero');
select throws_ok($$select * from ventas_por_dia('2001-03-05', '2001-03-11')$$, '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve ventas por día');
select throws_ok('select * from resumen_dashboard()', '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve el resumen de ventas');
select throws_ok('select * from resumen_gastos()', '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve el resumen de gastos');
reset role;

select pg_temp.como(:'admin');

-- Ventas por día ------------------------------------------------------------------------------------
select results_eq(
  $$select fecha, cantidad::int, total from ventas_por_dia('2001-03-05', '2001-03-11')$$,
  $$values ('2001-03-05'::date, 3, 48000.00::numeric), ('2001-03-06', 1, 12000.00),
           ('2001-03-07', 0, 0.00), ('2001-03-08', 0, 0.00), ('2001-03-09', 0, 0.00),
           ('2001-03-10', 0, 0.00), ('2001-03-11', 0, 0.00)$$,
  'un día por fila (los vacíos en 0), sin anuladas y con la venta pasada en su fecha');
select is(
  (select count(*)::int from ventas_por_dia(public.fecha_local(now()) - 1, public.fecha_local(now()) + 5)),
  2, 'los días que todavía no llegaron no vienen (ayer y hoy)');
select throws_ok($$select * from ventas_por_dia(null, '2001-03-11')$$, '22023',
  'Indicá las fechas desde y hasta', 'hacen falta las dos fechas');
select throws_ok($$select * from ventas_por_dia('2001-03-11', '2001-03-05')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'desde después de hasta');
select throws_ok($$select * from ventas_por_dia('2000-01-01', '2001-03-05')$$, '22023',
  'El rango no puede superar un año', 'máximo un año');

-- Resumen de ventas: período -------------------------------------------------------------------------
select results_eq(
  $$select nombre, cantidad::int, total, total_descontado
    from resumen_dashboard('2001-03-01', '2001-03-31') where agrupacion = 'total'$$,
  $$values ('Total', 4, 60000.00::numeric, 2000.00::numeric)$$,
  'total del mes: 4 ventas (sin la anulada) con lo descontado');
select results_eq(
  $$select nombre, cantidad::int, total
    from resumen_dashboard('2001-03-01', '2001-03-31') where agrupacion = 'servicio'$$,
  $$values ('Servicio Test', 2, 38000.00::numeric), ('VTV moto test', 2, 22000.00)$$,
  'por servicio, del más vendido al menos (cantidad y después total)');
select results_eq(
  $$select nombre, cantidad::int, total
    from resumen_dashboard('2001-03-01', '2001-03-31') where agrupacion = 'categoria'$$,
  $$values ('Categoría Test', 2, 38000.00::numeric), ('Motos test', 2, 22000.00)$$,
  'por categoría');
select results_eq(
  $$select id, nombre, cantidad::int, total, total_descontado
    from resumen_dashboard('2001-03-01', '2001-03-31') where agrupacion = 'descuento'$$,
  format($$values (%s::bigint, 'Jubilados test', 1, 18000.00::numeric, 2000.00::numeric)$$, :desc_j),
  'por descuento: cuántas ventas, lo cobrado y lo descontado');
select is(
  (select array_agg(agrupacion order by agrupacion) from (select distinct agrupacion from resumen_dashboard('2001-03-01', '2001-03-31')) a),
  array['categoria', 'descuento', 'servicio', 'total'], 'las cuatro agrupaciones');

-- Resumen de ventas: turno y período vacío ---------------------------------------------------------
select results_eq(
  format($$select cantidad::int, total from resumen_dashboard(p_turno_id => %s) where agrupacion = 'total'$$, :turno),
  $$values (3, 48000.00::numeric)$$, 'por turno: sin la venta pasada ni la anulada');
select results_eq(
  $$select agrupacion, cantidad::int, total, total_descontado from resumen_dashboard('2001-04-01', '2001-04-30')$$,
  $$values ('total', 0, 0.00::numeric, 0.00::numeric)$$,
  'período sin ventas: solo el total en 0');
select throws_ok($$select * from resumen_dashboard('2001-03-31', '2001-03-01')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido');

-- Gastos ------------------------------------------------------------------------------------------
select results_eq(
  $$select agrupacion, nombre, cantidad::int, total from resumen_gastos('2001-03-01', '2001-03-31')
    where agrupacion in ('total', 'compra_certificados', 'otros_gastos')$$,
  $$values ('total', 'Total', 3, 19500.00::numeric),
           ('compra_certificados', 'Compra de certificados', 1, 10000.00),
           ('otros_gastos', 'Otros gastos', 2, 9500.00)$$,
  'total, compras de certificados (su gasto automático) y otros gastos, sin anulados');
select results_eq(
  $$select nombre, cantidad::int, total from resumen_gastos('2001-03-01', '2001-03-31') where agrupacion = 'rubro'$$,
  $$values ('Insumos', 1, 10000.00::numeric), ('Servicios', 1, 8000.00), ('Comida y refrigerio', 1, 1500.00)$$,
  'por rubro, de mayor a menor');
select results_eq(
  $$select nombre, total from resumen_gastos('2001-03-01', '2001-03-31') where agrupacion = 'subcategoria'$$,
  $$values ('Insumos › Compra de certificados', 10000.00::numeric), ('Servicios › Luz', 8000.00),
           ('Comida y refrigerio › Comida', 1500.00)$$,
  'por subcategoría con su rubro');
select results_eq(
  format($$select agrupacion, cantidad::int, total from resumen_gastos(p_turno_id => %s)
           where agrupacion in ('total', 'compra_certificados', 'otros_gastos')$$, :turno),
  $$values ('total', 1, 1500.00::numeric), ('compra_certificados', 0, 0.00), ('otros_gastos', 1, 1500.00)$$,
  'por turno: solo los gastos del cajón (las compras nunca tienen turno)');
select results_eq(
  $$select agrupacion, cantidad::int, total from resumen_gastos('2001-04-01', '2001-04-30')$$,
  $$values ('total', 0, 0.00::numeric), ('compra_certificados', 0, 0.00), ('otros_gastos', 0, 0.00)$$,
  'período sin gastos: total y tipos en 0');
select throws_ok($$select * from resumen_gastos('2001-03-31', '2001-03-01')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido en gastos');
reset role;

-- Usuario desactivado -------------------------------------------------------------------------------
update perfiles set activo = false where id = :'admin';
select pg_temp.como(:'admin');
select throws_ok('select * from resumen_dashboard()', '42501', null, 'un admin desactivado no ve el dashboard');
select throws_ok('select * from resumen_gastos()', '42501', null, 'ni los gastos');
reset role;
select pg_temp.como_anonimo();
select throws_ok('select * from resumen_gastos()', '42501', null, 'anon no ejecuta');
reset role;

select * from finish();
rollback;
