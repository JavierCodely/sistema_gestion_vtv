begin;
\ir _helpers.psql
select plan(12);

select pg_temp.crear_usuario('nuevo@test.local') as nuevo \gset
select pg_temp.crear_usuario('jefe@test.local', 'admin') as jefe \gset

select is((select rol::text from perfiles where id = :'nuevo'), 'cajero',
  'el perfil se crea solo y el rol por defecto es cajero');
select is((select nombre from perfiles where id = :'nuevo'), 'Usuario nuevo@test.local',
  'el nombre se toma de user_metadata');
select is((select rol::text from perfiles where id = :'jefe'), 'admin',
  'el rol se toma de app_metadata');

-- Funciones de rol
select pg_temp.como(:'nuevo');
select is(rol_actual()::text, 'cajero', 'rol_actual devuelve el rol del usuario');
select is(es_admin(), false, 'un cajero no es admin');
select is((select count(*)::int from perfiles), 1, 'un cajero solo ve su propio perfil');
select throws_ok(
  format($$update perfiles set rol = 'admin' where id = %L$$, :'nuevo'),
  '42501', null, 'un cajero no puede modificar perfiles (ni el suyo)');
reset role;

select pg_temp.como(:'jefe');
select is(es_admin(), true, 'un admin es admin');
select ok((select count(*) from perfiles) >= 2, 'un admin ve todos los perfiles');
reset role;

-- Usuario desactivado
update perfiles set activo = false where id = :'nuevo';
select pg_temp.como(:'nuevo');
select is(rol_actual(), null, 'un usuario desactivado no tiene rol efectivo');
reset role;

-- Último admin activo
update perfiles set activo = false where rol = 'admin' and id <> :'jefe';
select throws_ok(
  format($$update perfiles set activo = false where id = %L$$, :'jefe'),
  'P0001', 'Debe quedar al menos un administrador activo',
  'no se puede desactivar al último admin');
select throws_ok(
  format($$update perfiles set rol = 'cajero' where id = %L$$, :'jefe'),
  'P0001', 'Debe quedar al menos un administrador activo',
  'no se puede quitar el rol al último admin');

select * from finish();
rollback;
