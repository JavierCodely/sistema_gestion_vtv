begin;
\ir _helpers.psql
select plan(12);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('cajero2@test.local') as cajero2 \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja VTV', 25);

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
  'public._insertar_gasto(bigint, numeric, public.fuente_fondos, text)', 'execute'),
  '_insertar_gasto no se puede llamar desde el cliente');
select ok(not has_function_privilege('anon', 'public.registrar_venta(bigint, public.medio_pago, text)', 'execute'),
  'anon no puede vender');

-- Anónimo
select pg_temp.como_anonimo();
select throws_ok('select * from servicios', '42501', null, 'anon no lee servicios');
select throws_ok('select * from v_movimientos_caja', '42501', null, 'anon no lee movimientos');
reset role;

-- Aislamiento entre cajeros
select pg_temp.como(:'cajero');
select abrir_turno(:caja);
select registrar_venta(:servicio, 'tarjeta');
reset role;
select pg_temp.como(:'cajero2');
select abrir_turno(:caja2);
select is((select count(*)::int from ventas), 0, 'un cajero no ve ventas de otro');
select is((select count(*)::int from v_movimientos_caja), 0, 'ni en la vista de movimientos');
select is((select count(*)::int from movimientos_certificado), 0, 'un cajero no ve el kardex');
select throws_ok($$insert into ventas (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id, precio, medio_pago)
                   values (1, 1, auth.uid(), 1, 'x', 1, 1, 'tarjeta')$$,
  '42501', null, 'no se insertan ventas directo en la tabla');
reset role;

-- Usuario desactivado no opera
update perfiles set activo = false where id = :'cajero2';
select pg_temp.como(:'cajero2');
select throws_ok(format($$select registrar_venta(%s, 'tarjeta')$$, :servicio),
  '42501', 'Usuario no autenticado o desactivado', 'un usuario desactivado no puede vender');
reset role;

select * from finish();
rollback;
