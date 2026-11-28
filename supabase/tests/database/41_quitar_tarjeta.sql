-- Migración 54: sin tarjeta. Los medios de pago son efectivo y transferencia; Fondos tiene dos cuentas.
-- (El paso de los datos viejos —tarjeta → transferencia— se verificó al aplicar la migración: después
-- de la 54 ya no se puede escribir una tarjeta para probarlo acá.)
begin;
\ir _helpers.psql
select plan(19);

select * from pg_temp.escenario() \gset

-- Tipos -----------------------------------------------------------------------------------------------
select is((select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.medio_pago'::regtype),
  array['efectivo', 'transferencia'], 'medio_pago: efectivo y transferencia');
select is((select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cuenta_fondos'::regtype),
  array['efectivo', 'transferencia'], 'cuenta_fondos: efectivo y transferencia');
select is((select count(*)::int from pg_type where typnamespace = 'public'::regnamespace and typname ilike '%tarjeta%'), 0,
  'no queda el tipo viejo');

-- Nada habla de tarjeta: columnas, vistas, funciones ni restricciones ---------------------------------
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and column_name ilike '%tarjeta%'), 0,
  'ninguna tabla ni vista tiene columnas de tarjeta (turnos.total_tarjeta, v_turnos.ventas_tarjeta, …)');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
             and (prosrc ilike '%tarjeta%' or pg_get_function_result(oid) ilike '%tarjeta%')), 0,
  'ninguna función devuelve ni usa tarjeta');
select is((select count(*)::int from pg_constraint where connamespace = 'public'::regnamespace
             and pg_get_constraintdef(oid) ilike '%tarjeta%'), 0, 'ninguna restricción nombra tarjeta');
select is((select array_agg(cuenta::text order by cuenta) from cuentas_fondos), array['efectivo', 'transferencia'],
  'cuentas_fondos tiene dos filas');

-- Lo que se recreó sigue protegido ---------------------------------------------------------------------
select ok(has_function_privilege('authenticated',
    'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean, bigint)', 'execute')
  and not has_function_privilege('anon',
    'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean, bigint)', 'execute')
  and has_function_privilege('authenticated',
    'public.registrar_venta_pasada(date, time, bigint, bigint, public.medio_pago, numeric, text)', 'execute')
  and not has_function_privilege('anon',
    'public.registrar_venta_pasada(date, time, bigint, bigint, public.medio_pago, numeric, text)', 'execute'),
  'registrar_venta y registrar_venta_pasada: authenticated sí, anon no');
select ok((select bool_and(has_function_privilege('authenticated', p.oid, 'execute')
                           and not has_function_privilege('anon', p.oid, 'execute'))
           from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('movimiento_fondos', 'resumen_fondos', 'resumen_turnos', 'resumen_ventas_mixtas',
                               'resumen_diario', 'resumen_impuestos', 'cerrar_turno')),
  'las RPC recreadas: authenticated sí, anon no');
select ok(has_table_privilege('authenticated', 'public.v_movimientos_caja', 'select')
  and has_table_privilege('authenticated', 'public.v_turnos', 'select')
  and has_table_privilege('authenticated', 'public.v_movimientos_fondos', 'select')
  and has_table_privilege('authenticated', 'public.v_ventas_mixtas', 'select'),
  'las vistas recreadas se pueden leer (la RLS filtra)');
select ok((select bool_and(coalesce(reloptions::text[] @> array['security_invoker=true'], false))
           from pg_class where relnamespace = 'public'::regnamespace
             and relname in ('v_movimientos_caja', 'v_turnos', 'v_movimientos_fondos', 'v_ventas_mixtas')),
  'las vistas recreadas son security_invoker');
select ok((select tgdeferrable and tginitdeferred from pg_trigger where tgname = 'ventas_pagos_coherentes'),
  'vuelve el trigger diferido de coherencia ventas ↔ pagos');

-- Ventas -------------------------------------------------------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select throws_ok(format($$select registrar_venta(%s, %s, 'tarjeta', 'QT111AA')$$, :turno, :servicio), '22P02', null,
  'una venta con tarjeta se rechaza');
select throws_ok(format($$select registrar_venta(%s, %s, p_pagos => '[{"medio":"efectivo","monto":5000},{"medio":"tarjeta","monto":15000}]', p_patente => 'QT111AA')$$, :turno, :servicio),
  '22023', 'El medio de pago "tarjeta" no es válido', 'un pago mixto con tarjeta se rechaza');
select (registrar_venta(:turno, :servicio, null, 'QT222BB',
  '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":15000}]'::jsonb)).id as mixta \gset
select is((select row(medio, pagos)::text from v_movimientos_caja where tipo = 'venta' and id = :mixta),
  row('mixto', '[{"medio": "efectivo", "monto": 5000.00}, {"medio": "transferencia", "monto": 15000.00}]'::jsonb)::text,
  'el pago mixto es efectivo + transferencia');
reset role;

-- Fondos e impuestos (admin) -----------------------------------------------------------------------------
select pg_temp.como(:'admin');
select is((select array_agg(cuenta::text order by cuenta) from resumen_fondos()), array['efectivo', 'transferencia'],
  'resumen_fondos: dos cuentas');
select throws_ok($$select movimiento_fondos(null, 'ingreso', 10, 'x')$$, '22023',
  'Elegí la cuenta (efectivo o transferencia)', 'el mensaje de cuenta ya no nombra tarjeta');
insert into impuestos (nombre, tipo, valor) values ('Prueba 54', 'porcentaje', 1) returning medios::text as medios \gset
select is(:'medios'::text, '{efectivo,transferencia}', 'un impuesto nuevo alcanza a efectivo y transferencia');
select throws_ok($$insert into impuestos (nombre, tipo, valor, medios) values ('Con tarjeta', 'porcentaje', 1, '{tarjeta}')$$,
  '22P02', null, 'un impuesto no puede alcanzar a tarjeta');
reset role;

select * from finish();
rollback;
