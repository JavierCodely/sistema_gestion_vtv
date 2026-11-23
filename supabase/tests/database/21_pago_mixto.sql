-- Migración 30: pago mixto (una venta cobrada con más de un medio de pago).
begin;
\ir _helpers.psql
select plan(52);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('cajero2@test.local') as cajero2 \gset
insert into cajas (nombre) values ('Caja Test 3') returning id as caja3 \gset

-- Firma y permisos de la RPC ------------------------------------------------------------------------
select ok(has_function_privilege('authenticated',
  'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric)', 'execute'),
  'authenticated puede vender (con o sin pago mixto)');
select ok(not has_function_privilege('anon',
  'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric)', 'execute'),
  'anon no puede vender');
select is((select count(*)::int from pg_proc where proname = 'registrar_venta' and pronamespace = 'public'::regnamespace),
  1, 'no quedan sobrecargas de registrar_venta');
select ok(not has_function_privilege('authenticated', 'public._validar_pagos_mixtos(jsonb)', 'execute'),
  '_validar_pagos_mixtos es interna');

-- Camino feliz: cajero con turno, efectivo + tarjeta -----------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, p_patente => 'ab 123 cd',
          p_pagos => '[{"medio":"efectivo","monto":5000},{"medio":"tarjeta","monto":"15000"}]')).id as mixta \gset
select is((select row(precio, medio_pago::text, patente)::text from ventas where id = :mixta),
  row(20000.00, null::text, 'AB123CD')::text, 'la venta mixta guarda el precio y el medio en NULL');
select is((select array_agg(row(medio::text, monto)::text order by medio) from venta_pagos where venta_id = :mixta),
  array[row('efectivo', 5000.00)::text, row('tarjeta', 15000.00)::text],
  'una fila de pago por medio');

-- Un solo medio: igual que siempre, con su fila en venta_pagos
select (registrar_venta(:turno, :servicio, 'transferencia')).id as simple \gset
select is((select row(medio_pago::text)::text from ventas where id = :simple),
  row('transferencia')::text, 'la llamada de un solo medio sigue funcionando');
select is((select array_agg(row(medio::text, monto)::text) from venta_pagos where venta_id = :simple),
  array[row('transferencia', 20000.00)::text], 'el pago simple tiene una fila con todo el precio');

-- Tres medios
select (registrar_venta(:turno, :servicio, p_pagos =>
  '[{"medio":"efectivo","monto":1000},{"medio":"transferencia","monto":9000},{"medio":"tarjeta","monto":10000}]')).id as triple \gset
select is((select count(*)::int from venta_pagos where venta_id = :triple), 3, 'se puede pagar con los tres medios');

-- Validaciones --------------------------------------------------------------------------------------
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":4000},{"medio":"tarjeta","monto":15000}]')$$, :turno, :servicio),
  '22023', 'Las partes del pago suman $ 19.000,00 y el precio es $ 20.000,00: tienen que coincidir',
  'la suma de las partes tiene que ser el precio');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":10000},{"medio":"tarjeta","monto":15000}]')$$, :turno, :servicio),
  '22023', 'Las partes del pago suman $ 25.000,00 y el precio es $ 20.000,00: tienen que coincidir',
  'tampoco puede pasarse del precio');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":10000},{"medio":"efectivo","monto":10000}]')$$, :turno, :servicio),
  '22023', 'No repitas un medio de pago en el pago mixto (efectivo aparece dos veces)', 'medios repetidos');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":20000},{"medio":"tarjeta","monto":0}]')$$, :turno, :servicio),
  '22023', 'El monto en tarjeta debe ser mayor a cero', 'una parte en cero');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":25000},{"medio":"tarjeta","monto":-5000}]')$$, :turno, :servicio),
  '22023', 'El monto en tarjeta debe ser mayor a cero', 'una parte negativa');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":"NaN"},{"medio":"tarjeta","monto":20000}]')$$, :turno, :servicio),
  '22023', 'El monto en efectivo no es válido', 'NaN no es un monto');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":"abc"},{"medio":"tarjeta","monto":20000}]')$$, :turno, :servicio),
  '22023', 'El monto en efectivo no es válido', 'un texto no es un monto');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":true},{"medio":"tarjeta","monto":20000}]')$$, :turno, :servicio),
  '22023', 'El monto en efectivo no es válido', 'un booleano no es un monto');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo"},{"medio":"tarjeta","monto":20000}]')$$, :turno, :servicio),
  '22023', 'El monto en efectivo no es válido', 'falta el monto');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":0.001},{"medio":"tarjeta","monto":19999.999}]')$$, :turno, :servicio),
  '22023', 'El monto en efectivo no puede tener más de 2 decimales', 'más de 2 decimales');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"cheque","monto":10000},{"medio":"tarjeta","monto":10000}]')$$, :turno, :servicio),
  '22023', 'El medio de pago "cheque" no es válido', 'medio inexistente');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"monto":10000},{"medio":"tarjeta","monto":10000}]')$$, :turno, :servicio),
  '22023', 'Elegí el medio de pago de cada parte', 'parte sin medio');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":20000}]')$$, :turno, :servicio),
  '22023', 'Un pago mixto necesita al menos dos medios de pago distintos (si pagó con uno solo, elegí ese medio)',
  'una sola parte no es pago mixto');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '{"medio":"efectivo","monto":20000}')$$, :turno, :servicio),
  '22023', 'El pago mixto no es válido', 'p_pagos tiene que ser una lista');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[1, 2]')$$, :turno, :servicio),
  '22023', 'El pago mixto no es válido', 'cada parte tiene que ser un objeto');
select throws_ok(format($$select registrar_venta(%s, %s, 'efectivo', p_pagos => '[{"medio":"efectivo","monto":10000},{"medio":"tarjeta","monto":10000}]')$$, :turno, :servicio),
  '22023', 'Elegí un medio de pago o un pago mixto, no los dos', 'medio y pago mixto a la vez');
select throws_ok(format($$select registrar_venta(%s, %s)$$, :turno, :servicio),
  '22023', 'Elegí un medio de pago', 'sin medio ni pago mixto');
select is((select count(*)::int from ventas where turno_id = :turno), 3, 'los intentos rechazados no dejan ventas');

-- Coherencia ventas ↔ venta_pagos (trigger diferido) -----------------------------------------------
select lives_ok('set constraints all immediate', 'las ventas de las RPC quedan coherentes con sus pagos');
set constraints all deferred;
reset role;
select throws_ok(format($q$do $x$ begin
    insert into venta_pagos (venta_id, medio, monto) values (%s, 'transferencia', 1);
    set constraints all immediate;
  end $x$$q$, :mixta),
  'P0001', format('El cobro de la venta #%s no coincide con su precio y medio de pago', :mixta),
  'la base rechaza pagos que no suman el precio');
select throws_ok(format($q$do $x$ begin
    update ventas set medio_pago = 'efectivo' where id = %s;
    set constraints all immediate;
  end $x$$q$, :mixta),
  'P0001', format('El cobro de la venta #%s no coincide con su precio y medio de pago', :mixta),
  'una venta mixta no puede quedar con un solo medio');
set constraints all deferred;

-- Efectivo del cajón y totales en vivo --------------------------------------------------------------
select is((select row(efectivo_en_caja, ventas_efectivo, ventas_transferencia, ventas_tarjeta, ventas_total, ventas_cantidad)::text
           from v_turnos where id = :turno),
  row(6100.00, 6000.00, 29000.00, 25000.00, 60000.00, 3)::text,
  'v_turnos reparte cada venta por sus partes y solo el efectivo entra al cajón');
select is(public._efectivo_en_caja(:turno), 6100.00::numeric, '_efectivo_en_caja suma solo la parte en efectivo');

select is((select row(medio, monto, pagos)::text from v_movimientos_caja where tipo = 'venta' and id = :mixta),
  row('mixto', 20000.00, '[{"medio": "efectivo", "monto": 5000.00}, {"medio": "tarjeta", "monto": 15000.00}]'::jsonb)::text,
  'v_movimientos_caja muestra "mixto" con el detalle de los pagos');
select is((select row(medio, pagos)::text from v_movimientos_caja where tipo = 'venta' and id = :simple),
  row('transferencia', '[{"medio": "transferencia", "monto": 20000.00}]'::jsonb)::text,
  'una venta simple muestra su medio');

-- Resumen diario (admin) ----------------------------------------------------------------------------
select pg_temp.como(:'admin');
select is((select row(cantidad_ventas, total_ventas, total_efectivo, total_transferencia, total_tarjeta)::text
           from resumen_diario(fecha_local(now()), fecha_local(now()))),
  row(3, 60000.00, 6000.00, 29000.00, 25000.00)::text, 'resumen_diario reparte por las partes de cada venta');

-- Anular con el turno abierto: solo la parte en efectivo sale del cajón -----------------------------
select anular_venta(:mixta, 'Error de carga');
reset role;
select is((select efectivo_en_caja from v_turnos where id = :turno), 1100.00::numeric,
  'anular una venta mixta con el turno abierto saca solo su efectivo del cajón');
select is((select count(*)::int from movimientos_efectivo where venta_id = :mixta), 0,
  'con el turno abierto no toca la caja de cambio');

-- Cierre: fotos por medio desde los pagos -----------------------------------------------------------
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
reset role;
select is((select row(cantidad_ventas, total_efectivo, total_transferencia, total_tarjeta, efectivo_cierre)::text
           from turnos where id = :turno),
  row(2, 1000.00, 29000.00, 10000.00, 1100.00)::text, 'las fotos del cierre reparten por las partes');
select is((select monto from movimientos_efectivo where turno_id = :turno and tipo = 'cierre_turno'), 1100.00::numeric,
  'al cerrar vuelve a la caja de cambio solo el efectivo');

-- Anular con el turno cerrado: la parte en efectivo sale de la caja de cambio -----------------------
select saldo as saldo_antes from caja_efectivo \gset
select pg_temp.como(:'admin');
select anular_venta(:triple, 'Cliente devolvió');
reset role;
select is((select row(tipo::text, monto)::text from movimientos_efectivo where venta_id = :triple),
  row('anulacion_venta', -1000.00)::text, 'con el turno cerrado sale de la caja de cambio solo la parte en efectivo');
select is((select saldo from caja_efectivo), :saldo_antes::numeric - 1000, 'el saldo de la caja de cambio baja eso');

-- El admin atendiendo una caja también cobra mixto ---------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'admin', :caja3, 100) as turno_admin \gset
select lives_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"transferencia","monto":12000},{"medio":"efectivo","monto":8000}]')$$, :turno_admin, :servicio),
  'el admin atendiendo una caja cobra con pago mixto');
-- Anular sin efectivo suficiente en el cajón: el mensaje muestra el cajón en formato argentino
select (registrar_venta(:turno_admin, :servicio, p_pagos => '[{"medio":"efectivo","monto":8000},{"medio":"tarjeta","monto":12000}]')).id as mixta_admin \gset
select registrar_gasto((select id from categorias_gasto where nombre = 'Comida'), 13000, 'efectivo', 'Compra grande', :turno_admin);
select throws_ok(format($$select anular_venta(%s, 'error')$$, :mixta_admin),
  'P0001', 'La caja del turno no tiene efectivo suficiente para devolver esta venta (en el cajón hay $ 3.100,00)',
  'si el cajón no tiene la parte en efectivo, la anulación se rechaza con el monto en formato argentino');
select cerrar_turno(:turno_admin);
reset role;

-- Venta pasada: un solo medio, con su fila de pago ---------------------------------------------------
select pg_temp.como(:'admin');
select (registrar_venta_pasada(fecha_local(now()) - 3, '10:00', :caja, :servicio, 'tarjeta', 7000)).id as pasada \gset
reset role;
select is((select array_agg(row(medio::text, monto)::text) from venta_pagos where venta_id = :pasada),
  array[row('tarjeta', 7000.00)::text], 'la venta pasada tiene su fila de pago');

-- RLS de venta_pagos ---------------------------------------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero2', :caja2, 100) as turno2 \gset
select (registrar_venta(:turno2, :servicio, p_pagos => '[{"medio":"efectivo","monto":2000},{"medio":"tarjeta","monto":18000}]')).id as venta2 \gset
select is((select count(*)::int from venta_pagos), 2, 'un cajero ve solo los pagos de las ventas de turnos abiertos');
select throws_ok(format($$insert into venta_pagos (venta_id, medio, monto) values (%s, 'transferencia', 1)$$, :venta2),
  '42501', null, 'nadie escribe venta_pagos directo');
reset role;
select pg_temp.como(:'cajero');
select is((select count(*)::int from venta_pagos where venta_id = :venta2), 2,
  'otro usuario ve los pagos de una caja con turno abierto (la caja es compartida)');
reset role;
select pg_temp.como(:'admin');
select is((select count(*)::int from venta_pagos where venta_id in (:mixta, :venta2, :pasada)), 5,
  'el admin ve todos los pagos');
select throws_ok(format($$delete from venta_pagos where venta_id = %s$$, :venta2),
  '42501', null, 'ni el admin borra pagos');
reset role;
select pg_temp.como_anonimo();
select throws_ok('select * from venta_pagos', '42501', null, 'anon no lee pagos');
reset role;

-- Usuario desactivado
update perfiles set activo = false where id = :'cajero2';
select pg_temp.como(:'cajero2');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":2000},{"medio":"tarjeta","monto":18000}]')$$, :turno2, :servicio),
  '42501', 'Usuario no autenticado o desactivado', 'un usuario desactivado no cobra mixto');
select is((select count(*)::int from venta_pagos), 0, 'un usuario desactivado no ve pagos');
reset role;

select * from finish();
rollback;
