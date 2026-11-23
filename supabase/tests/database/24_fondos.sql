-- Migración 34: Fondos (efectivo, transferencia, tarjeta y ventas mixtas informativas).
begin;
\ir _helpers.psql
select plan(77);

select * from pg_temp.escenario() \gset
select pg_temp.crear_usuario('admin2@test.local', 'admin') as admin2 \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset
insert into certificados (nombre, hojas_por_unidad) values ('Hoja Fondos', 10) returning id as cert \gset

-- Firmas y privilegios -------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated',
  'public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text)', 'execute')
  and has_function_privilege('authenticated', 'public.resumen_fondos(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.resumen_ventas_mixtas(date, date)', 'execute'),
  'authenticated ejecuta las RPC de fondos (el control es _exigir_admin)');
select ok(not has_function_privilege('anon',
  'public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text)', 'execute')
  and not has_function_privilege('anon', 'public.resumen_fondos(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.resumen_ventas_mixtas(date, date)', 'execute'),
  'anon no ejecuta las RPC de fondos');
select ok(not exists (
    select 1 from unnest(array['public.movimientos_fondos', 'public.cuentas_fondos']) t
    where has_table_privilege('authenticated', t, 'insert')
       or has_table_privilege('authenticated', t, 'update')
       or has_table_privilege('authenticated', t, 'delete')),
  'movimientos_fondos y cuentas_fondos no se escriben directo');

-- Punto de partida (como admin) ----------------------------------------------------------------------
select pg_temp.como(:'admin');
select
  sum(saldo) filter (where cuenta = 'efectivo')      as s0_ef,
  sum(saldo) filter (where cuenta = 'transferencia') as s0_tr,
  sum(saldo) filter (where cuenta = 'tarjeta')       as s0_ta,
  sum(saldo)                                         as s0_total
from resumen_fondos() \gset
select
  sum(ingresos) filter (where cuenta = 'transferencia') as h0_tr_ing,
  sum(egresos)  filter (where cuenta = 'transferencia') as h0_tr_egr
from resumen_fondos(fecha_local(now()), fecha_local(now())) \gset
select is((select array_agg(cuenta::text order by cuenta) from resumen_fondos()),
  array['efectivo', 'transferencia', 'tarjeta'],
  'resumen_fondos devuelve las tres cuentas (Mixto no es una cuenta)');
reset role;

-- Ventas del cajero: transferencia, tarjeta y mixta -------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select (registrar_venta(:turno, :servicio, 'transferencia', 'aa111aa')).id as v_tr \gset
select (registrar_venta(:turno, :servicio, 'tarjeta', p_patente => $p$AB123CD$p$)).id as v_ta \gset
select (registrar_venta(:turno, :servicio, p_pagos =>
  '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":7000},{"medio":"tarjeta","monto":8000}]', p_patente => $p$AB123CD$p$)).id as v_mx \gset

-- El cajero no ve nada de Fondos (aunque la RLS le deja leer las ventas del turno abierto)
select is((select count(*)::int from v_movimientos_fondos), 0, 'el cajero no ve el libro de fondos');
select is((select count(*)::int from v_ventas_mixtas), 0, 'el cajero no ve las ventas mixtas');
select is((select count(*)::int from movimientos_fondos) + (select count(*)::int from cuentas_fondos), 0,
  'el cajero no lee movimientos manuales ni cuentas');
select throws_ok('select * from resumen_fondos()', '42501', 'Solo un administrador puede hacer esta operación',
  'el cajero no ve los totales de fondos');
select throws_ok('select * from resumen_ventas_mixtas()', '42501', 'Solo un administrador puede hacer esta operación',
  'el cajero no ve el resumen de ventas mixtas');
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', 100, 'x')$$, '42501',
  'Solo un administrador puede hacer esta operación', 'el cajero no carga movimientos de fondos');
reset role;

-- Admin: venta pasada, gasto y compra por transferencia ---------------------------------------------
select pg_temp.como(:'admin');
select (registrar_venta_pasada('2026-11-01', '10:00', :caja, :servicio, 'transferencia', 15000)).id as v_pasada \gset
select (registrar_gasto(:comida, 3000, 'transferencia', 'Almuerzo pagado por transferencia')).id as g_tr \gset
select id as compra, gasto_id as g_compra from registrar_compra_certificado(:cert, 2, 1000, 'transferencia') \gset

select is((select array_agg(row(cuenta::text, origen, monto)::text order by cuenta) from v_movimientos_fondos where venta_id = :v_tr),
  array[row('transferencia', 'venta', 20000.00)::text], 'venta por transferencia: ingreso en transferencia');
select is((select descripcion from v_movimientos_fondos where venta_id = :v_tr),
  'Servicio Test — AA111AA', 'la descripción de una venta lleva servicio y patente');
select is((select array_agg(row(cuenta::text, origen, monto)::text order by cuenta) from v_movimientos_fondos where venta_id = :v_ta),
  array[row('tarjeta', 'venta', 20000.00)::text], 'venta con tarjeta: ingreso en tarjeta');
select is((select array_agg(row(cuenta::text, monto, pago_mixto)::text order by cuenta) from v_movimientos_fondos where venta_id = :v_mx),
  array[row('transferencia', 7000.00, true)::text, row('tarjeta', 8000.00, true)::text],
  'venta mixta: cada parte en su cuenta (el efectivo está en el cajón, no en la caja de cambio)');
select is((select row(cuenta::text, origen, monto, fecha_local, venta_pasada, usuario_nombre)::text
           from v_movimientos_fondos where venta_id = :v_pasada),
  row('transferencia', 'venta', 15000.00, '2026-11-01'::date, true, 'Usuario admin@test.local')::text,
  'venta pasada por transferencia: en su fecha (creado_en)');
select is((select row(cuenta::text, origen, sentido, monto, nota, descripcion)::text from v_movimientos_fondos where gasto_id = :g_tr),
  row('transferencia', 'gasto', 'egreso', -3000.00, 'Almuerzo pagado por transferencia', 'Comida y refrigerio › Comida')::text,
  'gasto por transferencia: egreso con su categoría');
select is((select array_agg(row(origen, monto, compra_id, gasto_id)::text) from v_movimientos_fondos
           where compra_id = :compra or gasto_id = :g_compra),
  array[row('compra', -2000.00, :compra, :g_compra)::text],
  'compra por transferencia: una sola fila (por su gasto), sin doble conteo');
select is((select descripcion from v_movimientos_fondos where compra_id = :compra),
  'Compra de certificados: Hoja Fondos', 'la compra muestra el certificado');
select is((select count(*)::int from v_movimientos_fondos where cuenta = 'tarjeta' and origen not in ('venta', 'venta_anulada', 'manual')),
  0, 'la tarjeta no tiene egresos automáticos');

select is((select row(saldo - :s0_tr)::text from resumen_fondos() where cuenta = 'transferencia'),
  row(37000.00)::text, 'saldo de transferencia: 20.000 + 7.000 + 15.000 − 3.000 − 2.000');
select is((select row(saldo - :s0_ta)::text from resumen_fondos() where cuenta = 'tarjeta'),
  row(28000.00)::text, 'saldo de tarjeta: 20.000 + 8.000');

-- Mixto (informativo) --------------------------------------------------------------------------------
select is((select row(id, caja_nombre, servicio_nombre, usuario_nombre, precio, pago_efectivo, pago_transferencia, pago_tarjeta, anulada)::text
           from v_ventas_mixtas where id = :v_mx),
  row(:v_mx, 'Caja Test', 'Servicio Test', 'Usuario cajero@test.local', 20000.00, 5000.00, 7000.00, 8000.00, false)::text,
  'v_ventas_mixtas: la venta con su reparto por medio');
select is((select pagos from v_ventas_mixtas where id = :v_mx),
  '[{"medio":"efectivo","monto":5000.00},{"medio":"transferencia","monto":7000.00},{"medio":"tarjeta","monto":8000.00}]'::jsonb,
  'v_ventas_mixtas: detalle de pagos en jsonb');
select is((select count(*)::int from v_ventas_mixtas where id in (:v_tr, :v_ta, :v_pasada)), 0,
  'las ventas de un solo medio no están en Mixto');
select is((select row(cantidad_ventas, total, total_efectivo, total_transferencia, total_tarjeta, incluido_en_cuentas)::text
           from resumen_ventas_mixtas(fecha_local(now()), fecha_local(now()))),
  row(1::bigint, 20000.00, 5000.00, 7000.00, 8000.00, true)::text,
  'resumen_ventas_mixtas: cantidad, total y reparto, marcado como ya incluido en las cuentas');
select is((select cantidad_ventas from resumen_ventas_mixtas('2026-11-01', '2026-11-01')), 0::bigint,
  'resumen_ventas_mixtas respeta el rango');
reset role;

-- Cierre del turno: el efectivo del cajón vuelve a la caja de cambio -------------------------------
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
select is((select row(origen, monto)::text from v_movimientos_fondos where cuenta = 'efectivo' and tipo = 'cierre_turno' and turno_id = :turno),
  row('cierre_turno', 5100.00)::text, 'efectivo: el cierre trae 100 iniciales + 5.000 de la parte en efectivo de la mixta');
-- Sin doble conteo: el total de todas las cuentas sube exactamente lo cobrado + el ingreso del turno − gastos.
-- Cobrado: 20.000 (transf.) + 20.000 (tarjeta) + 20.000 (mixta, repartida) + 15.000 (pasada) = 75.000;
-- ingreso de 100 para el turno (el helper), gastos 3.000 + 2.000.
select is((select sum(saldo) - :s0_total from resumen_fondos()), 70100.00::numeric,
  'el total de las cuentas cuenta la venta mixta una sola vez');
select is(
  (select sum(monto) from v_movimientos_fondos where venta_id = :v_mx)
  + (select sum(monto) from v_movimientos_fondos where tipo = 'cierre_turno' and turno_id = :turno) - 100,
  20000.00::numeric, 'las partes de la mixta en las cuentas suman su precio');

-- Efectivo en la vista unificada = movimientos_efectivo y caja_efectivo
select is((select row(count(*), sum(monto))::text from v_movimientos_fondos where cuenta = 'efectivo'),
  (select row(count(*), sum(monto))::text from movimientos_efectivo), 'efectivo: el libro unificado es movimientos_efectivo');
select is((select saldo from resumen_fondos() where cuenta = 'efectivo'),
  (select saldo::numeric(14,2) from caja_efectivo), 'efectivo: el saldo es el de la caja de cambio');
select ok((select bool_and(f.monto = m.monto and f.fecha = m.creado_en and f.tipo = m.tipo::text)
           from v_movimientos_fondos f join movimientos_efectivo m on f.movimiento_id = m.id
           where f.cuenta = 'efectivo'),
  'efectivo: mismas filas, montos, fechas y tipos');
reset role;

-- Anulaciones: venta, gasto, compra corregida y venta mixta -----------------------------------------
select pg_temp.como(:'admin');
select anular_venta(:v_tr, 'Cobro duplicado');
select anular_gasto(:g_tr, 'Se cargó dos veces');
select id as compra2, gasto_id as g_compra2 from corregir_compra_certificado(:compra, 3, 1000, 'transferencia', null, 'Eran tres cajas') \gset
select anular_venta(:v_mx, 'Cliente arrepentido');

select is((select array_agg(row(origen, monto, nota, usuario_nombre)::text order by monto desc) from v_movimientos_fondos where venta_id = :v_tr),
  array[row('venta', 20000.00, null, 'Usuario cajero@test.local')::text,
        row('venta_anulada', -20000.00, 'Cobro duplicado', 'Usuario admin@test.local')::text],
  'venta anulada: el original y su reverso (quién anuló y motivo)');
select is((select fecha from v_movimientos_fondos where venta_id = :v_tr and origen = 'venta_anulada'),
  (select anulada_en from ventas where id = :v_tr), 'el reverso de la venta va en la fecha de anulación');
select is((select array_agg(row(origen, monto)::text order by monto) from v_movimientos_fondos where gasto_id = :g_tr),
  array[row('gasto', -3000.00)::text, row('gasto_anulado', 3000.00)::text],
  'gasto anulado: el original y su reverso');
select is((select array_agg(row(origen, monto, compra_id)::text order by monto) from v_movimientos_fondos
           where compra_id in (:compra, :compra2)),
  array[row('compra', -3000.00, :compra2)::text, row('compra', -2000.00, :compra)::text,
        row('compra_anulada', 2000.00, :compra)::text],
  'compra corregida: la original, su reverso y la corregida');
select is((select array_agg(row(cuenta::text, origen, monto)::text order by cuenta, monto) from v_movimientos_fondos where venta_id = :v_mx),
  array[row('efectivo', 'venta_anulada', -5000.00)::text,
        row('transferencia', 'venta_anulada', -7000.00)::text, row('transferencia', 'venta', 7000.00)::text,
        row('tarjeta', 'venta_anulada', -8000.00)::text, row('tarjeta', 'venta', 8000.00)::text],
  'venta mixta anulada (turno cerrado): cada parte se revierte en su cuenta; el efectivo sale de la caja de cambio');
select is((select row(anulada, anulada_motivo)::text from v_ventas_mixtas where id = :v_mx),
  row(true, 'Cliente arrepentido')::text, 'Mixto muestra la venta anulada');
select is((select cantidad_ventas from resumen_ventas_mixtas()), 0::bigint,
  'resumen_ventas_mixtas no cuenta las anuladas');
select is((select row(saldo - :s0_tr)::text from resumen_fondos() where cuenta = 'transferencia'),
  row(12000.00)::text, 'saldo de transferencia: 37.000 − 20.000 + 3.000 + 2.000 − 3.000 − 7.000');
select is((select row(saldo - :s0_ta)::text from resumen_fondos() where cuenta = 'tarjeta'),
  row(20000.00)::text, 'saldo de tarjeta: 28.000 − 8.000');
-- En el día: ventas y sus anulaciones se compensan dentro de ingresos (no se cuentan dos veces).
select is((select row(ingresos - :h0_tr_ing, egresos - :h0_tr_egr)::text
           from resumen_fondos(fecha_local(now()), fecha_local(now())) where cuenta = 'transferencia'),
  row(0.00, 3000.00)::text, 'hoy en transferencia: ingresos 27.000 − 27.000 anulados; egresos 3.000 + 2.000 + 3.000 − 3.000 − 2.000');
reset role;

-- Movimientos manuales -------------------------------------------------------------------------------
select pg_temp.como(:'admin');
select is((select row(cuenta::text, origen, tipo, sentido, monto, nota, descripcion, usuario_nombre)::text
           from movimiento_fondos('tarjeta', 'fondo_inicial', 1000, '  Saldo al empezar  ')),
  row('tarjeta', 'manual', 'fondo_inicial', 'ingreso', 1000.00, 'Saldo al empezar', 'Saldo inicial', 'Usuario admin@test.local')::text,
  'saldo inicial manual: devuelve la fila del libro');
select is((select row(cuenta::text, tipo, monto)::text from movimiento_fondos('transferencia', 'ingreso', 500, 'Aporte')),
  row('transferencia', 'ingreso', 500.00)::text, 'ingreso manual');
select is((select row(cuenta::text, tipo, sentido, monto)::text from movimiento_fondos('tarjeta', 'retiro', 100, 'Retiro a banco')),
  row('tarjeta', 'retiro', 'egreso', -100.00)::text, 'retiro manual: resta');
select is((select row(saldo - :s0_ta)::text from resumen_fondos() where cuenta = 'tarjeta'),
  row(20900.00)::text, 'el saldo de tarjeta suma los manuales');
reset role;
select format('No alcanza el saldo de crédito/débito: hay $ %s y el retiro es de $ 1.000.000,00',
              public._pesos(:s0_ta + 20900)) as msg_retiro \gset
select pg_temp.como(:'admin');
select throws_ok($$select movimiento_fondos('tarjeta', 'retiro', 1000000, 'Demasiado')$$, 'P0001', :'msg_retiro',
  'un retiro manual no puede dejar el saldo negativo');
select lives_ok(format($$select movimiento_fondos('tarjeta', 'retiro', %s, 'Todo')$$, :s0_ta + 20900),
  'se puede retirar el saldo exacto');
select is((select saldo from resumen_fondos() where cuenta = 'tarjeta'), 0.00::numeric(14,2), 'la tarjeta queda en cero');

-- Un egreso automático nunca se rechaza: el saldo de transferencia puede quedar negativo
select lives_ok(format($$select registrar_gasto(%s, 9000000, 'transferencia', 'Gasto grande')$$, :comida),
  'un gasto por transferencia mayor al saldo se registra igual');
select ok((select saldo < 0 from resumen_fondos() where cuenta = 'transferencia'), 'el saldo de transferencia queda negativo');
select throws_ok($$select movimiento_fondos('transferencia', 'retiro', 1, 'Con saldo negativo')$$, 'P0001', null,
  'con saldo negativo no se puede retirar');

-- Validaciones
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', 'NaN', 'x')$$, '22023', 'El monto no es válido', 'NaN');
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', 0, 'x')$$, '22023', 'El monto debe ser mayor a cero', 'monto cero');
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', -5, 'x')$$, '22023', 'El monto debe ser mayor a cero', 'monto negativo');
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', 1.555, 'x')$$, '22023', 'El monto no puede tener más de 2 decimales', 'tres decimales');
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', 10, '   ')$$, '22023', 'La nota es obligatoria', 'nota vacía');
select throws_ok($$select movimiento_fondos('transferencia', 'ingreso', 10, null)$$, '22023', 'La nota es obligatoria', 'nota nula');
select throws_ok(format($$select movimiento_fondos('transferencia', 'ingreso', 10, '%s')$$, repeat('x', 501)), '22023',
  'La nota no puede superar los 500 caracteres', 'nota de más de 500');
select throws_ok($$select movimiento_fondos(null, 'ingreso', 10, 'x')$$, '22023',
  'Elegí la cuenta (efectivo, transferencia o tarjeta)', 'sin cuenta');
select throws_ok($$select movimiento_fondos('tarjeta', null, 10, 'x')$$, '22023', 'Elegí el tipo de movimiento', 'sin tipo');
select throws_ok($$insert into movimientos_fondos (cuenta, tipo, monto, nota, usuario_id) values ('tarjeta', 'ingreso', 1, 'x', auth.uid())$$,
  '42501', null, 'ni el admin inserta directo en movimientos_fondos');

-- Efectivo por la misma RPC: va a la caja de cambio (movimiento_efectivo)
select is((select row(cuenta::text, origen, tipo, monto, pago_mixto, venta_pasada)::text from movimiento_fondos('efectivo', 'ingreso', 50, 'Cambio')),
  row('efectivo', 'manual', 'ingreso', 50.00, false, false)::text, 'movimiento_fondos de efectivo usa la caja de cambio');
select is((select row(tipo::text, monto, nota)::text from movimientos_efectivo order by id desc limit 1),
  row('ingreso', 50.00, 'Cambio')::text, 'y queda en movimientos_efectivo');
select throws_ok($$select movimiento_fondos('efectivo', 'retiro', 99999999, 'Demasiado')$$, 'P0001', null,
  'un retiro de efectivo sin saldo se rechaza (regla de la caja de cambio)');
reset role;

-- resumen_fondos con rango y cuadre con el libro -----------------------------------------------------
-- Un ingreso manual de transferencia pasa al 10/10/2026 (hora AR).
update movimientos_fondos set creado_en = '2026-10-10 12:00-03' where nota = 'Aporte';
select pg_temp.como(:'admin');
select is((select row(ingresos, egresos, neto, cantidad_movimientos)::text from resumen_fondos('2026-10-10', '2026-10-10') where cuenta = 'transferencia'),
  row(500.00, 0.00, 500.00, 1::bigint)::text, 'resumen_fondos por rango (día de negocio)');
select is((select row(ingresos, egresos, neto, cantidad_movimientos)::text from resumen_fondos('2026-11-01', '2026-11-01') where cuenta = 'transferencia'),
  row(15000.00, 0.00, 15000.00, 1::bigint)::text, 'la venta pasada cuenta en su fecha');
select is((select total_transferencia from resumen_diario('2026-11-01', '2026-11-01')),
  (select ingresos from resumen_fondos('2026-11-01', '2026-11-01') where cuenta = 'transferencia'),
  'coincide con resumen_diario en un día sin anulaciones');
select ok((select bool_and(r.neto = coalesce((select sum(f.monto) from v_movimientos_fondos f
                                               where f.cuenta = r.cuenta and f.fecha_local = fecha_local(now())), 0))
           from resumen_fondos(fecha_local(now()), fecha_local(now())) r),
  'el neto del día cuadra con el libro en cada cuenta');
select ok((select bool_and(r.neto = r.saldo and r.neto = r.ingresos - r.egresos
                           and r.saldo = coalesce((select sum(f.monto) from v_movimientos_fondos f where f.cuenta = r.cuenta), 0))
           from resumen_fondos() r),
  'sin rango: neto = saldo = suma del libro = ingresos − egresos');
select ok((select count(*) = count(distinct clave) from v_movimientos_fondos), 'la clave del libro es única');
select throws_ok($$select * from resumen_fondos('2026-11-02', '2026-11-01')$$, '22023',
  'La fecha "desde" no puede ser posterior a "hasta"', 'rango invertido');
reset role;

-- Anónimo y desactivado ------------------------------------------------------------------------------
select pg_temp.como_anonimo();
select throws_ok('select * from v_movimientos_fondos', '42501', null, 'anon no lee el libro de fondos');
select throws_ok('select * from v_ventas_mixtas', '42501', null, 'anon no lee las ventas mixtas');
select throws_ok('select * from resumen_fondos()', '42501', null, 'anon no ejecuta resumen_fondos');
reset role;

update perfiles set activo = false where id = :'admin2';
select pg_temp.como(:'admin2');
select is((select count(*)::int from v_movimientos_fondos) + (select count(*)::int from v_ventas_mixtas), 0,
  'un admin desactivado no ve fondos');
select throws_ok($$select movimiento_fondos('tarjeta', 'ingreso', 10, 'x')$$, '42501',
  'Usuario no autenticado o desactivado', 'un admin desactivado no carga movimientos');
reset role;

select * from finish();
rollback;
