begin;
\ir _helpers.psql
select plan(14);

select * from pg_temp.escenario() \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset
insert into certificados (nombre, hojas_por_unidad, stock_minimo) values ('Hoja VTV', 25, 23) returning id as cert \gset

select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 1, 50000, 'transferencia');
select movimiento_efectivo('fondo_inicial', 5000, 'Fondo');
reset role;

select pg_temp.como(:'cajero');
select abrir_turno(:caja);
select (registrar_venta(:servicio, 'efectivo')).id as v1 \gset
select (registrar_venta(:servicio, 'tarjeta')).id as v2 \gset
select (registrar_venta(:servicio, 'transferencia')).id as v3 \gset
select (registrar_gasto(:comida, 1500, 'efectivo', 'Almuerzo')).id as g1 \gset
reset role;
select pg_temp.como(:'admin');
select anular_venta(:v3, 'Error de carga');
reset role;

-- v_movimientos_caja
select pg_temp.como(:'cajero');
select is(
  (select monto from v_movimientos_caja where tipo = 'gasto' and id = :g1),
  -1500.00::numeric, 'los gastos aparecen con monto negativo');
select is(
  (select concepto || ' / ' || detalle from v_movimientos_caja where tipo = 'gasto' and id = :g1),
  'Comida / Comida y refrigerio', 'el gasto muestra subcategoría y rubro');
select is((select anulada from v_movimientos_caja where tipo = 'venta' and id = :v3), true,
  'las ventas anuladas aparecen marcadas');
select is(
  (select sum(monto) from v_movimientos_caja
   where turno_id = (select id from turnos where cerrado_en is null) and not anulada),
  38500.00::numeric, 'neto del turno = ventas − gastos, sin anuladas');

-- v_turnos
select is(
  (select row(ventas_cantidad, ventas_efectivo, ventas_tarjeta, ventas_transferencia, gastos_total, neto, abierto)::text
   from v_turnos where usuario_id = :'cajero'),
  row(2, 20000.00, 20000.00, 0.00, 1500.00, 38500.00, true)::text,
  'v_turnos calcula los totales en vivo');
reset role;

-- resumen_diario() (solo admin; incluye el gasto automático de la compra: $50.000)
select pg_temp.como(:'admin');
select is(
  (select row(cantidad_ventas, total_ventas, total_efectivo, total_tarjeta, total_gastos,
              flujo_neto, costo_certificados, margen_bruto, ventas_sin_stock)::text
   from resumen_diario() where fecha = fecha_local(now())),
  row(2, 40000.00, 20000.00, 20000.00, 51500.00, -11500.00, 4000.00, 36000.00, 0)::text,
  'resumen diario: ventas, medios, gastos, flujo neto y margen bruto');

-- stock_certificados_valorizado() (solo admin)
select is(
  (select row(stock_hojas, costo_promedio, valor_stock, semaforo, aplica_a)::text
   from stock_certificados_valorizado() where id = :cert),
  row(22, 2000.00, 44000.00, 'bajo', 'Todos los servicios')::text,
  'stock, costo, valor y semáforo del certificado (admin)');
reset role;

-- v_stock_certificados (todos, sin costos)
select pg_temp.como(:'cajero');
select is(
  (select row(stock_hojas, semaforo, aplica_a)::text from v_stock_certificados where id = :cert),
  row(22, 'bajo', 'Todos los servicios')::text,
  'el cajero ve stock y semáforo');
reset role;

-- v_gastos_por_categoria
select is(
  (select total from v_gastos_por_categoria where categoria = 'Comida' and fecha = fecha_local(now())),
  1500.00::numeric, 'resumen de gastos por categoría');

-- Alertas
select is((select count(*)::int from alertas where not leida), 1, 'hay una alerta de stock bajo pendiente');

select pg_temp.como(:'cajero');
select is((select count(*)::int from alertas), 0, 'un cajero no ve alertas');
select throws_ok('select marcar_alertas_leidas()', '42501', null, 'un cajero no marca alertas');
reset role;

select pg_temp.como(:'admin');
select is(marcar_alertas_leidas(), 1, 'el admin marca todas como leídas');
reset role;

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'alertas'),
  'las alertas se publican en Realtime');

select * from finish();
rollback;
