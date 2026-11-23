begin;
\ir _helpers.psql
select plan(20);

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

-- Abrir turno: solo el admin, de una caja (sin usuario), con efectivo inicial de la caja general
select pg_temp.como(:'cajero');
select throws_ok(format('select abrir_turno(%s, 100)', :caja), '42501', null,
  'un cajero no abre turnos');
reset role;
select pg_temp.como(:'admin');
select throws_ok(format('select abrir_turno(%s, 0)', :caja), '22023', null,
  'el efectivo inicial debe ser mayor a cero');
select throws_ok(format('select abrir_turno(%s, 100)', :caja), 'P0001', null,
  'sin efectivo en la caja general no se abre (y no queda nada a medias)');
select movimiento_efectivo('fondo_inicial', 1000, 'Fondo');
select lives_ok(format('select abrir_turno(%s, 600)', :caja), 'el admin abre una caja libre');
select is((select row(efectivo_inicial, abierto_por, usuario_id, abierto_en is not null)::text
           from turnos where caja_id = :caja),
  row(600.00, :'admin'::uuid, null::uuid, true)::text,
  'se guardan efectivo inicial, quién lo abrió y la hora; el turno no tiene usuario asignado');
select is((select saldo from caja_efectivo), 400.00::numeric, 'el efectivo inicial sale de la caja general');
select throws_ok(format('select abrir_turno(%s, 100)', :caja), 'P0001',
  'La caja "Caja Test" ya tiene un turno abierto', 'una caja no puede tener dos turnos abiertos');
reset role;

select id as turno from turnos where caja_id = :caja and cerrado_en is null \gset

update cajas set activa = false where id = :caja2;
select pg_temp.como(:'admin');
select throws_ok(format('select abrir_turno(%s, 100)', :caja2), '22023',
  'La caja no existe o está desactivada', 'no se abre turno en una caja desactivada');
reset role;

-- Cerrar turno con totales: venden dos usuarios en la misma caja
insert into certificados (nombre, hojas_por_unidad) values ('Hoja Test', 25);
select pg_temp.como(:'cajero');
select registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$);
select registrar_venta(:turno, :servicio, 'efectivo', p_patente => $p$AB123CD$p$);
select registrar_gasto((select id from categorias_gasto where nombre = 'Comida'), 3000, 'efectivo', 'Almuerzo',
  :turno);
reset role;
select pg_temp.como(:'otro');
select registrar_venta(:turno, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$);
select registrar_venta(:turno, :servicio, 'transferencia', p_patente => $p$AB123CD$p$);
select throws_ok(format('select cerrar_turno(%s)', :turno), '42501', null,
  'un cajero no cierra turnos');
reset role;
select is((select cerrado_en from turnos where id = :turno), null, 'el turno sigue abierto');

select pg_temp.como(:'admin');
select throws_ok('select cerrar_turno(null)', '22023', 'Elegí el turno que vas a cerrar',
  'hay que indicar el turno a cerrar');
select throws_ok('select cerrar_turno(999999999)', '22023', 'El turno no existe',
  'no se cierra un turno inexistente');
select lives_ok(format('select cerrar_turno(%s, %L)', :turno, 'Todo en orden'), 'el admin cierra el turno');
select throws_ok(format('select cerrar_turno(%s)', :turno), 'P0001', 'El turno ya estaba cerrado',
  'no se cierra dos veces');
reset role;

select is(
  (select row(cantidad_ventas, total_efectivo, total_tarjeta, total_transferencia, total_gastos)::text
   from turnos where id = :turno),
  row(4, 40000.00, 20000.00, 20000.00, 3000.00)::text,
  'al cerrar se guardan cantidad, totales por medio de pago y gastos de todos los que vendieron');
select is((select observaciones from turnos where id = :turno), 'Todo en orden',
  'se guardan las observaciones');
select is((select row(efectivo_cierre, (select saldo from caja_efectivo))::text
           from turnos where id = :turno),
  row(37600.00, 38000.00)::text,
  'al cerrar, inicial + ventas en efectivo − gastos en efectivo vuelve a la caja general');
select pg_temp.como(:'admin');
select lives_ok(format('select abrir_turno(%s, 100)', :caja), 'cerrado el turno, la caja vuelve a estar libre');
reset role;

select * from finish();
rollback;
