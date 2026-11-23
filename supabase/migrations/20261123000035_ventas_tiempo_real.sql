-- Ventas en tiempo real (decisión del negocio, 2026-11-23).
--
-- La pantalla de Ventas del admin muestra los turnos abiertos con sus totales y sus ventas EN VIVO
-- (Realtime) y el historial de turnos filtrado por fecha de apertura, con los totales del rango.
--
-- 1. `v_turnos.fecha_apertura` = día de negocio (hora AR) de la apertura, para filtrar por fecha sin
--    calcular husos horarios en el cliente. Se agrega AL FINAL (create or replace view no deja
--    reordenar columnas); el resto de la vista no cambia.
-- 2. `resumen_turnos(p_desde, p_hasta)`: totales sumados de los turnos abiertos en el rango (solo
--    admin). La suma la hace la BD: el frontend nunca suma dinero.
-- 3. Realtime (`postgres_changes`) de `ventas`, `venta_pagos`, `gastos`, `turnos` y `comprobantes`.
--    Seguridad: Realtime evalúa la RLS de cada suscriptor sobre cada cambio y solo envía las columnas
--    con privilegio SELECT (`has_column_privilege` en `realtime.apply_rls`). Por eso:
--      - los costos de `ventas` (sin grant por columna) nunca viajan;
--      - el cajero no recibe nada de `turnos` (RLS solo admin) ni de turnos cerrados;
--      - recibe solo lo que ya puede leer por REST (ventas, pagos, gastos y comprobantes de los
--        turnos abiertos).
--    La UI usa los eventos solo como aviso para volver a consultar (las vistas siguen siendo la
--    fuente de los totales).

-- 1. v_turnos + fecha_apertura ----------------------------------------------------------------------

create or replace view public.v_turnos
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
  t.total_tarjeta,
  t.total_gastos,
  c.nombre as caja_nombre,
  t.cerrado_en is null as abierto,
  coalesce(v.cantidad, 0::bigint) as ventas_cantidad,
  coalesce(vp.efectivo, 0::numeric)::numeric(14,2) as ventas_efectivo,
  coalesce(vp.transferencia, 0::numeric)::numeric(14,2) as ventas_transferencia,
  coalesce(vp.tarjeta, 0::numeric)::numeric(14,2) as ventas_tarjeta,
  coalesce(v.total, 0::numeric)::numeric(14,2) as ventas_total,
  coalesce(g.total, 0::numeric)::numeric(14,2) as gastos_total,
  (coalesce(v.total, 0::numeric) - coalesce(g.total, 0::numeric))::numeric(14,2) as neto,
  t.efectivo_inicial,
  coalesce(g.efectivo, 0::numeric)::numeric(14,2) as gastos_efectivo,
  (case
     when t.cerrado_en is null
       then coalesce(t.efectivo_inicial, 0) + coalesce(vp.efectivo, 0) - coalesce(g.efectivo, 0)
     else t.efectivo_cierre
   end)::numeric(14,2) as efectivo_en_caja,
  t.efectivo_cierre,
  t.abierto_por,
  ap.nombre_completo as abierto_por_nombre,
  coalesce(a.nombres, '{}'::text[]) as atendido_por,
  public.fecha_local(t.abierto_en) as fecha_apertura
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles ap on ap.id = t.abierto_por
left join lateral (
  select count(*) as cantidad,
         sum(ventas.precio) as total
  from public.ventas
  where ventas.turno_id = t.id and not ventas.anulada
) v on true
left join lateral (
  select sum(pg.monto) filter (where pg.medio = 'efectivo') as efectivo,
         sum(pg.monto) filter (where pg.medio = 'transferencia') as transferencia,
         sum(pg.monto) filter (where pg.medio = 'tarjeta') as tarjeta
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

-- 2. resumen_turnos ---------------------------------------------------------------------------------
-- Turnos con apertura (día de negocio) en el rango; sin rango, todos. Totales en vivo de `v_turnos`
-- (sin anulados), sumados.

create function public.resumen_turnos(p_desde date default null, p_hasta date default null)
returns table (
  cantidad_turnos      bigint,
  turnos_abiertos      bigint,
  ventas_cantidad      bigint,
  ventas_efectivo      numeric(14,2),
  ventas_transferencia numeric(14,2),
  ventas_tarjeta       numeric(14,2),
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
    coalesce(sum(t.ventas_tarjeta), 0)::numeric(14,2),
    coalesce(sum(t.ventas_total), 0)::numeric(14,2),
    coalesce(sum(t.gastos_total), 0)::numeric(14,2),
    coalesce(sum(t.neto), 0)::numeric(14,2)
  from public.v_turnos t
  where (p_desde is null or t.fecha_apertura >= p_desde)
    and (p_hasta is null or t.fecha_apertura <= p_hasta);
end;
$$;

revoke all on function public.resumen_turnos(date, date) from public, anon;
grant execute on function public.resumen_turnos(date, date) to authenticated;

-- 3. Realtime ---------------------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.ventas, public.venta_pagos, public.gastos, public.turnos, public.comprobantes;
