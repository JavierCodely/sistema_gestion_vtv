begin;
\ir _helpers.psql
select plan(17);

select * from pg_temp.escenario() \gset
insert into certificados (nombre, hojas_por_unidad, stock_minimo) values ('Hoja VTV', 25, 10) returning id as cert \gset

-- Permisos
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_compra_certificado(%s, 4, 50000, 'transferencia')$$, :cert),
  '42501', 'Solo un administrador puede hacer esta operación', 'un cajero no registra compras');
reset role;

-- Compra del ejemplo: 4 cajas × 25 hojas a $50.000 la caja
select pg_temp.como(:'admin');
select lives_ok(format($$select registrar_compra_certificado(%s, 4, 50000, 'transferencia', 'Proveedor SA')$$, :cert),
  'el admin registra una compra');
reset role;

select is((select stock_hojas from certificados where id = :cert), 100, '4 cajas × 25 = 100 hojas');
select is((select costo_promedio from certificados where id = :cert), 2000.0000::numeric, '$50.000 / 25 = $2.000 por hoja');
select is(
  (select row(unidades, hojas, costo_total, costo_hoja, proveedor)::text from compras_certificado where certificado_id = :cert),
  row(4, 100, 200000.00, 2000.0000, 'Proveedor SA')::text,
  'la compra queda registrada con sus totales');
select is(
  (select row(c.sistema, g.monto, g.fuente::text)::text
   from compras_certificado k join gastos g on g.id = k.gasto_id join categorias_gasto c on c.id = g.categoria_id
   where k.certificado_id = :cert),
  row('compra_certificados', 200000.00, 'transferencia')::text,
  'la compra genera un gasto en Insumos › Compra de certificados');
select is(
  (select nota from gastos g join compras_certificado k on k.gasto_id = g.id where k.certificado_id = :cert),
  'Compra de 4 cajas de Hoja VTV (100 hojas) — Proveedor SA',
  'el gasto describe la compra');
select is(
  (select row(tipo::text, hojas, costo_unitario, stock_resultante)::text from movimientos_certificado where certificado_id = :cert),
  row('compra', 100, 2000.0000, 100)::text,
  'la compra queda en el kardex');
select is((select saldo from caja_efectivo), 0.00::numeric, 'una compra por transferencia no toca el efectivo');

-- Promedio ponderado: 100 hojas a $2.000 + 50 hojas a $2.600 → $2.200
select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 2, 65000, 'transferencia');
reset role;
select is((select costo_promedio from certificados where id = :cert), 2200.0000::numeric,
  'el costo promedio se pondera con el stock existente');

-- Compra en efectivo
select pg_temp.como(:'admin');
select throws_ok(format($$select registrar_compra_certificado(%s, 1, 50000, 'efectivo')$$, :cert),
  'P0001', null, 'sin efectivo suficiente la compra en efectivo se rechaza');
select movimiento_efectivo('fondo_inicial', 60000, 'Fondo');
select lives_ok(format($$select registrar_compra_certificado(%s, 1, 50000, 'efectivo')$$, :cert),
  'con saldo suficiente la compra en efectivo se registra');
reset role;
select is((select saldo from caja_efectivo), 10000.00::numeric, 'la compra en efectivo descuenta de la caja de cambio');
select is((select stock_hojas from certificados where id = :cert), 175, 'el stock suma todas las compras');

-- Ajustes
select pg_temp.como(:'admin');
select throws_ok(format($$select ajustar_stock_certificado(%s, -2, '  ')$$, :cert),
  '22023', 'La nota es obligatoria', 'el ajuste exige nota');
select throws_ok(format($$select ajustar_stock_certificado(%s, -500, 'Error')$$, :cert),
  'P0001', null, 'un ajuste no puede dejar stock negativo');
select ajustar_stock_certificado(:cert, -5, 'Hojas rotas');
reset role;
select is(
  (select row(stock_hojas, costo_promedio)::text from certificados where id = :cert),
  (select row(170, costo_promedio)::text from certificados where id = :cert),
  'el ajuste mueve el stock sin cambiar el costo promedio');

select * from finish();
rollback;
