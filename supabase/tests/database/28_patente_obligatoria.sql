-- Migración 38: patente obligatoria en las ventas de la caja (con turno).
begin;
\ir _helpers.psql
select plan(8);

select * from pg_temp.escenario() \gset

select ok(not has_function_privilege('authenticated', 'public.tg_ventas_patente_obligatoria()', 'execute'),
  'la función del trigger es interna');

select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select throws_ok(format('select registrar_venta(%s, %s, %L)', :turno, :servicio, 'efectivo'),
  '22023', 'Ingresá la patente del vehículo', 'sin patente se rechaza');
select throws_ok(format('select registrar_venta(%s, %s, %L, %L)', :turno, :servicio, 'efectivo', '   '),
  '22023', 'Ingresá la patente del vehículo', 'una patente en blanco se rechaza');
select throws_ok(format('select registrar_venta(%s, %s, p_pagos => %L)', :turno, :servicio,
  '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":15000}]'),
  '22023', 'Ingresá la patente del vehículo', 'también en un pago mixto');
select is((registrar_venta(:turno, :servicio, 'transferencia', ' ab 123 cd ')).patente, 'AB123CD',
  'con patente se registra (normalizada)');
select is((select count(*)::int from ventas where turno_id = :turno), 1,
  'las rechazadas no dejaron ventas');
reset role;

-- Ventas con fecha pasada (carga histórica, sin turno): la patente sigue siendo opcional
select pg_temp.como(:'admin');
select is((registrar_venta_pasada('2026-01-10', '10:00', :caja, :servicio, 'efectivo', 20000)).patente,
  null, 'una venta con fecha pasada puede no tener patente');
reset role;

-- Las ventas viejas sin patente no se tocan: el control es solo al insertar
select lives_ok(format('update ventas set anulada = anulada where turno_id = %s', :turno),
  'actualizar ventas existentes no exige patente');

select * from finish();
rollback;
