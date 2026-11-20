begin;
\ir _helpers.psql
select plan(16);

select * from pg_temp.escenario() \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja VTV', 25) returning id as cert \gset

select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 1, 50000, 'transferencia');
reset role;
select pg_temp.como(:'cajero');
select abrir_turno(:caja);
select (registrar_venta(:servicio, 'efectivo')).id as venta \gset
reset role;

-- El cajero no ve costos por ningún camino
select pg_temp.como(:'cajero');
select throws_ok(format('select costo_promedio from certificados where id = %s', :cert), '42501', null,
  'el cajero no lee el costo promedio');
select is((select stock_hojas from certificados where id = :cert), 24, 'pero sí el stock en hojas');
select throws_ok(format('select costo_certificado from ventas where id = %s', :venta), '42501', null,
  'el cajero no lee el costo de su venta');
select is((select precio from ventas where id = :venta), 20000.00::numeric, 'pero sí el precio');
select throws_ok('select * from ventas', '42501', null, 'select * falla: hay que pedir columnas sin costo');
select throws_ok('select * from stock_certificados_valorizado()', '42501', null,
  'el cajero no usa el stock valorizado');
select throws_ok('select * from resumen_diario()', '42501', null, 'el cajero no usa el resumen diario');
reset role;

select hasnt_column('public', 'v_stock_certificados', 'costo_promedio', 'la vista de stock no tiene costo');
select hasnt_column('public', 'v_stock_certificados', 'valor_stock', 'la vista de stock no tiene valuación');
select hasnt_view('public', 'v_resumen_diario', 'el resumen con margen ya no es una vista');

-- El admin los ve solo por las RPC
select pg_temp.como(:'admin');
select throws_ok(format('select costo_promedio from certificados where id = %s', :cert), '42501', null,
  'el admin tampoco lee el costo directo de la tabla');
select is((select costo_promedio from stock_certificados_valorizado() where id = :cert), 2000.00::numeric,
  'el admin ve el costo por la RPC');
select is((select margen_bruto from resumen_diario(fecha_local(now()), fecha_local(now()))), 18000.00::numeric,
  'el admin ve el margen del día');
select is((select count(*)::int from resumen_diario(fecha_local(now()) + 1, null)), 0,
  'el resumen respeta el rango de fechas');
select throws_ok('select * from resumen_diario(current_date, current_date - 1)', '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido');
reset role;

select ok(not has_function_privilege('anon', 'public.stock_certificados_valorizado()', 'execute'),
  'anon no ejecuta el stock valorizado');

select * from finish();
rollback;
