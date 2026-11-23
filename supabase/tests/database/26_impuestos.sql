-- Migración 36: impuestos (catálogo, foto por venta con prorrateo por medio y reporte).
begin;
\ir _helpers.psql
select plan(40);

select * from pg_temp.escenario() \gset
select categoria_id as cat from servicios where id = :servicio \gset
insert into servicios (categoria_id, nombre, precio) values (:cat, 'Servicio Dos', 30000) returning id as serv2 \gset
insert into cajas (nombre) values ('Caja Impuestos') returning id as caja2 \gset

-- Privilegios ---------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.fijar_servicios_impuesto(bigint, boolean, bigint[])', 'execute')
  and has_function_privilege('authenticated', 'public.resumen_impuestos(date, date, bigint)', 'execute'),
  'authenticated ejecuta las RPC de impuestos (el control es _exigir_admin)');
select ok(not has_function_privilege('anon', 'public.fijar_servicios_impuesto(bigint, boolean, bigint[])', 'execute')
  and not has_function_privilege('anon', 'public.resumen_impuestos(date, date, bigint)', 'execute'),
  'anon no ejecuta las RPC de impuestos');
select ok(not has_function_privilege('authenticated', 'public._calcular_impuestos_venta(bigint)', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_impuestos_de_pagos()', 'execute'),
  'el cálculo y el trigger son internos');
select ok(not has_table_privilege('authenticated', 'public.venta_impuestos', 'insert')
  and not has_table_privilege('authenticated', 'public.venta_impuestos', 'update')
  and not has_table_privilege('authenticated', 'public.impuesto_servicios', 'insert')
  and not has_column_privilege('authenticated', 'public.impuestos', 'todos_servicios', 'update'),
  'la foto y los servicios alcanzados no se escriben directo');

-- Catálogo (admin) ----------------------------------------------------------------------------------
select pg_temp.como(:'admin');
insert into impuestos (nombre, tipo, valor) values ('  Ingresos   brutos ', 'porcentaje', 3) returning id as imp_a \gset
select is((select nombre from impuestos where id = :imp_a), 'Ingresos brutos', 'el nombre se normaliza');
select is((select medios::text from impuestos where id = :imp_a), '{efectivo,transferencia,tarjeta}',
  'por defecto alcanza a todos los medios');
insert into impuestos (nombre, tipo, valor, medios) values ('Tasa tarjeta', 'monto_fijo', 150, '{tarjeta}') returning id as imp_b \gset
insert into impuestos (nombre, tipo, valor) values ('Fijo servicio dos', 'monto_fijo', 100) returning id as imp_f \gset
insert into impuestos (nombre, tipo, valor, activo) values ('Inactivo', 'porcentaje', 5, false) returning id as imp_d \gset
insert into impuestos (nombre, tipo, valor) values ('Sin uso', 'porcentaje', 1) returning id as imp_e \gset

select throws_ok($$insert into impuestos (nombre, tipo, valor) values ('INGRESOS BRUTOS', 'porcentaje', 2)$$,
  '23505', null, 'nombre repetido sin distinguir mayúsculas');
select throws_ok($$insert into impuestos (nombre, tipo, valor) values ('Cien', 'porcentaje', 100)$$,
  '23514', null, 'un porcentaje es menor a 100');
select throws_ok($$insert into impuestos (nombre, tipo, valor) values ('Cero', 'monto_fijo', 0)$$,
  '23514', null, 'el valor es mayor a 0');
select throws_ok($$insert into impuestos (nombre, tipo, valor) values ('NaN', 'monto_fijo', 'NaN')$$,
  '23514', null, 'el valor no puede ser NaN');
select throws_ok($$insert into impuestos (nombre, tipo, valor, medios) values ('Sin medios', 'porcentaje', 1, '{}')$$,
  '23514', null, 'al menos un medio de pago');
select throws_ok($$insert into impuestos (nombre, tipo, valor, medios) values ('Repetidos', 'porcentaje', 1, '{tarjeta,tarjeta}')$$,
  '23514', null, 'sin medios repetidos');

-- Servicios alcanzados
select is((fijar_servicios_impuesto(:imp_a, true, null)).todos_servicios, true, 'A: todos los servicios');
select fijar_servicios_impuesto(:imp_b, false, array[:servicio]);
select fijar_servicios_impuesto(:imp_f, false, array[:serv2, :serv2]);
select fijar_servicios_impuesto(:imp_d, true, null);
select is((select array_agg(servicio_id) from impuesto_servicios where impuesto_id = :imp_f), array[:serv2::bigint],
  'la lista se guarda sin repetidos');
select fijar_servicios_impuesto(:imp_e, false, array[:serv2]);
select fijar_servicios_impuesto(:imp_e, true, null);
select is((select count(*)::int from impuesto_servicios where impuesto_id = :imp_e), 0,
  'pasar a "todos" vacía la lista');
select throws_ok(format('select fijar_servicios_impuesto(%s, false, null)', :imp_e), '22023',
  'Indicá los servicios del impuesto (la lista puede estar vacía)', 'sin "todos" hace falta la lista');
select throws_ok('select fijar_servicios_impuesto(0, true, null)', '22023', 'El impuesto no existe', 'impuesto inexistente');
select throws_ok(format('select fijar_servicios_impuesto(%s, false, array[0])', :imp_e), '22023',
  'Hay un servicio que no existe en la lista', 'servicio inexistente');
select fijar_servicios_impuesto(:imp_e, false, '{}');
reset role;

-- El cajero no ve ni toca impuestos -----------------------------------------------------------------
select pg_temp.como(:'cajero');
select is((select count(*)::int from impuestos) + (select count(*)::int from impuesto_servicios), 0,
  'el cajero no lee impuestos');
select throws_ok($$insert into impuestos (nombre, tipo, valor) values ('X', 'porcentaje', 1)$$,
  '42501', null, 'el cajero no crea impuestos');
select throws_ok(format('select fijar_servicios_impuesto(%s, true, null)', :imp_a), '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no fija servicios');
select throws_ok('select * from resumen_impuestos()', '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no ve el reporte');
reset role;

-- Ventas del cajero ---------------------------------------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$)).id as v1 \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$)).id as v2 \gset
select (registrar_venta(:turno, :servicio, p_pagos =>
  '[{"medio":"efectivo","monto":5000},{"medio":"tarjeta","monto":15000}]', p_patente => $p$AB123CD$p$)).id as v3 \gset
select (registrar_venta(:turno, :serv2, p_pagos =>
  '[{"medio":"efectivo","monto":10000},{"medio":"transferencia","monto":10000},{"medio":"tarjeta","monto":10000}]', p_patente => $p$AB123CD$p$)).id as v5 \gset
select (registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$)).id as v7 \gset
select is((select count(*)::int from venta_impuestos), 0, 'el cajero no lee la foto de impuestos');
reset role;

select is((select array_agg(row(impuesto_id, medio::text, base, monto)::text order by impuesto_id, medio)
           from venta_impuestos where venta_id = :v1),
  array[row(:imp_a, 'efectivo', 20000.00, 600.00)::text],
  'efectivo: solo el 3 % (la tasa es de tarjeta y el inactivo no cuenta)');
select is((select array_agg(row(impuesto_id, medio::text, monto)::text order by impuesto_id, medio)
           from venta_impuestos where venta_id = :v2),
  array[row(:imp_a, 'tarjeta', 600.00)::text, row(:imp_b, 'tarjeta', 150.00)::text],
  'tarjeta: 3 % y la tasa fija de $ 150 por venta');
select is((select array_agg(row(impuesto_id, medio::text, base, monto)::text order by impuesto_id, medio)
           from venta_impuestos where venta_id = :v3),
  array[row(:imp_a, 'efectivo', 5000.00, 150.00)::text, row(:imp_a, 'tarjeta', 15000.00, 450.00)::text,
        row(:imp_b, 'tarjeta', 15000.00, 112.50)::text],
  'pago mixto: el 3 % se reparte por medio y el fijo de tarjeta se prorratea (150 × 15.000 / 20.000)');
select is((select array_agg(row(impuesto_id, medio::text, monto)::text order by impuesto_id, medio)
           from venta_impuestos where venta_id = :v5),
  array[row(:imp_a, 'efectivo', 300.00)::text, row(:imp_a, 'transferencia', 300.00)::text,
        row(:imp_a, 'tarjeta', 300.00)::text, row(:imp_f, 'efectivo', 33.34)::text,
        row(:imp_f, 'transferencia', 33.33)::text, row(:imp_f, 'tarjeta', 33.33)::text],
  'el redondeo del reparto queda en una parte: $ 100 en tres medios = 33,34 + 33,33 + 33,33');
select is((select impuesto_nombre || ' ' || tipo || ' ' || valor from venta_impuestos
           where venta_id = :v2 and impuesto_id = :imp_b),
  'Tasa tarjeta monto_fijo 150.00', 'la foto guarda nombre, tipo y valor');

-- Admin: anula una venta, cambia el impuesto y carga una venta con fecha pasada -------------------
select pg_temp.como(:'admin');
select anular_venta(:v7, 'Prueba');
update impuestos set valor = 5, nombre = 'IIBB' where id = :imp_a;
select is((select monto from venta_impuestos where venta_id = :v1), 600.00,
  'cambiar el impuesto no cambia la foto de las ventas anteriores');
select (registrar_venta_pasada('2026-01-15', '10:00', :caja, :servicio, 'transferencia', 20000)).id as v6 \gset
select is((select array_agg(row(impuesto_id, medio::text, monto)::text) from venta_impuestos where venta_id = :v6),
  array[row(:imp_a, 'transferencia', 1000.00)::text], 'las ventas con fecha pasada también llevan impuestos');
select throws_ok(format('delete from impuestos where id = %s', :imp_a), '23503', null,
  'un impuesto usado no se borra');
select lives_ok(format('delete from impuestos where id = %s', :imp_e), 'uno sin uso se borra');
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja2, 100) as turno_x \gset
reset role;
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$)).id as v8 \gset
reset role;
select is((select monto from venta_impuestos where venta_id = :v8 and impuesto_id = :imp_a), 1000.00,
  'una venta nueva usa el valor actual (5 %)');

-- Reporte -------------------------------------------------------------------------------------------
select pg_temp.como(:'admin');
select is(
  (select array_agg(row(agrupacion, nombre, cantidad_ventas, total, total_efectivo, total_transferencia, total_tarjeta)::text
                    order by agrupacion = 'impuesto', total desc)
   from resumen_impuestos(fecha_local(now()), fecha_local(now()))),
  array[
    row('total', 'Total', 5, 4062.50, 2083.34, 333.33, 1645.83)::text,
    row('impuesto', 'IIBB', 5, 3700.00, 2050.00, 300.00, 1350.00)::text,
    row('impuesto', 'Tasa tarjeta', 2, 262.50, 0.00, 0.00, 262.50)::text,
    row('impuesto', 'Fijo servicio dos', 1, 100.00, 33.34, 33.33, 33.33)::text
  ],
  'hoy: total y por impuesto (nombre actual), por medio, sin la venta anulada ni la de fecha pasada');
select is((select total from resumen_impuestos('2026-01-01', '2026-12-31') where agrupacion = 'total'), 5062.50,
  'el año suma también la venta con fecha pasada de enero');
select is((select row(cantidad_ventas, total_transferencia)::text from resumen_impuestos('2026-01-01', '2026-01-31')
           where agrupacion = 'total'),
  row(1, 1000.00)::text, 'enero: solo la venta con fecha pasada');
select is((select total from resumen_impuestos(p_turno_id => :turno) where agrupacion = 'total'), 4062.50,
  'por turno: las ventas de ese turno (la de fecha pasada no tiene turno)');
select is((select row(cantidad_ventas, total)::text from resumen_impuestos(p_turno_id => :turno_x)
           where agrupacion = 'total'),
  row(0, 0.00)::text, 'un turno sin ventas con impuestos: la fila total en 0');
select is((select count(*)::int from resumen_impuestos('2000-01-01', '2000-01-31')), 1,
  'sin ventas en el período: solo la fila total');
select throws_ok($$select * from resumen_impuestos('2026-02-01', '2026-01-01')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido');
reset role;

select * from finish();
rollback;
