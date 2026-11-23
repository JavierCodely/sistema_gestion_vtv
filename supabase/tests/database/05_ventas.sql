begin;
\ir _helpers.psql
select plan(28);

select * from pg_temp.escenario() \gset
insert into certificados (nombre, hojas_por_unidad, stock_minimo) values ('Hoja VTV', 25, 10) returning id as cert \gset

select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 4, 50000, 'transferencia');
reset role;

-- Sin elegir el turno de una caja no se vende
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(null, %s, 'efectivo')$$, :servicio),
  '22023', 'Elegí la caja en la que estás trabajando', 'sin turno elegido no se puede vender');
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja) as turno \gset

-- Una venta
select (registrar_venta(:turno, :servicio, 'efectivo', ' ab 123 cd ')).id as venta1 \gset
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
select is((select saldo from caja_efectivo), 0.00::numeric,
  'la venta en efectivo queda en el cajón del turno: no toca la caja general');
select is((select efectivo_en_caja from v_turnos where id = :turno), 20100.00::numeric,
  'el cajón del turno tiene efectivo inicial + la venta');

-- 89 ventas más (90 en total) → quedan 10 hojas
select pg_temp.como(:'cajero');
select registrar_venta(:turno, :servicio, 'tarjeta') from generate_series(1, 89);
reset role;
select is((select stock_hojas from certificados where id = :cert), 10, '90 ventas → quedan 10 hojas');
select is((select efectivo_en_caja from v_turnos where id = :turno), 20100.00::numeric,
  'las ventas con tarjeta no tocan el efectivo');
select is((select count(*)::int from alertas where tipo = 'stock_bajo' and certificado_id = :cert), 1,
  'al llegar al stock mínimo se avisa una sola vez');
select is(
  (select round(sum(costo_certificado), 2) from ventas where certificado_id = :cert),
  180000.00::numeric, '90 hojas × $2.000 = $180.000 de costo');

-- Agotar el stock y vender sin hojas
select pg_temp.como(:'cajero');
select registrar_venta(:turno, :servicio, 'transferencia') from generate_series(1, 10);
select (registrar_venta(:turno, :servicio, 'transferencia')).id as venta_sin \gset
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
select (registrar_venta(:turno, :servicio, 'tarjeta')).id as venta_sin_cert \gset
reset role;
select ok(
  (select mensaje like '%no hay un certificado configurado%' from alertas where venta_id = :venta_sin_cert),
  'si no hay certificado configurado también se avisa');

-- Servicio que no requiere certificado
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Sin hoja', :categoria, 5000, false) returning id as sin_hoja \gset
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :sin_hoja, 'tarjeta')).id as venta_sin_hoja \gset
reset role;
select is(
  (select row(sin_stock, certificado_id)::text from ventas where id = :venta_sin_hoja),
  row(false, null::bigint)::text,
  'un servicio sin certificado no consume hoja ni genera alerta');

-- Servicio desactivado
update servicios set activo = false where id = :sin_hoja;
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_venta(%s, %s, 'tarjeta')$$, :turno, :sin_hoja),
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

select is((select row(efectivo_en_caja, (select saldo from caja_efectivo))::text
           from v_turnos where id = :turno),
  row(100.00, 0.00)::text, 'con el turno abierto, anular una venta en efectivo la saca del cajón');
select is((select stock_hojas from certificados where id = :cert), 0, 'la hoja de una venta anulada no vuelve al stock');

-- Anulación sin efectivo suficiente en el cajón
select pg_temp.como(:'cajero');
select (registrar_venta(:turno, :servicio, 'efectivo')).id as venta2 \gset
select (registrar_venta(:turno, :servicio, 'efectivo')).id as venta3 \gset
select registrar_gasto((select id from categorias_gasto where nombre = 'Comida'), 30000, 'efectivo', 'Compra grande',
  :turno);
reset role;
select pg_temp.como(:'admin');
select throws_ok(format($$select anular_venta(%s, 'error')$$, :venta2),
  'P0001', 'La caja del turno no tiene efectivo suficiente para devolver esta venta (en el cajón hay $ 10.100,00)',
  'si el cajón del turno no tiene el efectivo, la anulación se rechaza');
reset role;

-- Turno cerrado: el efectivo ya volvió a la caja general; anular lo saca de ahí
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
reset role;
select is((select saldo from caja_efectivo), 10100.00::numeric,
  'al cerrar, el cajón (100 + 40.000 − 30.000) vuelve a la caja general');
select pg_temp.como(:'admin');
select throws_ok(format($$select anular_venta(%s, 'Cobro duplicado')$$, :venta3), 'P0001', null,
  'con el turno cerrado, si la caja general no alcanza, la anulación se rechaza');
select movimiento_efectivo('ingreso', 10000, 'Refuerzo');
select lives_ok(format($$select anular_venta(%s, 'Cobro duplicado')$$, :venta3),
  'con el turno cerrado, la anulación sale de la caja general');
reset role;
select is((select saldo from caja_efectivo), 100.00::numeric, 'la caja general devolvió la venta');
select is((select tipo::text from movimientos_efectivo where venta_id = :venta3), 'anulacion_venta',
  'la devolución queda en el libro de efectivo');

select * from finish();
rollback;
