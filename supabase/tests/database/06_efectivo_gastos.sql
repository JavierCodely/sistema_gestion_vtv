begin;
\ir _helpers.psql
select plan(25);

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
select is((select saldo from caja_efectivo), 0.00::numeric, 'un cajero puede ver el saldo de efectivo');
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
  'P0001', 'Necesitás un turno abierto para registrar gastos', 'el cajero necesita turno abierto');
select abrir_turno(:caja);
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', 'Sueldo')$$, :sueldos),
  '42501', 'La categoría "Sueldos" no está habilitada para la caja', 'el cajero solo usa categorías habilitadas');
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', '  ')$$, :comida),
  '22023', 'La nota es obligatoria', 'la nota del gasto es obligatoria');
select throws_ok(format($$select registrar_gasto(%s, 500, 'efectivo', 'x')$$, :rubro_insumos),
  '22023', 'Elegí una subcategoría, no un rubro', 'el gasto va a una subcategoría');
select throws_ok(format($$select registrar_gasto(%s, 50000, 'efectivo', 'Mucha comida')$$, :comida),
  'P0001', null, 'un gasto en efectivo no puede dejar la caja en negativo');
select (registrar_gasto(:comida, 500, 'efectivo', 'Café para el equipo')).id as gasto1 \gset
select (registrar_gasto(:comida, 800, 'transferencia', 'Medialunas')).id as gasto2 \gset
reset role;

select is(
  (select row(usuario_id, caja_id, turno_id is not null)::text from gastos where id = :gasto1),
  row(:'cajero'::uuid, :caja::bigint, true)::text,
  'el gasto guarda usuario, caja y turno automáticamente');
select is((select saldo from caja_efectivo), 10000.00::numeric,
  'el gasto en efectivo resta de la caja de cambio; el de transferencia no');

-- Admin
select pg_temp.como(:'admin');
select throws_ok(format($$select registrar_gasto(%s, 100, 'transferencia', 'x')$$, :compra_cert),
  '22023', null, 'la compra de certificados no se carga a mano');
select lives_ok(format($$select registrar_gasto(%s, 100000, 'transferencia', 'Sueldo de marzo')$$, :sueldos),
  'el admin usa cualquier categoría, sin turno');
select lives_ok(format($$select anular_gasto(%s, 'Cargado por error')$$, :gasto1), 'el admin anula un gasto');
reset role;
select is((select saldo from caja_efectivo), 10500.00::numeric, 'anular un gasto en efectivo devuelve el dinero');

select pg_temp.como(:'cajero');
select throws_ok(format($$select anular_gasto(%s, 'x')$$, :gasto2), '42501', null, 'un cajero no anula gastos');
select is((select count(*)::int from gastos), 2, 'un cajero solo ve sus gastos');
reset role;

select * from finish();
rollback;
