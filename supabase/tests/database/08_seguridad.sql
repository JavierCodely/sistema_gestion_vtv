begin;
\ir _helpers.psql
select plan(20);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('cajero2@test.local') as cajero2 \gset
insert into certificados (todos_servicios, nombre, hojas_por_unidad) values (true, 'Hoja VTV', 25);

-- Todas las tablas de public tienen RLS
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null, 'todas las tablas de public tienen RLS habilitada');

-- Todas las vistas son security_invoker
select is(
  (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  null, 'todas las vistas respetan la RLS de quien consulta');

-- Funciones internas no expuestas
select ok(not has_function_privilege('authenticated',
  'public._mover_efectivo(public.tipo_mov_efectivo, numeric, text, bigint, bigint, bigint)', 'execute'),
  '_mover_efectivo no se puede llamar desde el cliente');
select ok(not has_function_privilege('authenticated',
  'public._insertar_gasto(bigint, numeric, public.fuente_fondos, text, bigint)', 'execute'),
  '_insertar_gasto no se puede llamar desde el cliente');
select ok(not has_function_privilege('anon', 'public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean)', 'execute'),
  'anon no puede vender');

-- Pagos de ventas y disponibilidad de descuentos: solo por RPC (migraciones 30 y 31)
select ok(not exists (
    select 1 from unnest(array['public.venta_pagos', 'public.descuento_servicios']) t
    where has_table_privilege('authenticated', t, 'insert')
       or has_table_privilege('authenticated', t, 'update')
       or has_table_privilege('authenticated', t, 'delete')),
  'venta_pagos y descuento_servicios no se escriben directo');

-- service_role: solo lo que usan las Edge Functions (migración 28, igual que en la nube)
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
     and has_table_privilege('service_role', c.oid, 'select')),
  array['arca_condiciones_iva', 'arca_configuracion', 'comprobantes', 'v_comprobantes'],
  'service_role solo lee tablas enteras que usa arca');
-- ventas: solo las columnas que usa v_comprobantes (migración 32), nunca los costos
select is(
  (select array_agg(a.attname::text order by a.attname) from pg_attribute a
   where a.attrelid = 'public.ventas'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('service_role', a.attrelid, a.attnum, 'select')),
  array['id', 'patente', 'servicio_nombre', 'turno_id'],
  'service_role lee de ventas solo las columnas que usa arca');
set local role service_role;
select throws_ok('select costo_certificado from public.ventas', '42501', null,
  'service_role no lee el costo de certificado de las ventas');
select lives_ok('select id, venta_id, turno_id, servicio_nombre, patente, qr_url from public.v_comprobantes',
  'service_role lee v_comprobantes (arca)');
reset role;
select ok(
  not exists (select 1 from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
                and (has_table_privilege('service_role', c.oid, 'insert')
                  or has_table_privilege('service_role', c.oid, 'update')
                  or has_table_privilege('service_role', c.oid, 'delete'))),
  'service_role no escribe tablas enteras (las escrituras de arca son por RPC)');
select ok(
  has_column_privilege('service_role', 'public.perfiles', 'apellido', 'select')
  and has_column_privilege('service_role', 'public.perfiles', 'nombre_completo', 'select')
  and has_column_privilege('service_role', 'public.perfiles', 'rol', 'update')
  and has_column_privilege('service_role', 'public.perfiles', 'activo', 'update'),
  'admin-usuarios lee el perfil y cambia nombre, apellido, rol y activación');
select ok(not has_column_privilege('service_role', 'public.perfiles', 'email', 'update'),
  'admin-usuarios no cambia el email del perfil (lo maneja auth)');

-- Anónimo
select pg_temp.como_anonimo();
select throws_ok('select * from servicios', '42501', null, 'anon no lee servicios');
select throws_ok('select * from v_movimientos_caja', '42501', null, 'anon no lee movimientos');
reset role;

-- Aislamiento: de un turno cerrado el cajero no ve nada (migración 33)
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja) as turno1 \gset
select registrar_venta(:turno1, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$);
reset role;
select pg_temp.como(:'admin');
select cerrar_turno(:turno1);
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero2', :caja2) as turno2 \gset
select is((select count(*)::int from ventas), 0, 'un cajero no ve ventas de turnos cerrados');
select is((select count(*)::int from v_movimientos_caja), 0, 'ni en la vista de movimientos');
select is((select count(*)::int from movimientos_certificado), 0, 'un cajero no ve el kardex');
select throws_ok($$insert into ventas (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id, precio, medio_pago)
                   values (1, 1, auth.uid(), 1, 'x', 1, 1, 'tarjeta')$$,
  '42501', null, 'no se insertan ventas directo en la tabla');
reset role;

-- Usuario desactivado no opera
update perfiles set activo = false where id = :'cajero2';
select pg_temp.como(:'cajero2');
select throws_ok(format($$select registrar_venta(%s, %s, 'tarjeta', p_patente => $p$AB123CD$p$)$$, :turno2, :servicio),
  '42501', 'Usuario no autenticado o desactivado', 'un usuario desactivado no puede vender');
reset role;

select * from finish();
rollback;
