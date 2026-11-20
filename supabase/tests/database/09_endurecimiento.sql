-- Regresiones de la auditoría de seguridad (migración 014).
begin;
\ir _helpers.psql
select plan(19);

select * from pg_temp.escenario() \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja VTV', 25) returning id as cert \gset

select pg_temp.como(:'admin');
select movimiento_efectivo('fondo_inicial', 1000, 'Fondo');
reset role;

-- NaN y montos inválidos en las RPC
select pg_temp.como(:'cajero');
select abrir_turno(:caja);
select throws_ok(format($$select registrar_gasto(%s, 'NaN', 'efectivo', 'x')$$, :comida),
  '22023', 'El monto no es válido', 'un gasto con monto NaN se rechaza');
select throws_ok(format($$select registrar_gasto(%s, 0.015, 'efectivo', 'x')$$, :comida),
  '22023', 'El monto no puede tener más de 2 decimales', 'un gasto con más de 2 decimales se rechaza');
select throws_ok(format($$select registrar_gasto(%s, -5, 'efectivo', 'x')$$, :comida),
  '22023', 'El monto debe ser mayor a cero', 'un gasto negativo se rechaza');
select throws_ok(format($$select registrar_gasto(%s, 99999999999, 'transferencia', 'x')$$, :comida),
  '22023', 'El monto es demasiado grande', 'un gasto fuera de rango se rechaza');
reset role;

select pg_temp.como(:'admin');
select throws_ok($$select movimiento_efectivo('ingreso', 'NaN', 'x')$$,
  '22023', 'El monto no es válido', 'un ingreso NaN se rechaza');
select throws_ok($$select movimiento_efectivo('retiro', 'NaN', 'x')$$,
  '22023', 'El monto no es válido', 'un retiro NaN se rechaza');
select throws_ok(format($$select registrar_compra_certificado(%s, 1, 'NaN', 'transferencia')$$, :cert),
  '22023', 'El costo por unidad no es válido', 'una compra con costo NaN se rechaza');
select throws_ok(format($$select registrar_compra_certificado(%s, 1, 10.005, 'transferencia')$$, :cert),
  '22023', 'El costo por unidad no puede tener más de 2 decimales', 'una compra con costo de 3 decimales se rechaza');
select throws_ok(format($$select registrar_compra_certificado(%s, 1000000, 10, 'transferencia')$$, :cert),
  '22023', 'La cantidad debe ser entre 1 y 100.000', 'una compra con cantidad absurda se rechaza');
select throws_ok(format($$update servicios set precio = 'NaN' where id = %s$$, :servicio),
  '23514', null, 'un precio NaN se rechaza aunque el admin escriba directo en la tabla');
reset role;

select is((select saldo from caja_efectivo), 1000.00::numeric, 'después de todos los intentos el saldo sigue intacto');

-- Defensa en profundidad: ni siquiera el uso interno acepta NaN
select throws_ok($$select _mover_efectivo('ingreso', 'NaN')$$, '22023', null,
  '_mover_efectivo rechaza NaN');
select throws_ok($$update caja_efectivo set saldo = 'NaN'$$, '23514', null,
  'la columna saldo no admite NaN');

-- Largo de textos
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(%s, 'tarjeta', 'ABC123456789')$$, :servicio),
  '23514', null, 'una patente de más de 10 caracteres se rechaza');
select throws_ok(format($$select registrar_gasto(%s, 10, 'transferencia', %L)$$, :comida, repeat('x', 501)),
  '23514', null, 'una nota de más de 500 caracteres se rechaza');
reset role;

-- certificado_para_servicio exige usuario activo
update perfiles set activo = false where id = :'cajero';
select pg_temp.como(:'cajero');
select throws_ok(format('select certificado_para_servicio(%s)', :servicio),
  '42501', 'Usuario no autenticado o desactivado', 'un usuario desactivado no consulta certificados');
reset role;
update perfiles set activo = true where id = :'cajero';
select pg_temp.como(:'cajero');
select is(certificado_para_servicio(:servicio), :cert::bigint, 'un usuario activo sí');
reset role;

-- Concurrencia: los chequeos críticos toman locks (la carrera en sí no se puede simular en una sesión)
select ok(pg_get_functiondef('public.tg_proteger_ultimo_admin()'::regprocedure) like '%pg_advisory_xact_lock%',
  'la protección del último admin serializa con un advisory lock');
select ok(pg_get_functiondef('public.registrar_venta(bigint, public.medio_pago, text)'::regprocedure) like '%for share%',
  'registrar_venta bloquea el turno para no vender en un turno que se está cerrando');

select * from finish();
rollback;
