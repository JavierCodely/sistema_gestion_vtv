-- Migración 35: ventas en tiempo real (fecha_apertura, resumen_turnos y publicación de Realtime).
begin;
\ir _helpers.psql
select plan(17);

select * from pg_temp.escenario() \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset

-- Privilegios ---------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.resumen_turnos(date, date)', 'execute'),
  'authenticated ejecuta resumen_turnos (el control es _exigir_admin)');
select ok(not has_function_privilege('anon', 'public.resumen_turnos(date, date)', 'execute'),
  'anon no ejecuta resumen_turnos');

-- Realtime ------------------------------------------------------------------------------------------
select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['alertas', 'comprobantes', 'gastos', 'turnos', 'venta_pagos', 'ventas'],
  'Realtime publica alertas, comprobantes, gastos, turnos, venta_pagos y ventas');
-- Realtime solo envía las columnas con SELECT del suscriptor: los costos no tienen grant.
select ok(not has_column_privilege('authenticated', 'public.ventas', 'costo_certificado', 'select'),
  'el costo de la venta no es legible, así que Realtime no lo envía');

-- Punto de partida (admin) --------------------------------------------------------------------------
select pg_temp.como(:'admin');
select * from resumen_turnos(fecha_local(now()), fecha_local(now())) \gset h0_
select * from resumen_turnos() \gset t0_
reset role;

-- Un turno con ventas (una mixta, una anulada) y un gasto -------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo')).id as v1 \gset
select (registrar_venta(:turno, :servicio, p_pagos =>
  '[{"medio":"transferencia","monto":5000},{"medio":"tarjeta","monto":15000}]')).id as v2 \gset
select (registrar_venta(:turno, :servicio, 'transferencia')).id as v3 \gset
select (registrar_gasto(:comida, 30, 'efectivo', 'Café', :turno)).id as g1 \gset

-- El cajero no ve los totales
select throws_ok('select * from resumen_turnos()', '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve resumen_turnos');
reset role;

select pg_temp.como(:'admin');
select anular_venta(:v3, 'Prueba de anulación');

select is((select fecha_apertura from v_turnos where id = :turno),
  (select fecha_local(abierto_en) from turnos where id = :turno),
  'v_turnos.fecha_apertura es el día de negocio de la apertura');

select * from resumen_turnos(fecha_local(now()), fecha_local(now())) \gset h1_
select is((:h1_cantidad_turnos - :h0_cantidad_turnos)::numeric, 1::numeric, 'suma el turno abierto hoy');
select is((:h1_turnos_abiertos - :h0_turnos_abiertos)::numeric, 1::numeric, 'cuenta los turnos abiertos');
select is((:h1_ventas_cantidad - :h0_ventas_cantidad)::numeric, 2::numeric, 'cuenta las ventas sin anuladas');
select is((:h1_ventas_efectivo - :h0_ventas_efectivo)::numeric, 20000.00, 'efectivo de las ventas');
select is((:h1_ventas_transferencia - :h0_ventas_transferencia)::numeric, 5000.00,
  'transferencia: la parte del pago mixto, sin la venta anulada');
select is((:h1_ventas_tarjeta - :h0_ventas_tarjeta)::numeric, 15000.00, 'tarjeta: la parte del pago mixto');
select is((:h1_ventas_total - :h0_ventas_total)::numeric, 40000.00, 'total de ventas sin anuladas');
select is((:h1_gastos_total - :h0_gastos_total)::numeric, 30.00, 'gastos del turno');
select is((:h1_neto - :h0_neto)::numeric, 39970.00, 'neto = ventas − gastos');

-- Fuera del rango no suma; rango invertido se rechaza
select is((select cantidad_turnos from resumen_turnos('2000-01-01', '2000-01-31')), 0::bigint,
  'un rango sin aperturas da 0 turnos');
select throws_ok($$select * from resumen_turnos('2026-02-01', '2026-01-01')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido');
reset role;

select * from finish();
rollback;
