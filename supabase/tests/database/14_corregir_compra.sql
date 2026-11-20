begin;
\ir _helpers.psql
select plan(22);

select * from pg_temp.escenario() \gset

select pg_temp.como(:'admin');
insert into certificados (nombre, hojas_por_unidad) values ('Hoja corrección', 25) returning id as cert \gset
select movimiento_efectivo('fondo_inicial', 100000, 'Fondo');

-- Compra A (transferencia): 2 cajas × 1000 → 50 hojas a $40
select id as compra_a from registrar_compra_certificado(:cert, 2, 1000, 'transferencia') \gset
-- Compra B (efectivo): 1 caja × 2000 → 75 hojas, promedio (2000 + 2000) / 75
select id as compra_b, gasto_id as gasto_b from registrar_compra_certificado(:cert, 1, 2000, 'efectivo') \gset
select is((select saldo from caja_efectivo), 98000.00::numeric, 'la compra B salió del efectivo');

-- Reglas
select throws_ok(format($$select corregir_compra_certificado(%s, 1, 1, 'transferencia', null, 'x')$$, :compra_a),
  'P0001', 'Solo se puede editar la última compra de un certificado, sin ventas ni ajustes posteriores. Corregí la diferencia con un ajuste de stock.',
  'solo se corrige la última compra del certificado');
select throws_ok(format($$select corregir_compra_certificado(%s, 1, 1, 'transferencia', null, '  ')$$, :compra_b),
  null, 'Escribí el motivo de la corrección', 'el motivo es obligatorio');
select throws_ok(format($$select corregir_compra_certificado(%s, 0, 1, 'transferencia', null, 'x')$$, :compra_b),
  '22023', 'La cantidad debe ser entre 1 y 100.000', 'la compra corregida se valida igual que una nueva');
select is((select stock_hojas from certificados where id = :cert), 75, 'un intento rechazado no cambia nada');
reset role;

select pg_temp.como(:'cajero');
select throws_ok(format($$select corregir_compra_certificado(%s, 1, 1, 'transferencia', null, 'x')$$, :compra_b),
  '42501', null, 'un cajero no corrige compras');
reset role;

-- Corrección: B pasa a 3 cajas × 1500 por transferencia
select pg_temp.como(:'admin');
select id as compra_c, gasto_id as gasto_c from corregir_compra_certificado(
  :compra_b, 3, 1500, 'transferencia', ' Imprenta Sur ', ' Error de carga ') \gset
select is((select row(unidades, hojas, costo_total, fuente::text, proveedor, anulada)::text
           from compras_certificado where id = :compra_c),
  row(3, 75, 4500.00, 'transferencia', 'Imprenta Sur', false)::text, 'la compra corregida queda registrada');
select is((select row(anulada, anulada_motivo, reemplazada_por)::text from compras_certificado where id = :compra_b),
  row(true, 'Error de carga', :compra_c)::text, 'la original queda anulada, con motivo y enlazada a la nueva');
select ok((select anulada_por is not null and anulada_en is not null from compras_certificado where id = :compra_b),
  'se registra quién y cuándo corrigió');
select is((select row(anulado, anulado_motivo)::text from gastos where id = :gasto_b),
  row(true, format('Corrección de compra #%s: Error de carga', :compra_b))::text, 'el gasto original se anula');
select is((select row(anulado, monto)::text from gastos where id = :gasto_c),
  row(false, 4500.00)::text, 'la corregida genera su propio gasto');
select is((select saldo from caja_efectivo), 100000.00::numeric, 'el efectivo de la original vuelve a la caja');
select is((select row(stock_hojas, costo_promedio)::text from stock_certificados_valorizado() where id = :cert),
  row(125, 52.00)::text, 'stock y costo promedio quedan como si la original nunca hubiera existido');
select is(
  (select array_agg(row(tipo::text, hojas, stock_resultante, costo_promedio_resultante)::text order by id)
   from movimientos_certificado where certificado_id = :cert),
  array[
    row('compra', 50, 50, 40.0000)::text,
    row('compra', 25, 75, 53.3333)::text,
    row('anulacion_compra', -25, 50, 40.0000)::text,
    row('compra', 75, 125, 52.0000)::text
  ], 'el kardex muestra la reversión y la compra corregida');
select throws_ok(format($$select corregir_compra_certificado(%s, 1, 1, 'transferencia', null, 'x')$$, :compra_b),
  'P0001', 'Esta compra ya fue corregida o anulada', 'una compra corregida no se vuelve a corregir');

-- La corregida se puede volver a corregir (sigue siendo la última), ahora en efectivo
select id as compra_d from corregir_compra_certificado(:compra_c, 1, 500, 'efectivo', null, 'Era una sola caja') \gset
select is((select saldo from caja_efectivo), 99500.00::numeric, 'pagar la corregida en efectivo lo descuenta');
select is((select row(stock_hojas, costo_promedio)::text from stock_certificados_valorizado() where id = :cert),
  row(75, 33.33)::text, 'stock y promedio con la segunda corrección');

-- Sin efectivo suficiente: se rechaza y no queda nada a medias
select throws_ok(format($$select corregir_compra_certificado(%s, 100, 100000, 'efectivo', null, 'x')$$, :compra_d),
  'P0001', null, 'sin efectivo suficiente la corrección se rechaza');
select is((select row(stock_hojas, anulada)::text from certificados c join compras_certificado k on k.id = :compra_d
           where c.id = :cert), row(75, false)::text, 'el rechazo no deja la original anulada');

-- Con un movimiento posterior ya no se puede editar
select ajustar_stock_certificado(:cert, -1, 'Rotura');
select throws_ok(format($$select corregir_compra_certificado(%s, 1, 500, 'efectivo', null, 'x')$$, :compra_d),
  'P0001', null, 'después de un ajuste la compra ya no se edita');

-- El gasto de sistema sigue sin poder anularse a mano
select throws_ok(format($$select anular_gasto(%s, 'x')$$, :gasto_c), 'P0001', null,
  'el gasto de una compra no se anula a mano');
reset role;

select is(has_function_privilege('authenticated',
  'public._registrar_compra(public.certificados, integer, integer, numeric, public.fuente_fondos, text)', 'execute'),
  false, 'la función interna no es ejecutable por usuarios');

select * from finish();
rollback;
