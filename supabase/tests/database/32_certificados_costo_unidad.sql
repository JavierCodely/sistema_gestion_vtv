begin;
\ir _helpers.psql
select plan(22);

select * from pg_temp.escenario() \gset

-- Privilegios: el costo se escribe por columna y no se lee de la tabla ---------------------------------
select ok(has_column_privilege('authenticated', 'public.certificados', 'costo_unidad', 'INSERT'),
  'authenticated puede cargar el costo de la unidad (la RLS lo deja solo al admin)');
select ok(has_column_privilege('authenticated', 'public.certificados', 'costo_unidad', 'UPDATE'),
  'y cambiarlo');
select ok(not has_column_privilege('authenticated', 'public.certificados', 'costo_unidad', 'SELECT'),
  'pero no leerlo de la tabla (costos solo por RPC)');
select ok(not has_column_privilege('authenticated', 'public.certificados', 'costo_promedio', 'UPDATE'),
  'el costo por hoja sigue sin ser editable directo');

-- Validaciones --------------------------------------------------------------------------------------------
select throws_ok($$insert into certificados (nombre, unidad_compra, hojas_por_unidad, costo_unidad)
                   values ('Malo', 'libreta', 25, 0)$$, '23514', null, 'el costo de la unidad es > 0');
select throws_ok($$insert into certificados (nombre, unidad_compra, hojas_por_unidad, costo_unidad)
                   values ('Malo', 'libreta', 25, 'NaN')$$, '23514', null, 'y no NaN');

-- Al crear: costo por hoja = costo de la unidad / hojas ---------------------------------------------------
select pg_temp.como(:'admin');
insert into certificados (nombre, unidad_compra, hojas_por_unidad, costo_unidad)
values ('Libreta B', 'libreta', 25, 3700);
reset role;
select id as cert from certificados where nombre = 'Libreta B' \gset
select is((select costo_promedio from certificados where id = :cert), 148.0000::numeric,
  'libreta de 25 hojas a $ 3.700: $ 148 por hoja');
select is((select count(*)::int from movimientos_certificado where certificado_id = :cert), 0,
  'crearlo no deja movimientos en el kardex');

-- El stock cargado con ajuste se valúa a ese costo ---------------------------------------------------------
select pg_temp.como(:'admin');
select ajustar_stock_certificado(:cert, 300, 'Stock inicial');
select results_eq(
  format('select stock_hojas, costo_promedio, valor_stock, costo_unidad from stock_certificados_valorizado() where id = %s', :cert),
  $$values (300, 148.00::numeric(14,2), 44400.00::numeric(14,2), 3700.00::numeric(12,2))$$,
  '300 hojas a $ 148: el stock vale $ 44.400 (y el admin ve el costo de la unidad)');
reset role;

-- Cambiar el costo revalúa todo el stock y queda en el kardex --------------------------------------------
select pg_temp.como(:'admin');
update certificados set costo_unidad = 4000 where id = :cert;
reset role;
select is((select costo_promedio from certificados where id = :cert), 160.0000::numeric,
  'a $ 4.000 la libreta: $ 160 por hoja');
select results_eq(
  format($$select tipo::text, hojas, costo_unitario, costo_total, stock_resultante, costo_promedio_resultante, nota,
                  usuario_id
           from movimientos_certificado where certificado_id = %s order by id desc limit 1$$, :cert),
  format($$values ('revaluacion', 0, 160.0000::numeric(14,4), 3600.00::numeric(14,2), 300, 160.0000::numeric(14,4),
                   'Costo por libreta: $ 4.000,00 (25 hojas)'::text, %L::uuid)$$, :'admin'),
  'el kardex registra el cambio: 0 hojas, el costo nuevo y cuánto subió el stock (300 × 12)');

-- Editar otros datos no revalúa ---------------------------------------------------------------------------
select pg_temp.como(:'admin');
update certificados set nombre = 'Libreta B nueva', stock_minimo = 10 where id = :cert;
update certificados set costo_unidad = 4000 where id = :cert;
reset role;
select is((select count(*)::int from movimientos_certificado where certificado_id = :cert and tipo = 'revaluacion'), 1,
  'cambiar el nombre o volver a guardar el mismo costo no agrega movimientos');

-- Cambiar las hojas por unidad recalcula ---------------------------------------------------------------
select pg_temp.como(:'admin');
update certificados set hojas_por_unidad = 20 where id = :cert;
reset role;
select is((select costo_promedio from certificados where id = :cert), 200.0000::numeric,
  'con 20 hojas por libreta: $ 200 por hoja');

-- Una venta se valúa al costo vigente --------------------------------------------------------------------
select pg_temp.como(:'admin');
select fijar_destinos_certificado(:cert, false, '{}', array[:servicio]::bigint[]);
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo', 'AB123CD')).id as venta \gset
reset role;
select is((select costo_certificado from ventas where id = :venta), 200.00::numeric,
  'la venta descuenta una hoja a $ 200');

-- Las compras siguen promediando y no tocan el costo de la unidad -----------------------------------------
select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 1, 5000, 'transferencia');
reset role;
-- 299 × 200 + 20 hojas × 250 = 64.800 / 319
select is((select costo_promedio from certificados where id = :cert), round(64800::numeric / 319, 4),
  'la compra recalcula el promedio ponderado');
select is((select costo_unidad from certificados where id = :cert), 4000.00::numeric,
  'y deja el costo de la unidad como estaba');

-- Revaluar después de una compra: la compra ya no se puede corregir ---------------------------------------
select id as compra from compras_certificado where certificado_id = :cert order by id desc limit 1 \gset
select is((select editable from v_compras_certificado where id = :compra), true,
  'la última compra se puede corregir');
select pg_temp.como(:'admin');
update certificados set costo_unidad = 5000 where id = :cert;
reset role;
select is((select costo_promedio from certificados where id = :cert), 250.0000::numeric,
  'el costo nuevo pisa el promedio: $ 250 por hoja');
select is((select editable from v_compras_certificado where id = :compra), false,
  'después de cambiar el costo, la compra ya no se corrige');
select pg_temp.como(:'admin');
select throws_ok(format($$select corregir_compra_certificado(%s, 2, 5000, 'transferencia', null, 'x')$$, :compra),
  'P0001', null, 'corregir_compra_certificado lo rechaza');
reset role;

-- Vaciar el costo no cambia el costo por hoja ---------------------------------------------------------------
select pg_temp.como(:'admin');
update certificados set costo_unidad = null where id = :cert;
reset role;
select is((select costo_promedio from certificados where id = :cert), 250.0000::numeric,
  'sin costo de unidad, el costo por hoja queda como estaba');

-- El cajero no cambia costos ------------------------------------------------------------------------------
select pg_temp.como(:'cajero');
update certificados set costo_unidad = 1 where id = :cert;
reset role;
select is((select costo_unidad from certificados where id = :cert), null::numeric,
  'el cajero no cambia el costo (RLS: 0 filas)');

select * from finish();
rollback;
