begin;
\ir _helpers.psql
select plan(8);

select * from pg_temp.escenario() \gset

-- Libre al principio
select pg_temp.como(:'admin');
select is((select row(nombre, ocupada, turno_id, abierto_en)::text from cajas_para_turno() where id = :caja),
  row('Caja Test', false, null::bigint, null::timestamptz)::text, 'una caja sin turno abierto figura libre');
reset role;

-- El admin abre la caja 1: figura ocupada, con su turno y desde cuándo (sin persona: migración 33)
select pg_temp.abrir_turno_para(:'admin', :'admin', :caja) as turno \gset
select is((select row(ocupada, turno_id, abierto_en)::text from cajas_para_turno() where id = :caja),
  (select row(true, id, abierto_en)::text from turnos where id = :turno),
  'la caja con turno abierto figura ocupada, con el turno y la hora de apertura');
select is((select ocupada from cajas_para_turno() where id = :caja2), false, 'la otra caja sigue libre');
reset role;

-- El cajero no abre turnos ni consulta las cajas para turno (migración 28)
select pg_temp.como(:'cajero');
select throws_ok('select * from cajas_para_turno()', '42501', null,
  'el cajero no consulta las cajas para turno');
select throws_ok(format('select abrir_turno(%s, 100)', :caja2), '42501', null,
  'el cajero no abre turnos (lo hace el admin)');
select is((select count(*)::int from turnos where caja_id = :caja2), 0, 'y no quedó nada abierto');
reset role;

-- Las cajas desactivadas no se ofrecen
update cajas set activa = false where id = :caja2;
select pg_temp.como(:'admin');
select is((select count(*)::int from cajas_para_turno() where id = :caja2), 0, 'una caja desactivada no aparece');
reset role;

select is(has_function_privilege('anon', 'public.cajas_para_turno()', 'execute'), false,
  'anon no la ejecuta');

select * from finish();
rollback;
