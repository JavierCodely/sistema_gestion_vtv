begin;
\ir _helpers.psql
select plan(45);

select * from pg_temp.escenario() \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset
select id as cafe from categorias_gasto where nombre = 'Café y bebidas' \gset
select id as papeleria from categorias_gasto where nombre = 'Papelería' \gset
select id as rubro_insumos from categorias_gasto where nombre = 'Insumos' and padre_id is null \gset
select id as compra_cert from categorias_gasto where sistema = 'compra_certificados' \gset

-- Privilegios -------------------------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.categorias_gasto', 'DELETE'),
  'nadie borra categorías de gasto directo: solo con eliminar_categoria_gasto');
select ok(has_function_privilege('authenticated', 'public.eliminar_categoria_gasto(bigint)', 'EXECUTE'),
  'authenticated ejecuta eliminar_categoria_gasto');
select ok(has_function_privilege('authenticated',
  'public.corregir_gasto(bigint, bigint, numeric, public.fuente_fondos, text, text)', 'EXECUTE'),
  'authenticated ejecuta corregir_gasto');

-- Datos: un rubro vacío, uno con una subcategoría usada y otra sin usar ---------------------------------
insert into categorias_gasto (nombre) values ('Rubro vacío') returning id as rubro_vacio \gset
insert into categorias_gasto (nombre, padre_id) values ('Sub vacía 1', :rubro_vacio);
insert into categorias_gasto (nombre, padre_id) values ('Sub vacía 2', :rubro_vacio);
insert into categorias_gasto (nombre) values ('Rubro usado') returning id as rubro_usado \gset
insert into categorias_gasto (nombre, padre_id) values ('Sub usada', :rubro_usado) returning id as sub_usada \gset
insert into categorias_gasto (nombre, padre_id) values ('Sub libre', :rubro_usado) returning id as sub_libre \gset

select pg_temp.como(:'admin');
select movimiento_efectivo('fondo_inicial', 10000, 'Fondo');
select registrar_gasto(:sub_usada, 100, 'transferencia', 'Usada') ;
reset role;

-- Eliminar categorías -----------------------------------------------------------------------------------
select pg_temp.como(:'cajero');
select throws_ok(format('select eliminar_categoria_gasto(%s)', :sub_libre), '42501', null,
  'el cajero no elimina categorías');
select is((select count(*)::int from categorias_gasto where id = :sub_libre), 1, 'sigue la subcategoría');
reset role;

select pg_temp.como(:'admin');
select throws_ok(format('delete from categorias_gasto where id = %s', :sub_libre), '42501', null,
  'el admin tampoco borra directo en la tabla');
select throws_ok('select eliminar_categoria_gasto(999999)', '22023', 'La categoría de gasto no existe',
  'una categoría que no existe');
select throws_ok(format('select eliminar_categoria_gasto(%s)', :compra_cert), '42501',
  'La categoría "Compra de certificados" la usa el sistema y no se puede eliminar',
  'la categoría del sistema no se elimina');
select throws_ok(format('select eliminar_categoria_gasto(%s)', :rubro_insumos), 'P0001',
  'El rubro "Insumos" tiene la subcategoría automática "Compra de certificados": no se puede eliminar',
  'ni el rubro que la contiene');
select throws_ok(format('select eliminar_categoria_gasto(%s)', :sub_usada), 'P0001',
  'La subcategoría "Sub usada" ya tiene gastos: desactivala en vez de eliminarla',
  'una subcategoría con gastos no se elimina');
select throws_ok(format('select eliminar_categoria_gasto(%s)', :rubro_usado), 'P0001',
  'El rubro "Rubro usado" ya tiene gastos en "Sub usada": desactivalo en vez de eliminarlo',
  'un rubro con gastos en una subcategoría no se elimina');
select is((select count(*)::int from categorias_gasto where padre_id = :rubro_usado), 2,
  'el rechazo no borra nada del rubro');
select is((eliminar_categoria_gasto(:sub_libre)).nombre, 'Sub libre',
  'una subcategoría sin gastos se elimina y devuelve la fila');
select is((select count(*)::int from categorias_gasto where id = :sub_libre), 0, 'ya no existe');
select is((eliminar_categoria_gasto(:rubro_vacio)).nombre, 'Rubro vacío',
  'un rubro sin gastos se elimina');
select is((select count(*)::int from categorias_gasto where id = :rubro_vacio or padre_id = :rubro_vacio), 0,
  'con sus subcategorías vacías');
reset role;

-- Corregir un gasto del admin (caja de cambio) ----------------------------------------------------------
-- La BD local puede traer saldo del seed: los saldos se comparan contra el de antes.
select saldo as s0 from caja_efectivo \gset
select pg_temp.como(:'admin');
select (registrar_gasto(:comida, 1000, 'efectivo', 'Almuerzo')).id as g1 \gset
reset role;
select is((select saldo from caja_efectivo), :s0::numeric - 1000, 'el gasto salió de la caja de cambio');
update gastos set creado_en = '2026-10-05 13:00-03' where id = :g1;

select pg_temp.como(:'cajero');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'efectivo', 'x', 'm')$$, :g1, :comida),
  '42501', null, 'el cajero no corrige gastos');
reset role;

select pg_temp.como(:'admin');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'efectivo', 'Almuerzo', '  ')$$, :g1, :comida),
  '22023', 'El motivo es obligatorio', 'el motivo es obligatorio');
select throws_ok(format($$select corregir_gasto(%s, %s, 0, 'efectivo', 'Almuerzo', 'm')$$, :g1, :comida),
  '22023', null, 'el monto se valida como siempre');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'efectivo', ' ', 'm')$$, :g1, :comida),
  '22023', 'La nota es obligatoria', 'la nota es obligatoria');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'efectivo', 'Almuerzo', 'm')$$, :g1, :rubro_insumos),
  '22023', 'Elegí una subcategoría, no un rubro', 'no se corrige a un rubro');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'efectivo', 'Almuerzo', 'm')$$, :g1, :compra_cert),
  '22023', null, 'ni a la categoría automática');
select throws_ok(format($$select corregir_gasto(%s, %s, %s, 'efectivo', 'Almuerzo', 'm')$$, :g1, :comida, :s0::numeric + 1),
  'P0001', null, 'si la caja de cambio no alcanza, se rechaza');
select is((select anulado from gastos where id = :g1), false, 'y el original queda como estaba');
select is((select saldo from caja_efectivo), :s0::numeric - 1000, 'sin mover efectivo');

select (corregir_gasto(:g1, :cafe, 1200, 'efectivo', 'Almuerzo y café', 'Era más')).id as g2 \gset
reset role;
select results_eq(
  format('select anulado, anulado_motivo, reemplazado_por from gastos where id = %s', :g1),
  format($$values (true, 'Era más'::text, %s::bigint)$$, :g2),
  'el original queda anulado con el motivo y enlazado al corregido');
select results_eq(
  format('select categoria_id, monto, fuente::text, nota, corrige_a, creado_en, usuario_id, turno_id from gastos where id = %s', :g2),
  format($$values (%s::bigint, 1200.00::numeric(12,2), 'efectivo', 'Almuerzo y café'::text, %s::bigint,
                   '2026-10-05 13:00-03'::timestamptz, %L::uuid, null::bigint)$$, :cafe, :g1, :'admin'),
  'el corregido trae los datos nuevos, la fecha y quién lo cargó del original');
select is((select saldo from caja_efectivo), :s0::numeric - 1200,
  'la caja de cambio: vuelven 1.000 y salen 1.200');
select is(
  (select array_agg(tipo::text || ' ' || monto::text order by id) from movimientos_efectivo
   where gasto_id in (:g1, :g2)),
  array['gasto -1000.00', 'anulacion_gasto 1000.00', 'gasto -1200.00'],
  'el libro de efectivo muestra la devolución y el gasto corregido');
select results_eq(
  format('select reemplazado_por, corrige_a from v_movimientos_caja where tipo = %L and id in (%s, %s) order by id',
    'gasto', :g1, :g2),
  format('values (%s::bigint, null::bigint), (null::bigint, %s::bigint)', :g2, :g1),
  'el historial trae los enlaces');

select pg_temp.como(:'admin');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'efectivo', 'x', 'm')$$, :g1, :comida),
  'P0001', 'El gasto ya estaba anulado: no se puede corregir', 'el original ya no se corrige');
select throws_ok(format('select corregir_gasto(999999, %s, 900, %L, %L, %L)', :comida, 'efectivo', 'x', 'm'),
  '22023', 'El gasto no existe', 'un gasto que no existe');
-- A transferencia: vuelve todo el efectivo
select (corregir_gasto(:g2, :cafe, 1200, 'transferencia', 'Almuerzo y café', 'Fue por transferencia')).id as g3 \gset
reset role;
select is((select saldo from caja_efectivo), :s0::numeric, 'pasado a transferencia, el efectivo vuelve');
select is((select corrige_a from gastos where id = :g3), :g2::bigint, 'una corrección se puede corregir');

-- Categoría desactivada: se puede dejar la del original, no pasar a otra desactivada --------------------
update categorias_gasto set activa = false where id = :cafe;
select pg_temp.como(:'admin');
select lives_ok(format($$select corregir_gasto(%s, %s, 1300, 'transferencia', 'Almuerzo', 'Monto')$$, :g3, :cafe),
  'se corrige el monto aunque su subcategoría esté desactivada');
select (registrar_gasto(:comida, 50, 'transferencia', 'Otro')).id as g4 \gset
select throws_ok(format($$select corregir_gasto(%s, %s, 50, 'transferencia', 'Otro', 'm')$$, :g4, :cafe),
  '22023', 'La categoría "Café y bebidas" está desactivada', 'pero no se pasa a una desactivada');
reset role;
update categorias_gasto set activa = true where id = :cafe;

-- Gasto automático de una compra ------------------------------------------------------------------------
insert into certificados (nombre, unidad_compra, hojas_por_unidad) values ('Hoja G', 'caja', 10)
  returning id as cert \gset
select pg_temp.como(:'admin');
select registrar_compra_certificado(:cert, 1, 1000, 'transferencia');
reset role;
select id as g_compra from gastos where categoria_id = :compra_cert order by id desc limit 1 \gset
select pg_temp.como(:'admin');
select throws_ok(format($$select corregir_gasto(%s, %s, 900, 'transferencia', 'x', 'm')$$, :g_compra, :comida),
  'P0001', 'Este gasto lo generó una compra de certificados: corregí la compra',
  'el gasto de una compra se corrige desde la compra');
reset role;

-- Gasto de un turno abierto: el cajón ------------------------------------------------------------------
-- abrir_turno_para deja la sesión como el cajero.
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 2000) as turno \gset
select (registrar_gasto(:papeleria, 300, 'efectivo', 'Resma', :turno)).id as gt \gset
reset role;
select is(_efectivo_en_caja(:turno), 1700.00::numeric, 'el gasto salió del cajón');
select saldo as saldo_antes from caja_efectivo \gset

select pg_temp.como(:'admin');
select throws_ok(format($$select corregir_gasto(%s, %s, 5000, 'efectivo', 'Resma', 'm')$$, :gt, :papeleria),
  'P0001', 'No hay suficiente efectivo en la caja del turno (disponible: $2.000,00, necesario: $5.000,00)',
  'si el cajón no alcanza, se rechaza');
select (corregir_gasto(:gt, :papeleria, 450, 'efectivo', 'Dos resmas', 'Eran dos')).id as gt2 \gset
reset role;
select is(_efectivo_en_caja(:turno), 1550.00::numeric, 'con el turno abierto, el cajón paga la diferencia');
select is((select saldo from caja_efectivo), :saldo_antes::numeric, 'la caja de cambio no se toca');
select results_eq(
  format('select turno_id, caja_id, usuario_id from gastos where id = %s', :gt2),
  format('values (%s::bigint, %s::bigint, %L::uuid)', :turno, :caja, :'cajero'),
  'el corregido queda en el mismo turno, caja y a nombre de quien lo cargó');

-- Turno cerrado: la corrección va contra la caja de cambio -----------------------------------------------
select pg_temp.como(:'admin');
select cerrar_turno(:turno, null);
select saldo as saldo_cierre from caja_efectivo \gset
select (corregir_gasto(:gt2, :papeleria, 400, 'efectivo', 'Dos resmas', 'Descuento')).id as gt3 \gset
reset role;
select is((select saldo from caja_efectivo), :saldo_cierre::numeric + 50,
  'con el turno cerrado: vuelven 450 a la caja de cambio y salen 400');
select is((select turno_id from gastos where id = :gt3), :turno::bigint,
  'el corregido sigue siendo de ese turno (historia)');

select * from finish();
rollback;
