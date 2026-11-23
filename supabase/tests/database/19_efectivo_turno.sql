-- Migraciones 27 y 28: efectivo del cajón del turno contra la caja de cambio.
begin;
\ir _helpers.psql
select plan(9);

select * from pg_temp.escenario() \gset
select id as comida from categorias_gasto where nombre = 'Comida' \gset

-- El admin atiende una caja y paga un gasto con ese cajón (p_turno_id)
select pg_temp.abrir_turno_para(:'admin', :'admin', :caja, 1000) as turno_admin \gset
select throws_ok(format($$select registrar_gasto(%s, 1500, 'efectivo', 'x', %s)$$, :comida, :turno_admin), 'P0001',
  'No hay suficiente efectivo en la caja del turno (disponible: $1.000,00, necesario: $1.500,00)',
  'al admin se le dice cuánto hay en el cajón');
select (registrar_gasto(:comida, 1000, 'efectivo', 'Todo el cajón', :turno_admin)).id as gasto_turno \gset
reset role;
select is((select row(efectivo_en_caja, (select turno_id from gastos where id = :gasto_turno))::text
           from v_turnos where id = :turno_admin),
  row(0.00, :turno_admin)::text, 'el gasto del admin desde la caja sale de su cajón y queda en el turno');

-- Cierre con el cajón en $0: no hay nada que devolver
select pg_temp.como(:'admin');
select cerrar_turno(:turno_admin);
reset role;
select is((select count(*)::int from movimientos_efectivo where turno_id = :turno_admin and tipo = 'cierre_turno'),
  0, 'un cierre con el cajón vacío no genera movimiento');
select is((select efectivo_cierre from turnos where id = :turno_admin), 0.00::numeric,
  'la foto del cierre queda en $0');

-- Anular un gasto en efectivo de un turno ya cerrado: vuelve a la caja de cambio
select pg_temp.como(:'admin');
select anular_gasto(:gasto_turno, 'Se pagó con otra plata');
reset role;
select is((select saldo from caja_efectivo), 1000.00::numeric, 'con el turno cerrado, el gasto vuelve a la caja de cambio');
select is((select row(tipo::text, turno_id)::text from movimientos_efectivo where gasto_id = :gasto_turno),
  row('anulacion_gasto', null::bigint)::text, 'queda en el libro de la caja de cambio, sin turno');

-- Venta anulada después del cierre: la foto del cierre no cambia
select pg_temp.abrir_turno_para(:'admin', :'cajero', :caja2, 100) as turno_cajero \gset
select (registrar_venta(:turno_cajero, :servicio, 'efectivo')).id as venta \gset
reset role;
select pg_temp.como(:'admin');
select cerrar_turno(:turno_cajero);
reset role;
select (efectivo_cierre) as cierre from turnos where id = :turno_cajero \gset
select pg_temp.como(:'admin');
select anular_venta(:venta, 'Cobro duplicado');
reset role;
select is((select efectivo_en_caja from v_turnos where id = :turno_cajero), :cierre::numeric,
  'en un turno cerrado, el efectivo es lo que volvió al cerrar aunque después se anule una venta');
select is((select saldo from caja_efectivo), 1000.00::numeric + :cierre::numeric - (select precio from ventas where id = :venta),
  'la anulación posterior sale de la caja de cambio');

-- Turnos anteriores al efectivo por turno: sin efectivo inicial ni de cierre
insert into turnos (caja_id, usuario_id, abierto_en, cerrado_en)
values (:caja, :'cajero', now() - interval '2 days', now() - interval '1 day')
returning id as turno_viejo \gset
select is((select row(efectivo_inicial, efectivo_en_caja)::text from v_turnos where id = :turno_viejo),
  row(null::numeric, null::numeric)::text, 'un turno anterior a la migración 27 no tiene efectivo de caja');

select * from finish();
rollback;
