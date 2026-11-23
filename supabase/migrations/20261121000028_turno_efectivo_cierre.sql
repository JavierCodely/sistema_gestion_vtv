-- Revisión de la migración 27 (2026-11-21):
-- 1. En un turno cerrado, `v_turnos.efectivo_en_caja` es la foto del cierre (`turnos.efectivo_cierre`,
--    lo que volvió a la caja de cambio), no el cálculo en vivo: una venta anulada después del cierre
--    sale de la caja de cambio y no cambia lo que se devolvió. Los turnos anteriores a la 27 no
--    tienen efectivo por turno (NULL). Se suma la columna `efectivo_cierre`.
-- 2. `cajas_para_turno()` solo para el admin: el cajero ya no abre turnos y no necesita ver quién
--    ocupa cada caja.

create or replace view public.v_turnos
with (security_invoker = true) as
select
  t.id,
  t.caja_id,
  t.usuario_id,
  t.abierto_en,
  t.cerrado_en,
  t.observaciones,
  t.cantidad_ventas,
  t.total_efectivo,
  t.total_transferencia,
  t.total_tarjeta,
  t.total_gastos,
  c.nombre as caja_nombre,
  p.nombre_completo as usuario_nombre,
  t.cerrado_en is null as abierto,
  coalesce(v.cantidad, 0::bigint) as ventas_cantidad,
  coalesce(v.efectivo, 0::numeric)::numeric(14,2) as ventas_efectivo,
  coalesce(v.transferencia, 0::numeric)::numeric(14,2) as ventas_transferencia,
  coalesce(v.tarjeta, 0::numeric)::numeric(14,2) as ventas_tarjeta,
  coalesce(v.total, 0::numeric)::numeric(14,2) as ventas_total,
  coalesce(g.total, 0::numeric)::numeric(14,2) as gastos_total,
  (coalesce(v.total, 0::numeric) - coalesce(g.total, 0::numeric))::numeric(14,2) as neto,
  t.efectivo_inicial,
  coalesce(g.efectivo, 0::numeric)::numeric(14,2) as gastos_efectivo,
  (case
     when t.cerrado_en is null
       then coalesce(t.efectivo_inicial, 0) + coalesce(v.efectivo, 0) - coalesce(g.efectivo, 0)
     else t.efectivo_cierre
   end)::numeric(14,2) as efectivo_en_caja,
  t.efectivo_cierre
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles p on p.id = t.usuario_id
left join lateral (
  select count(*) as cantidad,
         sum(ventas.precio) as total,
         sum(ventas.precio) filter (where ventas.medio_pago = 'efectivo') as efectivo,
         sum(ventas.precio) filter (where ventas.medio_pago = 'transferencia') as transferencia,
         sum(ventas.precio) filter (where ventas.medio_pago = 'tarjeta') as tarjeta
  from public.ventas
  where ventas.turno_id = t.id and not ventas.anulada
) v on true
left join lateral (
  select sum(gastos.monto) as total,
         sum(gastos.monto) filter (where gastos.fuente = 'efectivo') as efectivo
  from public.gastos
  where gastos.turno_id = t.id and not gastos.anulado
) g on true;

create or replace function public.cajas_para_turno()
returns table (id bigint, nombre text, ocupada boolean, ocupada_por text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();

  return query
  select c.id, c.nombre, t.id is not null, p.nombre_completo
  from public.cajas c
  left join public.turnos t on t.caja_id = c.id and t.cerrado_en is null
  left join public.perfiles p on p.id = t.usuario_id
  where c.activa
  order by c.nombre;
end;
$$;

-- 3. service_role: solo lo que usan las Edge Functions, igual que en la nube.
--    En los proyectos nuevos de Supabase, service_role no recibe SELECT/INSERT/UPDATE/DELETE por
--    defecto sobre las tablas que crea postgres (privilegios por defecto `service_role=Dxtm`). El
--    Supabase local todavía se los da todos, y por eso `admin-usuarios` funcionaba en local y en la
--    nube fallaba al leer `perfiles` ("No se pudo leer el usuario"). Se igualan los dos entornos:
--    se le quita todo y se otorga explícitamente lo necesario (arca ya lo hacía en las 23 y 25).
revoke select, insert, update, delete on all tables in schema public from service_role;
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from service_role;

-- arca (migración 23): configuración, condiciones de IVA y comprobantes.
grant select on public.arca_configuracion, public.arca_condiciones_iva, public.comprobantes,
  public.v_comprobantes, public.ventas
to service_role;

-- admin-usuarios: lee el perfil y cambia nombre, apellido, rol y activación (el alta la hace el
-- trigger desde auth.users).
grant select (id, nombre, apellido, nombre_completo, email, rol, activo) on public.perfiles
  to service_role;
grant update (nombre, apellido, rol, activo) on public.perfiles to service_role;
