begin;
\ir _helpers.psql
select plan(26);

select * from pg_temp.escenario() \gset

-- Catálogo de certificados (escritura directa del admin)
select pg_temp.como(:'admin');
insert into certificados (nombre, hojas_por_unidad, stock_minimo)
  values ('  Hoja   VTV ', 25, 10) returning id as cert \gset
select is((select nombre from certificados where id = :cert), 'Hoja VTV', 'el nombre se normaliza');
select throws_ok(format($$insert into certificados (nombre, hojas_por_unidad, alcance, servicio_id, activo)
                   values ('hoja vtv', 1, 'servicio', %s, false)$$, :servicio), '23505', null,
  'no se repite el nombre aunque cambien las mayúsculas');
select throws_ok($$insert into certificados (nombre, hojas_por_unidad, activo) values ('Grande', 10001, false)$$,
  '23514', null, 'hojas por unidad tiene tope');
select lives_ok($$insert into certificados (nombre, hojas_por_unidad, activo) values ('Justo', 10000, false)$$,
  'el tope de hojas por unidad se acepta');
select throws_ok(format('update certificados set stock_minimo = 1000001 where id = %s', :cert),
  '23514', null, 'el stock mínimo tiene tope');
select lives_ok(format('update certificados set stock_minimo = 5, nombre = %L where id = %s', 'Hoja VTV 2026', :cert),
  'el admin edita nombre y stock mínimo');
select is((select row(nombre, stock_minimo)::text from certificados where id = :cert),
  row('Hoja VTV 2026', 5)::text, 'los cambios quedan guardados');

-- Compras
select throws_ok(format($$select registrar_compra_certificado(%s, 100000, 1000000000, 'transferencia')$$, :cert),
  '22023', 'El total de la compra es demasiado grande', 'el total de la compra se valida antes de guardarlo');
select throws_ok(format($$select registrar_compra_certificado(%s, 1, 50000, 'efectivo')$$, :cert),
  'P0001', null, 'sin efectivo en la caja de cambio no se compra en efectivo');
select lives_ok(format($$select registrar_compra_certificado(%s, 2, 50000, 'transferencia', ' Imprenta Sur ')$$, :cert),
  'compra por transferencia');
select is((select row(unidades, hojas, costo_total, proveedor)::text from compras_certificado where certificado_id = :cert),
  row(2, 50, 100000.00, 'Imprenta Sur')::text, 'la compra guarda unidades, hojas, total y proveedor');
select is((select stock_hojas from certificados where id = :cert), 50, 'la compra suma las hojas');

update certificados set activo = false where id = :cert;
select throws_ok(format($$select registrar_compra_certificado(%s, 1, 100, 'transferencia')$$, :cert),
  'P0001', 'El certificado está desactivado: activalo para registrar compras',
  'no se compran certificados desactivados');
update certificados set activo = true where id = :cert;

-- Ajustes
select throws_ok(format($$select ajustar_stock_certificado(%s, 100001, 'Conteo')$$, :cert),
  '22023', 'El ajuste no puede superar las 100.000 hojas', 'el ajuste tiene tope');
select throws_ok(format($$select ajustar_stock_certificado(%s, -51, 'Rotura')$$, :cert),
  'P0001', 'El ajuste deja el stock en negativo (stock actual: 50 hojas)', 'el stock no queda negativo');
select lives_ok(format($$select ajustar_stock_certificado(%s, -3, 'Hojas rotas')$$, :cert), 'ajuste negativo');
select is((select row(stock_hojas)::text from certificados where id = :cert), row(47)::text, 'el ajuste resta');
select is(
  (select row(tipo::text, hojas, stock_resultante, nota)::text from movimientos_certificado
   where certificado_id = :cert order by id desc limit 1),
  row('ajuste', -3, 47, 'Hojas rotas')::text, 'el kardex registra el ajuste');
reset role;

-- El cajero no opera ni ve compras ni kardex
select pg_temp.como(:'cajero');
select throws_ok(format($$select ajustar_stock_certificado(%s, 1, 'x')$$, :cert), '42501', null,
  'un cajero no ajusta stock');
select is((select count(*)::int from compras_certificado), 0, 'un cajero no ve compras');
select is((select count(*)::int from movimientos_certificado), 0, 'un cajero no ve el kardex');
reset role;

-- Tope del stock acumulado (migración 020): mensaje claro en vez de desborde de integer
update certificados set hojas_por_unidad = 10000, stock_hojas = 999990000 where id = :cert;
select pg_temp.como(:'admin');
select lives_ok(format($$select registrar_compra_certificado(%s, 1, 100, 'transferencia')$$, :cert),
  'una compra que llega justo al tope se acepta');
select is((select stock_hojas from certificados where id = :cert), 1000000000, 'el stock queda en el tope');
select throws_ok(format($$select registrar_compra_certificado(%s, 1, 100, 'transferencia')$$, :cert),
  'P0001', 'El stock no puede superar las 1.000.000.000 hojas (stock actual: 1000000000 hojas)',
  'una compra que supera el tope se rechaza');
select throws_ok(format($$select ajustar_stock_certificado(%s, 1, 'Conteo')$$, :cert),
  'P0001', 'El stock no puede superar las 1.000.000.000 hojas (stock actual: 1000000000 hojas)',
  'un ajuste que supera el tope se rechaza');
reset role;
select throws_ok(format('update certificados set stock_hojas = 1000000001 where id = %s', :cert),
  '23514', null, 'la tabla tampoco admite superar el tope');

select * from finish();
rollback;
