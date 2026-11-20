begin;
\ir _helpers.psql
select plan(8);

select * from pg_temp.escenario() \gset

-- Libre al principio
select pg_temp.como(:'cajero');
select is((select row(nombre, ocupada, ocupada_por)::text from cajas_para_turno() where id = :caja),
  row('Caja Test', false, null::text)::text, 'una caja sin turno abierto figura libre');

-- El admin abre un turno en la caja 1: el cajero la ve ocupada (y por quién), sin poder leer el turno
reset role;
update perfiles set nombre = 'Ana Admin' where id = :'admin';
select pg_temp.como(:'admin');
select abrir_turno(:caja);
reset role;
select pg_temp.como(:'cajero');
select is((select row(ocupada, ocupada_por)::text from cajas_para_turno() where id = :caja),
  row(true, 'Ana Admin')::text, 'la caja con turno abierto figura ocupada por quien la abrió');
select is((select ocupada from cajas_para_turno() where id = :caja2), false, 'la otra caja sigue libre');
select is((select count(*)::int from turnos where caja_id = :caja), 0,
  'el cajero sigue sin poder leer el turno ajeno');
select throws_ok(format('select abrir_turno(%s)', :caja), 'P0001', 'La caja "Caja Test" ya tiene un turno abierto',
  'abrir una caja ocupada se rechaza igual');
reset role;

-- Las cajas desactivadas no se ofrecen
update cajas set activa = false where id = :caja2;
select pg_temp.como(:'cajero');
select is((select count(*)::int from cajas_para_turno() where id = :caja2), 0, 'una caja desactivada no aparece');
reset role;

-- Un usuario desactivado no la puede usar; anon tampoco la puede ejecutar
update perfiles set activo = false where id = :'cajero';
select pg_temp.como(:'cajero');
select throws_ok('select * from cajas_para_turno()', '42501', null, 'un usuario desactivado no la usa');
reset role;
select is(has_function_privilege('anon', 'public.cajas_para_turno()', 'execute'), false,
  'anon no la ejecuta');

select * from finish();
rollback;
