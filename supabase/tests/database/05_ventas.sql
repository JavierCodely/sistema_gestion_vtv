begin;
\ir _helpers.psql
select plan(23);

select * from pg_temp.escenario() \gset
insert into certificados (nombre, hojas_por_unidad, stock_minimo) values ('Hoja VTV', 25, 10) returning id as cert \gset

select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 4, 50000, 'transferencia');
reset role;

-- Sin turno no se vende
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(%s, 'efectivo')$$, :servicio),
  'P0001', 'Necesitás un turno abierto para vender', 'sin turno abierto no se puede vender');
select abrir_turno(:caja);

-- Una venta
select (registrar_venta(:servicio, 'efectivo', ' ab 123 cd ')).id as venta1 \gset
reset role;

select is(
  (select row(precio, medio_pago::text, patente, certificado_id, costo_certificado, sin_stock)::text from ventas where id = :venta1),
  row(20000.00, 'efectivo', 'AB123CD', :cert, 2000.0000, false)::text,
  'la venta guarda precio, medio, patente normalizada, certificado y costo de la hoja');
select is((select stock_hojas from certificados where id = :cert), 99, 'la venta descuenta una hoja');
select is(
  (select row(tipo::text, hojas, costo_unitario, stock_resultante)::text from movimientos_certificado
   where venta_id = :venta1),
  row('venta', -1, 2000.0000, 99)::text,
  'la salida de la hoja queda en el kardex');
select is((select saldo from caja_efectivo), 20000.00::numeric, 'la venta en efectivo suma a la caja de cambio');
select is((select tipo::text from movimientos_efectivo where venta_id = :venta1), 'venta', 'queda en el libro de efectivo');

-- 89 ventas más (90 en total) → quedan 10 hojas
select pg_temp.como(:'cajero');
select registrar_venta(:servicio, 'tarjeta') from generate_series(1, 89);
reset role;
select is((select stock_hojas from certificados where id = :cert), 10, '90 ventas → quedan 10 hojas');
select is((select saldo from caja_efectivo), 20000.00::numeric, 'las ventas con tarjeta no tocan el efectivo');
select is((select count(*)::int from alertas where tipo = 'stock_bajo' and certificado_id = :cert), 1,
  'al llegar al stock mínimo se avisa una sola vez');
select is(
  (select round(sum(costo_certificado), 2) from ventas where certificado_id = :cert),
  180000.00::numeric, '90 hojas × $2.000 = $180.000 de costo');

-- Agotar el stock y vender sin hojas
select pg_temp.como(:'cajero');
select registrar_venta(:servicio, 'transferencia') from generate_series(1, 10);
select (registrar_venta(:servicio, 'transferencia')).id as venta_sin \gset
reset role;

select is((select stock_hojas from certificados where id = :cert), 0, 'el stock nunca queda negativo');
select is(
  (select row(sin_stock, costo_certificado, certificado_id)::text from ventas where id = :venta_sin),
  row(true, 0.0000, :cert)::text,
  'sin stock la venta se registra igual, marcada y sin costo de hoja');
select is(
  (select count(*)::int from alertas where tipo = 'venta_sin_stock' and venta_id = :venta_sin), 1,
  'la venta sin stock genera una alerta al admin');

-- Servicio sin certificado configurado
update certificados set activo = false where id = :cert;
select pg_temp.como(:'cajero');
select (registrar_venta(:servicio, 'tarjeta')).id as venta_sin_cert \gset
reset role;
select ok(
  (select mensaje like '%no hay un certificado configurado%' from alertas where venta_id = :venta_sin_cert),
  'si no hay certificado configurado también se avisa');

-- Servicio que no requiere certificado
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Sin hoja', :categoria, 5000, false) returning id as sin_hoja \gset
select pg_temp.como(:'cajero');
select (registrar_venta(:sin_hoja, 'tarjeta')).id as venta_sin_hoja \gset
reset role;
select is(
  (select row(sin_stock, certificado_id)::text from ventas where id = :venta_sin_hoja),
  row(false, null::bigint)::text,
  'un servicio sin certificado no consume hoja ni genera alerta');

-- Servicio desactivado
update servicios set activo = false where id = :sin_hoja;
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(%s, 'tarjeta')$$, :sin_hoja),
  '22023', 'El servicio no existe o está desactivado', 'no se vende un servicio desactivado');

-- Anulación
select throws_ok(format($$select anular_venta(%s, 'error')$$, :venta1),
  '42501', null, 'un cajero no puede anular ventas');
reset role;

select pg_temp.como(:'admin');
select throws_ok(format($$select anular_venta(%s, '')$$, :venta1),
  '22023', 'El motivo es obligatorio', 'anular exige motivo');
select lives_ok(format($$select anular_venta(%s, 'Cobro duplicado')$$, :venta1), 'el admin anula una venta');
select throws_ok(format($$select anular_venta(%s, 'otra vez')$$, :venta1),
  'P0001', 'La venta ya estaba anulada', 'no se anula dos veces');
reset role;

select is((select saldo from caja_efectivo), 0.00::numeric, 'anular una venta en efectivo devuelve el dinero de la caja');
select is((select stock_hojas from certificados where id = :cert), 0, 'la hoja de una venta anulada no vuelve al stock');

-- Anulación sin efectivo suficiente
select pg_temp.como(:'cajero');
select (registrar_venta(:servicio, 'efectivo')).id as venta2 \gset
reset role;
select pg_temp.como(:'admin');
select movimiento_efectivo('retiro', 15000, 'Depósito en banco');
select throws_ok(format($$select anular_venta(%s, 'error')$$, :venta2),
  'P0001', null, 'si la caja de cambio no tiene el efectivo, la anulación se rechaza');
reset role;

select * from finish();
rollback;
