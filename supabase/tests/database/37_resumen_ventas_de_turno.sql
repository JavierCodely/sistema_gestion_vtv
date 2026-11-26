-- Migración 50: total de ventas realizadas y anuladas de un turno (cajero: turno abierto; admin: cualquiera).
begin;
\ir _helpers.psql
select plan(11);

select * from pg_temp.escenario() \gset

select ok(has_function_privilege('authenticated', 'public.resumen_ventas_de_turno(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.resumen_ventas_de_turno(bigint)', 'execute'),
  'authenticated ve el resumen de ventas del turno; anon no');

select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select is((select row(r.*)::text from resumen_ventas_de_turno(:turno) r),
  row(0, 0.00, 0, 0.00)::text, 'un turno sin ventas da todo en 0');

select (registrar_venta(:turno, :servicio, 'efectivo', 'RT111AA')).id as v1 \gset
select registrar_venta(:turno, :servicio, 'tarjeta', 'RT222BB');
select registrar_venta(:turno, :servicio, null, 'RT333CC',
  '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":15000}]'::jsonb);
select anular_venta(:v1, 'Se cargó mal');
select is((select row(r.*)::text from resumen_ventas_de_turno(:turno) r),
  row(2, 40000.00, 1, 20000.00)::text,
  'el cajero ve cuántas ventas se realizaron y anularon y cuánto suman (mixta incluida)');
select throws_ok('select * from resumen_ventas_de_turno(999999)', '22023', 'El turno elegido no existe',
  'un turno inexistente se rechaza');
select throws_ok('select * from resumen_ventas_de_turno(null)', '22023',
  'Elegí la caja en la que estás trabajando', 'sin turno se rechaza');
reset role;

-- Otro turno: no se mezclan.
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja2, 100) as turno2 \gset
select registrar_venta(:turno2, :servicio, 'efectivo', 'RT444DD');
select is((select realizadas_cantidad from resumen_ventas_de_turno(:turno2)), 1,
  'cada turno cuenta solo sus ventas');
select is((select realizadas_cantidad from resumen_ventas_de_turno(:turno)), 2,
  'el primer turno no suma las del otro');
reset role;

-- Turno cerrado: solo el admin.
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
select is((select row(r.*)::text from resumen_ventas_de_turno(:turno) r),
  row(2, 40000.00, 1, 20000.00)::text, 'el admin ve el resumen de un turno cerrado');
select throws_ok('select * from resumen_ventas_de_turno(999999)', '22023', 'El turno elegido no existe',
  'al admin también se le rechaza un turno inexistente');
reset role;
select pg_temp.como(:'cajero');
select throws_ok(format('select * from resumen_ventas_de_turno(%s)', :turno), 'P0001',
  'El turno de la caja "Caja Test" ya se cerró: elegí una caja abierta',
  'el cajero no ve el resumen de un turno cerrado');
reset role;

select pg_temp.como_anonimo();
select throws_ok(format('select * from resumen_ventas_de_turno(%s)', :turno2), '42501', null,
  'anon no ve el resumen');
reset role;

select * from finish();
rollback;
