begin;
\ir _helpers.psql
select plan(15);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('otro@test.local') as otro \gset

-- CRUD de cajas
select pg_temp.como(:'cajero');
select throws_ok($$insert into cajas (nombre) values ('Caja pirata')$$, '42501', null,
  'un cajero no puede crear cajas');
reset role;
select pg_temp.como(:'admin');
select lives_ok($$insert into cajas (nombre) values ('Caja nueva')$$, 'un admin crea cajas');
reset role;

-- Abrir turno
select pg_temp.como(:'cajero');
select lives_ok(format('select abrir_turno(%s)', :caja), 'el cajero abre turno en una caja libre');
select isnt((select abierto_en from turnos where usuario_id = :'cajero'), null,
  'se guarda la fecha y hora de apertura');
select throws_ok(format('select abrir_turno(%s)', :caja2), 'P0001',
  'Ya tenés un turno abierto; cerralo antes de abrir otro', 'un cajero no puede tener dos turnos');
reset role;

select pg_temp.como(:'otro');
select throws_ok(format('select abrir_turno(%s)', :caja), 'P0001',
  'La caja "Caja Test" ya tiene un turno abierto', 'una caja no puede tener dos turnos abiertos');
select is((select count(*)::int from turnos), 0, 'un cajero no ve turnos ajenos');
reset role;

update cajas set activa = false where id = :caja2;
select pg_temp.como(:'otro');
select throws_ok(format('select abrir_turno(%s)', :caja2), '22023',
  'La caja no existe o está desactivada', 'no se abre turno en una caja desactivada');
select throws_ok('select cerrar_turno()', 'P0001', 'No tenés un turno abierto',
  'no se cierra un turno inexistente');
reset role;

-- Cerrar turno con totales
insert into certificados (nombre, hojas_por_unidad) values ('Hoja Test', 25);
select pg_temp.como(:'cajero');
select registrar_venta(:servicio, 'efectivo');
select registrar_venta(:servicio, 'efectivo');
select registrar_venta(:servicio, 'tarjeta');
select registrar_venta(:servicio, 'transferencia');
select registrar_gasto((select id from categorias_gasto where nombre = 'Comida'), 3000, 'efectivo', 'Almuerzo');
select cerrar_turno('Todo en orden');
reset role;

select is(
  (select row(cantidad_ventas, total_efectivo, total_tarjeta, total_transferencia, total_gastos)::text
   from turnos where usuario_id = :'cajero'),
  row(4, 40000.00, 20000.00, 20000.00, 3000.00)::text,
  'al cerrar se guardan cantidad, totales por medio de pago y gastos');
select isnt((select cerrado_en from turnos where usuario_id = :'cajero'), null,
  'se guarda la fecha y hora de cierre');
select is((select observaciones from turnos where usuario_id = :'cajero'), 'Todo en orden',
  'se guardan las observaciones');

select pg_temp.como(:'cajero');
select lives_ok(format('select abrir_turno(%s)', :caja), 'cerrado el turno, la caja vuelve a estar libre');
reset role;

-- Cierre por parte de un admin
select id as turno_abierto from turnos where cerrado_en is null and caja_id = :caja \gset
select pg_temp.como(:'otro');
select throws_ok(format('select cerrar_turno(null, %s)', :turno_abierto),
  '42501', 'Solo un administrador puede cerrar el turno de otro usuario',
  'un cajero no cierra turnos ajenos');
reset role;
select pg_temp.como(:'admin');
select lives_ok(format('select cerrar_turno(%L, %s)', 'Cierre forzado', :turno_abierto),
  'el admin puede cerrar el turno de otro usuario');
reset role;

select * from finish();
rollback;
