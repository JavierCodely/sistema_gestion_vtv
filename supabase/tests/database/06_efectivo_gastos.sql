begin;
\ir _helpers.psql
select plan(32);

select * from pg_temp.escenario() \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset
select id as sueldos from categorias_gasto where nombre = 'Sueldos' \gset
select id as rubro_insumos from categorias_gasto where nombre = 'Insumos' and padre_id is null \gset
select id as compra_cert from categorias_gasto where sistema = 'compra_certificados' \gset

-- Precarga de categorías
select is(
  (select array_agg(nombre order by id) from categorias_gasto where padre_id is null),
  array['Insumos', 'Limpieza', 'Personal', 'Comida y refrigerio', 'Servicios', 'Mantenimiento',
        'Impuestos y tasas', 'Administración', 'Varios'],
  'los 9 rubros vienen precargados');
select is(
  (select r.nombre from categorias_gasto s join categorias_gasto r on r.id = s.padre_id where s.id = :compra_cert),
  'Insumos', 'existe Insumos › Compra de certificados');

-- Dos niveles
select throws_ok(format($$insert into categorias_gasto (nombre, padre_id) values ('Nieta', %s)$$, :comida),
  '22023', null, 'no se permiten tres niveles');
select throws_ok($$insert into categorias_gasto (nombre, habilitada_caja) values ('Rubro hab', true)$$,
  '23514', null, 'solo las subcategorías se habilitan para caja');
select throws_ok(format('delete from categorias_gasto where id = %s', :compra_cert),
  '42501', null, 'la categoría de sistema no se borra');

-- Caja de efectivo: movimientos del admin
select pg_temp.como(:'cajero');
select throws_ok($$select movimiento_efectivo('ingreso', 100, 'x')$$, '42501', null,
  'un cajero no mueve la caja de efectivo a mano');
select is((select count(*)::int from caja_efectivo), 0, 'un cajero no ve el saldo de efectivo (migración 26)');
reset role;

select pg_temp.como(:'admin');
select throws_ok($$select movimiento_efectivo('retiro', 100, 'Sin fondos')$$, 'P0001', null,
  'no se puede retirar más de lo que hay');
select throws_ok($$select movimiento_efectivo('ingreso', 100, null)$$, '22023', 'La nota es obligatoria',
  'los movimientos de efectivo exigen nota');
select throws_ok($$select movimiento_efectivo('venta', 100, 'x')$$, '22023', null,
  'el admin no puede inventar movimientos de venta');
select movimiento_efectivo('fondo_inicial', 10000, 'Fondo de cambio');
select movimiento_efectivo('ingreso', 2000, 'Cambio extra');
select movimiento_efectivo('retiro', 1500, 'Depósito');
reset role;
select is((select saldo from caja_efectivo), 10500.00::numeric, 'fondo + ingreso − retiro');
select is((select count(*)::int from movimientos_efectivo), 3, 'cada movimiento queda en el libro');

-- Gastos del cajero
select pg_temp.como(:'cajero');
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', 'Café')$$, :comida),
  '22023', 'Elegí la caja en la que estás trabajando', 'el cajero tiene que elegir el turno de una caja');
reset role;
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 2000) as turno \gset
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', 'Sueldo', %s)$$, :sueldos, :turno),
  '42501', 'La categoría "Sueldos" no está habilitada para la caja', 'el cajero solo usa categorías habilitadas');
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', '  ', %s)$$, :comida, :turno),
  '22023', 'La nota es obligatoria', 'la nota del gasto es obligatoria');
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', 'x', %s)$$, :rubro_insumos, :turno),
  '22023', 'Elegí una subcategoría, no un rubro', 'el gasto va a una subcategoría');
select throws_ok(format($$select registrar_gasto(%s, 2000.01, 'efectivo', 'Mucha comida', %s)$$, :comida, :turno),
  'P0001', 'No hay suficiente efectivo en la caja para este gasto. Avisale al administrador',
  'un gasto en efectivo no puede dejar el cajón del turno en negativo (sin mostrarle montos al cajero)');
select (registrar_gasto(:comida, 500, 'efectivo', 'Café para el equipo', :turno)).id as gasto1 \gset
select (registrar_gasto(:comida, 800, 'transferencia', 'Medialunas', :turno)).id as gasto2 \gset
reset role;

select is(
  (select row(usuario_id, caja_id, turno_id is not null)::text from gastos where id = :gasto1),
  row(:'cajero'::uuid, :caja::bigint, true)::text,
  'el gasto guarda usuario, caja y turno automáticamente');
select is((select row(efectivo_en_caja, (select saldo from caja_efectivo))::text
           from v_turnos where id = :turno),
  row(1500.00, 10500.00)::text,
  'el gasto en efectivo del cajero sale del cajón del turno (no de la caja general); el de transferencia no');

-- Admin
select pg_temp.como(:'admin');
select throws_ok(format($$select registrar_gasto(%s, 100, 'transferencia', 'x')$$, :compra_cert),
  '22023', null, 'la compra de certificados no se carga a mano');
select lives_ok(format($$select registrar_gasto(%s, 100000, 'transferencia', 'Sueldo de marzo')$$, :sueldos),
  'el admin usa cualquier categoría, sin turno');
select lives_ok(format($$select anular_gasto(%s, 'Cargado por error')$$, :gasto1), 'el admin anula un gasto');
select (registrar_gasto(:comida, 300, 'efectivo', 'Limpieza de vidrios')).id as gasto_admin \gset
reset role;
select is((select row(efectivo_en_caja, (select saldo from caja_efectivo))::text
           from v_turnos where id = :turno),
  row(2000.00, 10200.00)::text,
  'anular con el turno abierto devuelve al cajón; el gasto del admin sale de la caja general');
select is((select turno_id from gastos where id = :gasto_admin), null,
  'el gasto del admin desde Gastos no se cuelga de ningún turno');

-- Un rubro desactivado bloquea sus subcategorías
update categorias_gasto set activa = false where id = (select padre_id from categorias_gasto where id = :comida);
select pg_temp.como(:'admin');
select throws_ok(format($$select registrar_gasto(%s, 100, 'transferencia', 'x')$$, :comida),
  '22023', 'El rubro de la categoría "Comida" está desactivado', 'no se carga un gasto en un rubro desactivado');

-- Nombres de categorías: normalizados y únicos sin mayúsculas dentro del rubro
select lives_ok(format($$insert into categorias_gasto (nombre, padre_id) values ('  Agua   mineral ', %s)$$, :rubro_insumos),
  'el admin crea una subcategoría');
select is((select count(*)::int from categorias_gasto where nombre = 'Agua mineral'), 1,
  'el nombre se guarda sin espacios de más');
select throws_ok(format($$insert into categorias_gasto (nombre, padre_id) values ('agua MINERAL', %s)$$, :rubro_insumos),
  '23505', null, 'no se repite un nombre en el mismo rubro aunque cambien las mayúsculas');
select throws_ok($$insert into categorias_gasto (nombre) values ('varios')$$,
  '23505', null, 'tampoco se repite un rubro');
reset role;

select pg_temp.como(:'cajero');
select throws_ok(format($$select anular_gasto(%s, 'x')$$, :gasto2), '42501', null, 'un cajero no anula gastos');
select is((select count(*)::int from gastos), 2, 'un cajero solo ve los gastos de los turnos abiertos');
reset role;

-- El admin con turno abierto: sus gastos desde Gastos y las compras de certificados no van al turno
select pg_temp.abrir_turno_para(:'admin', :'admin', :caja2) as turno2 \gset
select (registrar_gasto(:sueldos, 100, 'transferencia', 'Aguinaldo')).id as gasto_general \gset
select (registrar_gasto(:sueldos, 100, 'transferencia', 'Desde la caja', :turno2)).id as gasto_turno \gset
reset role;
insert into certificados (todos_servicios, nombre, hojas_por_unidad) values (true, 'Hoja gastos', 10) returning id as cert \gset
select pg_temp.como(:'admin');
select (registrar_compra_certificado(:cert, 1, 1000, 'transferencia')).gasto_id as gasto_compra \gset
reset role;
select is(
  (select array_agg(turno_id is null order by id) from gastos
   where id in (:gasto_general, :gasto_turno, :gasto_compra)),
  array[true, false, true],
  'con turno abierto, el gasto desde Gastos y la compra de certificados no van al turno; desde la caja sí');

select * from finish();
rollback;
