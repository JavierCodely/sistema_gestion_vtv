-- Migración 53: certificados y servicios de un turno (ventana "Certificados y servicios").
begin;
\ir _helpers.psql
select plan(18);

select * from pg_temp.escenario() \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio T2', :categoria, 15000, true) returning id as serv2 \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado)
  values ('Servicio T3 sin ventas', :categoria, 9000, true) returning id as serv3 \gset
insert into servicios (nombre, categoria_id, precio, requiere_certificado, activo)
  values ('Servicio T4 desactivado', :categoria, 5000, true, false) returning id as serv4 \gset
insert into certificados (todos_servicios, nombre, hojas_por_unidad)
  values (true, 'Hoja Turno', 10) returning id as cert \gset
select pg_temp.como(:'admin');
-- 4 hojas: la quinta venta del turno queda sin stock
select ajustar_stock_certificado(:cert, 4, 'Stock inicial');
reset role;

select ok(has_function_privilege('authenticated', 'public.certificados_servicios_de_turno(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.certificados_servicios_de_turno(bigint)', 'execute'),
  'authenticated ve los certificados y servicios del turno; anon no');
-- Migración 55: PostgREST corre las funciones `stable` en solo lectura y `_turno_para_trabajar`
-- bloquea el turno (`for share`): toda función que la use tiene que ser `volatile`.
select is((select array_agg(proname::text order by proname) from pg_proc
           where pronamespace = 'public'::regnamespace and proname <> '_turno_para_trabajar'
             and prosrc like '%_turno_para_trabajar%' and provolatile <> 'v'),
  null, 'las funciones que validan el turno con _turno_para_trabajar son volatile');

-- Ventas del cajero ---------------------------------------------------------------------------------
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja, 100) as turno \gset
select registrar_venta(:turno, :servicio, 'efectivo', 'CS111AA');
select registrar_venta(:turno, :servicio, 'transferencia', 'CS222BB');
select registrar_venta(:turno, :servicio, null, 'CS333CC',
  '[{"medio":"efectivo","monto":5000},{"medio":"transferencia","monto":15000}]'::jsonb);
select (registrar_venta(:turno, :servicio, 'efectivo', 'CS444DD')).id as anulada \gset
select anular_venta(:anulada, 'Se cargó mal');
select (registrar_venta(:turno, :serv2, 'efectivo', 'CS555EE')).id as sin_stock \gset
select is((select sin_stock from ventas where id = :sin_stock), true, 'la quinta venta quedó sin stock');

select is((select row(nombre, condicional, precio, cantidad, anuladas)::text
           from certificados_servicios_de_turno(:turno) where agrupacion = 'certificado' and id = :cert),
  row('Hoja Turno', false, null::numeric, 3, 1)::text,
  'certificado: 3 hojas entregadas y 1 de una venta anulada (la venta sin stock no entregó hoja)');
select is((select count(*)::int from certificados_servicios_de_turno(:turno) where agrupacion = 'certificado'), 1,
  'solo aparecen los certificados entregados en el turno');
select is((select row(categoria_nombre, precio, cantidad, anuladas, efectivo_cantidad, transferencia_cantidad,
                      efectivo_total, transferencia_total)::text
           from certificados_servicios_de_turno(:turno) where agrupacion = 'servicio' and id = :servicio),
  row('Categoría Test', 20000.00, 3, 1, 1, 1, null::numeric, null::numeric)::text,
  'servicio: 3 realizadas (la mixta no cuenta en efectivo ni en transferencia), 1 anulada y sin $ para el cajero');
select is((select row(precio, cantidad, efectivo_cantidad, transferencia_cantidad)::text
           from certificados_servicios_de_turno(:turno) where agrupacion = 'servicio' and id = :serv2),
  row(15000.00, 1, 1, 0)::text, 'una venta sin stock cuenta en el servicio');
select is((select row(precio, cantidad, anuladas, efectivo_cantidad, transferencia_cantidad)::text
           from certificados_servicios_de_turno(:turno) where agrupacion = 'servicio' and id = :serv3),
  row(9000.00, 0, 0, 0, 0)::text, 'un servicio activo sin ventas aparece en 0 con su precio');
select is((select count(*)::int from certificados_servicios_de_turno(:turno) where id = :serv4), 0,
  'un servicio desactivado sin ventas no aparece');
select is((select array_agg(distinct agrupacion order by agrupacion) from certificados_servicios_de_turno(:turno)),
  array['certificado', 'servicio'], 'solo certificados y servicios');
select is((select agrupacion from certificados_servicios_de_turno(:turno) limit 1), 'certificado',
  'primero los certificados');
select throws_ok('select * from certificados_servicios_de_turno(null)', '22023',
  'Elegí la caja en la que estás trabajando', 'el cajero tiene que indicar el turno');
reset role;

-- Otro turno no se mezcla
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja2, 100) as turno2 \gset
select is((select count(*)::int from certificados_servicios_de_turno(:turno2) where cantidad > 0 or anuladas > 0), 0,
  'otro turno no cuenta las ventas del primero');
reset role;

-- Admin: totales en $ y turno cerrado; un servicio vendido y desactivado después sigue apareciendo
update servicios set activo = false where id = :serv2;
select pg_temp.como(:'admin');
select cerrar_turno(:turno);
select is((select row(efectivo_total, transferencia_total)::text
           from certificados_servicios_de_turno(:turno) where agrupacion = 'servicio' and id = :servicio),
  row(20000.00, 20000.00)::text, 'el admin ve lo cobrado en efectivo y por transferencia (sin mixtas ni anuladas)');
select is((select cantidad from certificados_servicios_de_turno(:turno) where agrupacion = 'servicio' and id = :serv2), 1,
  'un servicio desactivado que se vendió en el turno sigue apareciendo');
select throws_ok('select * from certificados_servicios_de_turno(999999)', '22023', 'El turno elegido no existe',
  'un turno inexistente se rechaza');
reset role;

select pg_temp.como(:'cajero');
select throws_ok(format('select * from certificados_servicios_de_turno(%s)', :turno), 'P0001',
  'El turno de la caja "Caja Test" ya se cerró: elegí una caja abierta',
  'el cajero no ve un turno cerrado');
reset role;

select pg_temp.como_anonimo();
select throws_ok(format('select * from certificados_servicios_de_turno(%s)', :turno2), '42501', null,
  'anon no ve la ventana');
reset role;

select * from finish();
rollback;
