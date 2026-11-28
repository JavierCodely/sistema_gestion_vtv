-- =====================================================================
-- Migración 54: se quita la tarjeta (crédito/débito) como medio de pago (decisión del negocio,
-- 2026-11-27). Solo se cobra en **efectivo** o por **transferencia**, o mixto (efectivo +
-- transferencia).
--
-- Datos existentes (decisiones 2026-11-27):
--   * Toda parte cobrada con tarjeta pasa a transferencia: una venta "tarjeta" queda "transferencia";
--     una mixta efectivo + tarjeta queda efectivo + transferencia (el efectivo no cambia: ya entró al
--     cajón y a la caja de cambio, ningún cierre ni saldo de efectivo cambia). Si una venta ya tenía
--     transferencia y tarjeta, las dos partes se suman; si así queda con un solo medio, deja de ser
--     mixta (`ventas.medio_pago` = ese medio).
--   * La foto de impuestos (`venta_impuestos`) se mueve igual (sin recalcular: los montos no cambian),
--     y los impuestos que alcanzaban a tarjeta pasan a alcanzar a transferencia.
--   * Los cierres de turno suman su `total_tarjeta` a `total_transferencia` y la columna se quita.
--   * Fondos: la cuenta Crédito/Débito se suma a Transferencia (sus movimientos manuales pasan a
--     transferencia; las ventas ya pasaron arriba). Queda el libro de dos cuentas: efectivo y
--     transferencia.
--
-- Esquema: Postgres no permite quitar un valor de un enum. Se crean `medio_pago` y `cuenta_fondos`
-- nuevos sin 'tarjeta' (los viejos se renombran y se borran). Las vistas y funciones que dependen de
-- esos tipos se borran y se vuelven a crear: las que tenían tarjeta, reescritas acá sin ella; las que
-- no (`registrar_venta`, `registrar_venta_pasada`, `v_movimientos_caja`) se recrean con su definición
-- actual leída de la base, idéntica salvo el tipo nuevo. Sin tarjeta salen de las firmas:
-- `v_turnos.total_tarjeta`/`ventas_tarjeta`, `v_ventas_mixtas.pago_tarjeta`,
-- `resumen_turnos.ventas_tarjeta`, `resumen_ventas_mixtas.total_tarjeta`,
-- `resumen_diario.total_tarjeta`, `resumen_impuestos.total_tarjeta` y la fila 'tarjeta' de
-- `resumen_fondos`.
-- =====================================================================

-- 1. Datos -----------------------------------------------------------------------------------------

-- Cobro: la tarjeta se suma a la transferencia de la misma venta, si tenía.
update public.venta_pagos t
set monto = t.monto + k.monto
from public.venta_pagos k
where k.venta_id = t.venta_id and k.medio = 'tarjeta' and t.medio = 'transferencia';

delete from public.venta_pagos k
where k.medio = 'tarjeta'
  and exists (select 1 from public.venta_pagos t where t.venta_id = k.venta_id and t.medio = 'transferencia');

update public.venta_pagos set medio = 'transferencia' where medio = 'tarjeta';

update public.ventas set medio_pago = 'transferencia' where medio_pago = 'tarjeta';

-- Mixtas transferencia + tarjeta: ahora tienen un solo medio.
update public.ventas v
set medio_pago = (select p.medio from public.venta_pagos p where p.venta_id = v.id)
where v.medio_pago is null
  and (select count(*) from public.venta_pagos p where p.venta_id = v.id) = 1;

-- Foto de impuestos: mismo movimiento, sumando base y monto.
update public.venta_impuestos t
set base = t.base + k.base, monto = t.monto + k.monto
from public.venta_impuestos k
where k.venta_id = t.venta_id and k.impuesto_id = t.impuesto_id
  and k.medio = 'tarjeta' and t.medio = 'transferencia';

delete from public.venta_impuestos k
where k.medio = 'tarjeta'
  and exists (select 1 from public.venta_impuestos t
              where t.venta_id = k.venta_id and t.impuesto_id = k.impuesto_id and t.medio = 'transferencia');

update public.venta_impuestos set medio = 'transferencia' where medio = 'tarjeta';

-- Catálogo de impuestos: tarjeta → transferencia, sin repetir.
update public.impuestos i
set medios = array(select distinct m
                   from unnest(array_replace(i.medios, 'tarjeta'::public.medio_pago,
                                             'transferencia'::public.medio_pago)) m
                   order by m)
where 'tarjeta' = any (i.medios);

-- Foto de los cierres.
update public.turnos
set total_transferencia = coalesce(total_transferencia, 0) + total_tarjeta
where total_tarjeta is not null and total_tarjeta <> 0;

-- Fondos: Crédito/Débito se suma a Transferencia.
update public.movimientos_fondos set cuenta = 'transferencia' where cuenta = 'tarjeta';
delete from public.cuentas_fondos where cuenta = 'tarjeta';

-- Revisa ya la coherencia ventas ↔ pagos (triggers diferidos): ALTER TABLE no corre con eventos
-- de trigger pendientes.
set constraints all immediate;

-- 2. Definiciones que se recrean tal cual -------------------------------------------------------------
create temp table _recrear (orden int, sentencia text);

insert into _recrear
select 1, pg_get_functiondef(
  'public.registrar_venta(bigint,bigint,public.medio_pago,text,jsonb,bigint,numeric,boolean,boolean,bigint)'::regprocedure)
union all
select 2, pg_get_functiondef(
  'public.registrar_venta_pasada(date,time without time zone,bigint,bigint,public.medio_pago,numeric,text)'::regprocedure)
union all
select 3, 'create view public.v_movimientos_caja with (security_invoker = true) as '
          || pg_get_viewdef('public.v_movimientos_caja'::regclass);

-- 3. Se borra lo que depende de los tipos viejos ----------------------------------------------------
drop function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric,
                                     boolean, boolean, bigint);
drop function public.registrar_venta_pasada(date, time without time zone, bigint, bigint,
                                            public.medio_pago, numeric, text);
drop function public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text);
drop function public.resumen_fondos(date, date);
drop function public.resumen_turnos(date, date);
drop function public.resumen_ventas_mixtas(date, date);
drop function public.resumen_diario(date, date);
drop function public.resumen_impuestos(date, date, bigint);
drop view public.v_movimientos_fondos;
drop view public.v_ventas_mixtas;
drop view public.v_turnos;
drop view public.v_movimientos_caja;

drop trigger ventas_pagos_coherentes on public.ventas;
alter table public.impuestos drop constraint impuestos_medios_validos;
alter table public.impuestos alter column medios drop default;
alter table public.movimientos_fondos drop constraint movimientos_fondos_cuenta_no_efectivo;

alter table public.turnos drop column total_tarjeta;

-- 4. Tipos nuevos ---------------------------------------------------------------------------------
alter type public.medio_pago rename to medio_pago_con_tarjeta;
create type public.medio_pago as enum ('efectivo', 'transferencia');

alter table public.ventas
  alter column medio_pago type public.medio_pago using medio_pago::text::public.medio_pago;
alter table public.venta_pagos
  alter column medio type public.medio_pago using medio::text::public.medio_pago;
alter table public.venta_impuestos
  alter column medio type public.medio_pago using medio::text::public.medio_pago;
alter table public.impuestos
  alter column medios type public.medio_pago[] using medios::text[]::public.medio_pago[];

drop type public.medio_pago_con_tarjeta;

alter type public.cuenta_fondos rename to cuenta_fondos_con_tarjeta;
create type public.cuenta_fondos as enum ('efectivo', 'transferencia');

alter table public.cuentas_fondos
  alter column cuenta type public.cuenta_fondos using cuenta::text::public.cuenta_fondos;
alter table public.movimientos_fondos
  alter column cuenta type public.cuenta_fondos using cuenta::text::public.cuenta_fondos;

drop type public.cuenta_fondos_con_tarjeta;

-- 5. Restricciones y trigger ------------------------------------------------------------------------
alter table public.impuestos
  alter column medios set default array['efectivo', 'transferencia']::public.medio_pago[],
  add constraint impuestos_medios_validos check (
    cardinality(medios) >= 1
    and array_position(medios, null) is null
    and cardinality(array_positions(medios, 'efectivo'::public.medio_pago)) <= 1
    and cardinality(array_positions(medios, 'transferencia'::public.medio_pago)) <= 1
  );

alter table public.movimientos_fondos
  add constraint movimientos_fondos_cuenta_no_efectivo check (cuenta <> 'efectivo');

create constraint trigger ventas_pagos_coherentes
  after insert or update of precio, medio_pago on public.ventas
  deferrable initially deferred
  for each row execute function public.tg_verificar_pagos_venta();

-- 6. Lo recreado tal cual -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select sentencia from _recrear order by orden loop
    execute r.sentencia;
  end loop;
end;
$$;

drop table _recrear;

revoke execute on function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint,
  numeric, boolean, boolean, bigint) from public, anon;
grant execute on function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint,
  numeric, boolean, boolean, bigint) to authenticated;
revoke execute on function public.registrar_venta_pasada(date, time without time zone, bigint, bigint,
  public.medio_pago, numeric, text) from public, anon;
grant execute on function public.registrar_venta_pasada(date, time without time zone, bigint, bigint,
  public.medio_pago, numeric, text) to authenticated;
grant select on public.v_movimientos_caja to authenticated;

-- 7. Vistas sin tarjeta ---------------------------------------------------------------------------
create view public.v_turnos
with (security_invoker = true) as
select
  t.id,
  t.caja_id,
  t.abierto_en,
  t.cerrado_en,
  t.observaciones,
  t.cantidad_ventas,
  t.total_efectivo,
  t.total_transferencia,
  t.total_gastos,
  c.nombre                                                   as caja_nombre,
  (t.cerrado_en is null)                                     as abierto,
  coalesce(v.cantidad, 0)                                    as ventas_cantidad,
  coalesce(vp.efectivo, 0)::numeric(14,2)                    as ventas_efectivo,
  coalesce(vp.transferencia, 0)::numeric(14,2)               as ventas_transferencia,
  coalesce(v.total, 0)::numeric(14,2)                        as ventas_total,
  coalesce(g.total, 0)::numeric(14,2)                        as gastos_total,
  (coalesce(v.total, 0) - coalesce(g.total, 0))::numeric(14,2) as neto,
  t.efectivo_inicial,
  coalesce(g.efectivo, 0)::numeric(14,2)                     as gastos_efectivo,
  (case when t.cerrado_en is null
        then coalesce(t.efectivo_inicial, 0) + coalesce(vp.efectivo, 0) - coalesce(g.efectivo, 0)
        else t.efectivo_cierre end)::numeric(14,2)           as efectivo_en_caja,
  t.efectivo_cierre,
  t.abierto_por,
  ap.nombre_completo                                         as abierto_por_nombre,
  coalesce(a.nombres, '{}'::text[])                          as atendido_por,
  public.fecha_local(t.abierto_en)                           as fecha_apertura
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles ap on ap.id = t.abierto_por
left join lateral (
  select count(*) as cantidad, sum(ventas.precio) as total
  from public.ventas
  where ventas.turno_id = t.id and not ventas.anulada
) v on true
left join lateral (
  select sum(pg.monto) filter (where pg.medio = 'efectivo') as efectivo,
         sum(pg.monto) filter (where pg.medio = 'transferencia') as transferencia
  from public.ventas
  join public.venta_pagos pg on pg.venta_id = ventas.id
  where ventas.turno_id = t.id and not ventas.anulada
) vp on true
left join lateral (
  select sum(gastos.monto) as total,
         sum(gastos.monto) filter (where gastos.fuente = 'efectivo') as efectivo
  from public.gastos
  where gastos.turno_id = t.id and not gastos.anulado
) g on true
left join lateral (
  select array_agg(pp.nombre_completo order by pp.nombre_completo) as nombres
  from public.perfiles pp
  where pp.id = t.usuario_id
     or exists (select 1 from public.ventas vv where vv.turno_id = t.id and vv.usuario_id = pp.id)
     or exists (select 1 from public.gastos gg where gg.turno_id = t.id and gg.usuario_id = pp.id)
) a on true;

grant select on public.v_turnos to authenticated;

create view public.v_ventas_mixtas
with (security_invoker = true) as
select
  v.id,
  v.creado_en,
  public.fecha_local(v.creado_en)                    as fecha_local,
  v.turno_id,
  v.caja_id,
  cj.nombre                                          as caja_nombre,
  v.servicio_nombre,
  v.patente,
  v.usuario_id,
  u.nombre_completo                                  as usuario_nombre,
  v.precio,
  coalesce(pg.efectivo, 0)::numeric(12,2)            as pago_efectivo,
  coalesce(pg.transferencia, 0)::numeric(12,2)       as pago_transferencia,
  pg.pagos,
  v.anulada,
  v.anulada_en,
  v.anulada_motivo
from public.ventas v
left join public.cajas cj on cj.id = v.caja_id
left join public.perfiles u on u.id = v.usuario_id
left join lateral (
  select sum(p.monto) filter (where p.medio = 'efectivo') as efectivo,
         sum(p.monto) filter (where p.medio = 'transferencia') as transferencia,
         jsonb_agg(jsonb_build_object('medio', p.medio, 'monto', p.monto) order by p.medio) as pagos
  from public.venta_pagos p
  where p.venta_id = v.id
) pg on true
where v.medio_pago is null and v.turno_id is not null and (select public.es_admin());

grant select on public.v_ventas_mixtas to authenticated;

create view public.v_movimientos_fondos
with (security_invoker = true) as
with libro as (
  -- Ventas por transferencia (también la parte de un pago mixto y las ventas pasadas).
  select
    'transferencia'::public.cuenta_fondos              as cuenta,
    format('venta:%s:%s', lpad(v.id::text, 19, '0'), p.medio) as clave,
    v.creado_en                                        as fecha,
    'venta'::text                                      as origen,
    'venta'::text                                      as tipo,
    'ingreso'::text                                    as sentido,
    v.servicio_nombre || coalesce(' — ' || v.patente, '') as descripcion,
    null::text                                         as nota,
    p.monto                                            as monto,
    v.usuario_id                                       as usuario_id,
    v.id                                               as venta_id,
    null::bigint                                       as gasto_id,
    null::bigint                                       as compra_id,
    null::bigint                                       as movimiento_id,
    v.turno_id                                         as turno_id,
    v.caja_id                                          as caja_id,
    (v.medio_pago is null)                             as pago_mixto,
    (v.turno_id is null)                               as venta_pasada
  from public.venta_pagos p
  join public.ventas v on v.id = p.venta_id
  where p.medio = 'transferencia' and p.monto > 0

  union all
  -- Reverso de una venta anulada, en la fecha de la anulación.
  select
    'transferencia'::public.cuenta_fondos,
    format('venta_anulada:%s:%s', lpad(v.id::text, 19, '0'), p.medio),
    v.anulada_en,
    'venta_anulada', 'venta_anulada', 'ingreso',
    'Anulación de venta #' || v.id || ': ' || v.servicio_nombre || coalesce(' — ' || v.patente, ''),
    v.anulada_motivo,
    -p.monto,
    v.anulada_por,
    v.id, null, null, null,
    v.turno_id, v.caja_id,
    (v.medio_pago is null), (v.turno_id is null)
  from public.venta_pagos p
  join public.ventas v on v.id = p.venta_id
  where p.medio = 'transferencia' and p.monto > 0 and v.anulada

  union all
  -- Gastos por transferencia (las compras de certificados, por su gasto automático).
  select
    'transferencia'::public.cuenta_fondos,
    format('gasto:%s', lpad(g.id::text, 19, '0')),
    g.creado_en,
    case when c.id is null then 'gasto' else 'compra' end,
    case when c.id is null then 'gasto' else 'compra' end,
    'egreso',
    case when c.id is null then coalesce(rubro.nombre || ' › ', '') || sub.nombre
         else 'Compra de certificados: ' || cert.nombre end,
    g.nota,
    -g.monto,
    g.usuario_id,
    null, g.id, c.id, null,
    g.turno_id, g.caja_id,
    false, false
  from public.gastos g
  join public.categorias_gasto sub on sub.id = g.categoria_id
  left join public.categorias_gasto rubro on rubro.id = sub.padre_id
  left join public.compras_certificado c on c.gasto_id = g.id
  left join public.certificados cert on cert.id = c.certificado_id
  where g.fuente = 'transferencia'

  union all
  -- Reverso de un gasto anulado (o de la compra corregida), en la fecha de la anulación.
  select
    'transferencia'::public.cuenta_fondos,
    format('gasto_anulado:%s', lpad(g.id::text, 19, '0')),
    g.anulado_en,
    case when c.id is null then 'gasto_anulado' else 'compra_anulada' end,
    case when c.id is null then 'gasto_anulado' else 'compra_anulada' end,
    'egreso',
    case when c.id is null then 'Anulación de gasto: ' || coalesce(rubro.nombre || ' › ', '') || sub.nombre
         else 'Corrección de compra de certificados: ' || cert.nombre end,
    g.anulado_motivo,
    g.monto,
    g.anulado_por,
    null, g.id, c.id, null,
    g.turno_id, g.caja_id,
    false, false
  from public.gastos g
  join public.categorias_gasto sub on sub.id = g.categoria_id
  left join public.categorias_gasto rubro on rubro.id = sub.padre_id
  left join public.compras_certificado c on c.gasto_id = g.id
  left join public.certificados cert on cert.id = c.certificado_id
  where g.fuente = 'transferencia' and g.anulado

  union all
  -- Movimientos manuales de transferencia.
  select
    m.cuenta,
    format('manual:%s', lpad(m.id::text, 19, '0')),
    m.creado_en,
    'manual', m.tipo::text,
    case when m.tipo = 'retiro' then 'egreso' else 'ingreso' end,
    case m.tipo when 'fondo_inicial' then 'Saldo inicial' when 'ingreso' then 'Ingreso' else 'Retiro' end,
    m.nota,
    m.monto,
    m.usuario_id,
    null, null, null, m.id,
    null, null,
    false, false
  from public.movimientos_fondos m

  union all
  -- Efectivo: el libro de la caja de cambio, tal cual.
  select
    'efectivo'::public.cuenta_fondos,
    format('efectivo:%s', lpad(e.id::text, 19, '0')),
    e.creado_en,
    case e.tipo
      when 'fondo_inicial' then 'manual'
      when 'ingreso' then 'manual'
      when 'retiro' then 'manual'
      when 'venta' then 'venta'
      when 'anulacion_venta' then 'venta_anulada'
      when 'gasto' then case when c.id is null then 'gasto' else 'compra' end
      when 'anulacion_gasto' then case when c.id is null then 'gasto_anulado' else 'compra_anulada' end
      else e.tipo::text
    end,
    e.tipo::text,
    case when e.tipo in ('fondo_inicial', 'ingreso', 'venta', 'anulacion_venta', 'cierre_turno')
         then 'ingreso' else 'egreso' end,
    case
      when e.tipo = 'fondo_inicial' then 'Fondo inicial'
      when e.tipo = 'ingreso' then 'Ingreso'
      when e.tipo = 'retiro' then 'Retiro'
      when e.tipo = 'venta' then v.servicio_nombre || coalesce(' — ' || v.patente, '')
      when e.tipo = 'anulacion_venta' then
        'Anulación de venta #' || v.id || ': ' || v.servicio_nombre || coalesce(' — ' || v.patente, '')
      when e.tipo = 'gasto' then
        case when c.id is null then coalesce(rubro.nombre || ' › ', '') || sub.nombre
             else 'Compra de certificados: ' || cert.nombre end
      when e.tipo = 'anulacion_gasto' then
        case when c.id is null then 'Anulación de gasto: ' || coalesce(rubro.nombre || ' › ', '') || sub.nombre
             else 'Corrección de compra de certificados: ' || cert.nombre end
      when e.tipo = 'apertura_turno' then 'Apertura de turno'
      when e.tipo = 'cierre_turno' then 'Cierre de turno'
      else e.tipo::text
    end,
    e.nota,
    e.monto,
    e.usuario_id,
    e.venta_id, e.gasto_id, c.id, e.id,
    coalesce(e.turno_id, v.turno_id, g.turno_id),
    coalesce(t.caja_id, v.caja_id, g.caja_id),
    coalesce(v.id is not null and v.medio_pago is null, false), coalesce(v.id is not null and v.turno_id is null, false)
  from public.movimientos_efectivo e
  left join public.ventas v on v.id = e.venta_id
  left join public.gastos g on g.id = e.gasto_id
  left join public.categorias_gasto sub on sub.id = g.categoria_id
  left join public.categorias_gasto rubro on rubro.id = sub.padre_id
  left join public.compras_certificado c on c.gasto_id = g.id
  left join public.certificados cert on cert.id = c.certificado_id
  left join public.turnos t on t.id = e.turno_id
)
select
  l.cuenta,
  l.clave,
  l.fecha,
  public.fecha_local(l.fecha) as fecha_local,
  l.origen,
  l.tipo,
  l.sentido,
  l.descripcion,
  l.nota,
  l.monto::numeric(12,2)     as monto,
  l.usuario_id,
  u.nombre_completo           as usuario_nombre,
  l.venta_id,
  l.gasto_id,
  l.compra_id,
  l.movimiento_id,
  l.turno_id,
  l.caja_id,
  cj.nombre                   as caja_nombre,
  l.pago_mixto,
  l.venta_pasada
from libro l
left join public.perfiles u on u.id = l.usuario_id
left join public.cajas cj on cj.id = l.caja_id
where (select public.es_admin());

grant select on public.v_movimientos_fondos to authenticated;

-- 8. Funciones sin tarjeta --------------------------------------------------------------------------
create or replace function public.cerrar_turno(p_turno_id bigint, p_observaciones text default null)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno    public.turnos;
  v_efectivo numeric(12,2);
begin
  perform public._exigir_admin();

  if p_turno_id is null then
    raise exception 'Elegí el turno que vas a cerrar' using errcode = '22023';
  end if;
  -- for update: espera a las ventas y gastos en curso (toman el turno con for share / for update).
  select * into v_turno from public.turnos where id = p_turno_id for update;
  if v_turno.id is null then
    raise exception 'El turno no existe' using errcode = '22023';
  end if;
  if v_turno.cerrado_en is not null then
    raise exception 'El turno ya estaba cerrado' using errcode = 'P0001';
  end if;

  v_efectivo := public._efectivo_en_caja(v_turno.id);

  update public.turnos t
  -- clock_timestamp(): la hora real del cierre, posterior a toda venta o gasto que se esperó con el
  -- for update (now() es el inicio de la transacción y podría quedar antes de la última venta).
  set cerrado_en          = clock_timestamp(),
      observaciones       = nullif(btrim(p_observaciones), ''),
      cantidad_ventas     = r.cantidad,
      total_efectivo      = r.efectivo,
      total_transferencia = r.transferencia,
      total_gastos        = r.gastos,
      efectivo_cierre     = v_efectivo
  from (
    select
      (select count(*) from public.ventas v
        where v.turno_id = v_turno.id and not v.anulada)                         as cantidad,
      coalesce(sum(p.monto) filter (where p.medio = 'efectivo'), 0)               as efectivo,
      coalesce(sum(p.monto) filter (where p.medio = 'transferencia'), 0)          as transferencia,
      (select coalesce(sum(g.monto), 0) from public.gastos g
        where g.turno_id = v_turno.id and not g.anulado)                         as gastos
    from public.ventas v
    join public.venta_pagos p on p.venta_id = v.id
    where v.turno_id = v_turno.id and not v.anulada
  ) r
  where t.id = v_turno.id
  returning t.* into v_turno;

  if v_efectivo > 0 then
    perform public._mover_efectivo('cierre_turno', v_efectivo,
      format('Cierre del turno #%s', v_turno.id), v_turno.id);
  end if;

  return v_turno;
end;
$$;

create function public.resumen_turnos(p_desde date default null, p_hasta date default null)
returns table (
  cantidad_turnos      bigint,
  turnos_abiertos      bigint,
  ventas_cantidad      bigint,
  ventas_efectivo      numeric(14,2),
  ventas_transferencia numeric(14,2),
  ventas_total         numeric(14,2),
  gastos_total         numeric(14,2),
  neto                 numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  select
    count(*),
    count(*) filter (where t.abierto),
    coalesce(sum(t.ventas_cantidad), 0)::bigint,
    coalesce(sum(t.ventas_efectivo), 0)::numeric(14,2),
    coalesce(sum(t.ventas_transferencia), 0)::numeric(14,2),
    coalesce(sum(t.ventas_total), 0)::numeric(14,2),
    coalesce(sum(t.gastos_total), 0)::numeric(14,2),
    coalesce(sum(t.neto), 0)::numeric(14,2)
  from public.v_turnos t
  where (p_desde is null or t.fecha_apertura >= p_desde)
    and (p_hasta is null or t.fecha_apertura <= p_hasta);
end;
$$;

create function public.resumen_ventas_mixtas(p_desde date default null, p_hasta date default null)
returns table (
  cantidad_ventas     bigint,
  total               numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  incluido_en_cuentas boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  select
    count(distinct v.id),
    coalesce(sum(p.monto), 0)::numeric(14,2),
    coalesce(sum(p.monto) filter (where p.medio = 'efectivo'), 0)::numeric(14,2),
    coalesce(sum(p.monto) filter (where p.medio = 'transferencia'), 0)::numeric(14,2),
    true
  from public.ventas v
  join public.venta_pagos p on p.venta_id = v.id
  where v.medio_pago is null
    and v.turno_id is not null
    and not v.anulada
    and (p_desde is null or public.fecha_local(v.creado_en) >= p_desde)
    and (p_hasta is null or public.fecha_local(v.creado_en) <= p_hasta);
end;
$$;

create function public.resumen_diario(p_desde date default null, p_hasta date default null)
returns table (
  fecha               date,
  cantidad_ventas     bigint,
  total_ventas        numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  total_gastos        numeric(14,2),
  flujo_neto          numeric(14,2),
  costo_certificados  numeric(14,2),
  margen_bruto        numeric(14,2),
  ventas_sin_stock    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  with vd as (
    select public.fecha_local(v.creado_en) as dia,
           count(*) as cantidad,
           sum(v.precio) as monto,
           -- Cada venta redondeada a 2 decimales, como la registra el kardex (migración 52).
           sum(round(v.costo_certificado, 2)) as costo,
           count(*) filter (where v.sin_stock) as sin_stock
    from public.ventas v
    where not v.anulada
    group by 1
  ),
  pd as (
    select public.fecha_local(v.creado_en) as dia,
           sum(p.monto) filter (where p.medio = 'efectivo') as efectivo,
           sum(p.monto) filter (where p.medio = 'transferencia') as transferencia
    from public.ventas v
    join public.venta_pagos p on p.venta_id = v.id
    where not v.anulada
    group by 1
  ),
  gd as (
    select public.fecha_local(g.creado_en) as dia, sum(g.monto) as monto
    from public.gastos g
    where not g.anulado
    group by 1
  ),
  dias as (
    select vd.dia from vd union select gd.dia from gd
  )
  select
    d.dia,
    coalesce(vd.cantidad, 0)::bigint,
    coalesce(vd.monto, 0)::numeric(14,2),
    coalesce(pd.efectivo, 0)::numeric(14,2),
    coalesce(pd.transferencia, 0)::numeric(14,2),
    coalesce(gd.monto, 0)::numeric(14,2),
    (coalesce(vd.monto, 0) - coalesce(gd.monto, 0))::numeric(14,2),
    coalesce(vd.costo, 0)::numeric(14,2),
    (coalesce(vd.monto, 0) - coalesce(vd.costo, 0))::numeric(14,2),
    coalesce(vd.sin_stock, 0)::bigint
  from dias d
  left join vd on vd.dia = d.dia
  left join pd on pd.dia = d.dia
  left join gd on gd.dia = d.dia
  where (p_desde is null or d.dia >= p_desde)
    and (p_hasta is null or d.dia <= p_hasta)
  order by d.dia;
end;
$$;

create function public.resumen_impuestos(p_desde date default null, p_hasta date default null,
                                         p_turno_id bigint default null)
returns table (
  agrupacion          text,
  id                  bigint,
  nombre              text,
  cantidad_ventas     bigint,
  total               numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  with filas as (
    select vi.venta_id, vi.impuesto_id, vi.medio, vi.monto
    from public.venta_impuestos vi
    join public.ventas v on v.id = vi.venta_id
    where not v.anulada
      and (p_desde is null or public.fecha_local(v.creado_en) >= p_desde)
      and (p_hasta is null or public.fecha_local(v.creado_en) <= p_hasta)
      and (p_turno_id is null or v.turno_id = p_turno_id)
  ),
  agrupado as (
    select 'total'::text as grupo, 0 as orden, null::bigint as clave, 'Total'::text as etiqueta,
           count(distinct f.venta_id) as cantidad,
           coalesce(sum(f.monto), 0) as t,
           coalesce(sum(f.monto) filter (where f.medio = 'efectivo'), 0) as t_ef,
           coalesce(sum(f.monto) filter (where f.medio = 'transferencia'), 0) as t_tr
    from filas f
    union all
    select 'impuesto', 1, i.id, i.nombre,
           count(distinct f.venta_id),
           sum(f.monto),
           coalesce(sum(f.monto) filter (where f.medio = 'efectivo'), 0),
           coalesce(sum(f.monto) filter (where f.medio = 'transferencia'), 0)
    from filas f
    join public.impuestos i on i.id = f.impuesto_id
    group by i.id, i.nombre
  )
  select a.grupo, a.clave, a.etiqueta, a.cantidad,
         a.t::numeric(14,2), a.t_ef::numeric(14,2), a.t_tr::numeric(14,2)
  from agrupado a
  order by a.orden, a.t desc, a.etiqueta;
end;
$$;

create function public.resumen_fondos(p_desde date default null, p_hasta date default null)
returns table (
  cuenta               public.cuenta_fondos,
  saldo                numeric(14,2),
  ingresos             numeric(14,2),
  egresos              numeric(14,2),
  neto                 numeric(14,2),
  cantidad_movimientos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  with en_rango as (
    select f.cuenta, f.sentido, f.monto
    from public.v_movimientos_fondos f
    where (p_desde is null or f.fecha_local >= p_desde)
      and (p_hasta is null or f.fecha_local <= p_hasta)
  )
  select
    c.c,
    coalesce((select sum(f.monto) from public.v_movimientos_fondos f where f.cuenta = c.c), 0)::numeric(14,2),
    coalesce((select sum(r.monto) from en_rango r where r.cuenta = c.c and r.sentido = 'ingreso'), 0)::numeric(14,2),
    coalesce((select -sum(r.monto) from en_rango r where r.cuenta = c.c and r.sentido = 'egreso'), 0)::numeric(14,2),
    coalesce((select sum(r.monto) from en_rango r where r.cuenta = c.c), 0)::numeric(14,2),
    (select count(*) from en_rango r where r.cuenta = c.c)
  from unnest(enum_range(null::public.cuenta_fondos)) as c(c)
  order by c.c;
end;
$$;

create function public.movimiento_fondos(p_cuenta public.cuenta_fondos, p_tipo public.tipo_mov_fondos,
                                         p_monto numeric, p_nota text)
returns public.v_movimientos_fondos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota  text;
  v_saldo numeric;
  v_id    bigint;
  v_clave text;
  v_fila  public.v_movimientos_fondos;
begin
  perform public._exigir_admin();

  if p_cuenta is null then
    raise exception 'Elegí la cuenta (efectivo o transferencia)' using errcode = '22023';
  end if;
  if p_tipo is null then
    raise exception 'Elegí el tipo de movimiento' using errcode = '22023';
  end if;
  perform public._validar_monto(p_monto, 'El monto');
  v_nota := public._texto_obligatorio(p_nota, 'La nota es obligatoria');
  if char_length(v_nota) > 500 then
    raise exception 'La nota no puede superar los 500 caracteres' using errcode = '22023';
  end if;

  if p_cuenta = 'efectivo' then
    -- La caja de cambio de siempre: misma regla (sin saldo negativo) y mismo libro.
    v_id := (public.movimiento_efectivo(p_tipo::text::public.tipo_mov_efectivo, p_monto, v_nota)).id;
    v_clave := format('efectivo:%s', lpad(v_id::text, 19, '0'));
  else
    -- Serializa los movimientos manuales de la cuenta: el segundo retiro ve el primero.
    perform 1 from public.cuentas_fondos where cuenta = p_cuenta for update;

    if p_tipo = 'retiro' then
      select coalesce(sum(f.monto), 0) into v_saldo
      from public.v_movimientos_fondos f
      where f.cuenta = p_cuenta;

      if v_saldo - p_monto < 0 then
        raise exception 'No alcanza el saldo de transferencias: hay $ % y el retiro es de $ %',
          public._pesos(v_saldo), public._pesos(p_monto)
          using errcode = 'P0001';
      end if;
    end if;

    insert into public.movimientos_fondos (cuenta, tipo, monto, nota, usuario_id)
    values (p_cuenta, p_tipo, case when p_tipo = 'retiro' then -p_monto else p_monto end, v_nota, auth.uid())
    returning id into v_id;
    v_clave := format('manual:%s', lpad(v_id::text, 19, '0'));
  end if;

  select * into v_fila from public.v_movimientos_fondos f where f.clave = v_clave;
  return v_fila;
end;
$$;

revoke execute on function public.resumen_turnos(date, date) from public, anon;
grant execute on function public.resumen_turnos(date, date) to authenticated;
revoke execute on function public.resumen_ventas_mixtas(date, date) from public, anon;
grant execute on function public.resumen_ventas_mixtas(date, date) to authenticated;
revoke execute on function public.resumen_diario(date, date) from public, anon;
grant execute on function public.resumen_diario(date, date) to authenticated;
revoke execute on function public.resumen_impuestos(date, date, bigint) from public, anon;
grant execute on function public.resumen_impuestos(date, date, bigint) to authenticated;
revoke execute on function public.resumen_fondos(date, date) from public, anon;
grant execute on function public.resumen_fondos(date, date) to authenticated;
revoke execute on function public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text)
  from public, anon;
grant execute on function public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text)
  to authenticated;
