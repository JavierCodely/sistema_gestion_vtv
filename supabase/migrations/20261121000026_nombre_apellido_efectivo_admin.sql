-- Fase 5 (decisiones del negocio, 2026-11-21):
-- 1) Los usuarios tienen nombre y apellido por separado. `nombre_completo` (generada) es lo que
--    muestran las vistas. Los usuarios ya existentes se separan solos (la última palabra pasa a
--    apellido); los de una sola palabra (ej. el primer admin creado desde el Dashboard) quedan con
--    apellido NULL = "falta completar": la app lo marca y la Edge Function admin-usuarios exige
--    apellido al crear y al editar.
-- 2) El saldo de la caja de efectivo (cambio) es solo del admin: el cajero no lo lee ni lo deduce
--    del mensaje de error cuando un gasto en efectivo no alcanza. Al admin el mensaje le muestra
--    los montos en formato argentino.

-- 1) Nombre y apellido -----------------------------------------------------------------------

alter table public.perfiles
  add column apellido text
    constraint perfiles_apellido_check check (apellido is null or btrim(apellido) <> '')
    constraint perfiles_apellido_largo check (char_length(apellido) <= 100);

-- Separación de los existentes: "Juan Carlos Pérez" → nombre "Juan Carlos", apellido "Pérez".
update public.perfiles
set nombre   = btrim(regexp_replace(btrim(nombre), '\s+\S+$', '')),
    apellido = substring(btrim(nombre) from '\S+$')
where btrim(nombre) ~ '\s';

-- Espacios normalizados (como los nombres de catálogo).
update public.perfiles
set nombre = regexp_replace(btrim(nombre), '\s+', ' ', 'g')
where nombre <> regexp_replace(btrim(nombre), '\s+', ' ', 'g');

alter table public.perfiles
  add column nombre_completo text
    not null generated always as (btrim(nombre || ' ' || coalesce(apellido, ''))) stored;

grant select (apellido, nombre_completo) on public.perfiles to authenticated;

create or replace function public.tg_normalizar_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := regexp_replace(btrim(new.nombre), '\s+', ' ', 'g');
  new.apellido := nullif(regexp_replace(btrim(new.apellido), '\s+', ' ', 'g'), '');
  return new;
end;
$$;

create trigger perfiles_normalizar
  before insert or update of nombre, apellido on public.perfiles
  for each row execute function public.tg_normalizar_perfil();

revoke execute on function public.tg_normalizar_perfil() from public, anon, authenticated;

create or replace function public.tg_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, apellido, email, rol)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), new.email, 'Sin nombre'),
    nullif(btrim(new.raw_user_meta_data ->> 'apellido'), ''),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'rol')::public.rol_usuario, 'cajero')
  );
  return new;
end;
$$;

-- Vistas y funciones que muestran quién hizo algo: nombre y apellido.

create or replace view public.v_movimientos_caja
with (security_invoker = true) as
select
  'venta'::text as tipo,
  v.id,
  v.creado_en as fecha,
  public.fecha_local(v.creado_en) as fecha_local,
  v.turno_id,
  v.caja_id,
  c.nombre as caja_nombre,
  v.usuario_id,
  p.nombre_completo as usuario_nombre,
  v.servicio_nombre as concepto,
  cs.nombre as detalle,
  v.medio_pago::text as medio,
  v.precio as monto,
  v.patente,
  v.sin_stock,
  v.anulada,
  v.anulada_motivo as motivo_anulacion,
  null::text as nota,
  v.servicio_id,
  null::bigint as categoria_gasto_id
from public.ventas v
join public.cajas c on c.id = v.caja_id
left join public.perfiles p on p.id = v.usuario_id
left join public.categorias_servicio cs on cs.id = v.categoria_id
union all
select
  'gasto'::text as tipo,
  g.id,
  g.creado_en as fecha,
  public.fecha_local(g.creado_en) as fecha_local,
  g.turno_id,
  g.caja_id,
  c.nombre as caja_nombre,
  g.usuario_id,
  p.nombre_completo as usuario_nombre,
  sub.nombre as concepto,
  rubro.nombre as detalle,
  g.fuente::text as medio,
  - g.monto as monto,
  null::text as patente,
  false as sin_stock,
  g.anulado as anulada,
  g.anulado_motivo as motivo_anulacion,
  g.nota,
  null::bigint as servicio_id,
  g.categoria_id as categoria_gasto_id
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

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
  (coalesce(v.total, 0::numeric) - coalesce(g.total, 0::numeric))::numeric(14,2) as neto
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
  select sum(gastos.monto) as total
  from public.gastos
  where gastos.turno_id = t.id and not gastos.anulado
) g on true;

create or replace view public.v_compras_certificado
with (security_invoker = true) as
select
  c.id,
  c.creado_en,
  c.certificado_id,
  cert.nombre as certificado,
  cert.unidad_compra,
  c.hojas / c.unidades as hojas_por_unidad,
  c.unidades,
  c.costo_unidad,
  c.hojas,
  c.costo_total,
  c.fuente,
  c.proveedor,
  u.nombre_completo as usuario,
  c.anulada,
  c.anulada_motivo,
  c.anulada_en,
  a.nombre_completo as anulada_por,
  c.reemplazada_por,
  coalesce(
    not c.anulada and cert.activo
    and m.id = (select max(m2.id) from public.movimientos_certificado m2
                where m2.certificado_id = c.certificado_id),
    false
  ) as editable
from public.compras_certificado c
join public.certificados cert on cert.id = c.certificado_id
join public.perfiles u on u.id = c.usuario_id
left join public.perfiles a on a.id = c.anulada_por
left join public.movimientos_certificado m
  on m.compra_id = c.id and m.tipo = 'compra'::public.tipo_mov_certificado;

create or replace function public.cajas_para_turno()
returns table (id bigint, nombre text, ocupada boolean, ocupada_por text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return query
  select c.id, c.nombre, t.id is not null, p.nombre_completo
  from public.cajas c
  left join public.turnos t on t.caja_id = c.id and t.cerrado_en is null
  left join public.perfiles p on p.id = t.usuario_id
  where c.activa
  order by c.nombre;
end;
$$;

-- 2) Caja de efectivo: saldo solo para el admin -------------------------------------------------

drop policy "usuarios activos leen saldo de efectivo" on public.caja_efectivo;
create policy "admin lee saldo de efectivo" on public.caja_efectivo
  for select to authenticated using ((select public.es_admin()));

-- El cajero no ve el saldo: si un gasto en efectivo no alcanza, el mensaje no dice cuánto hay.
create or replace function public._mover_efectivo(
  p_tipo     public.tipo_mov_efectivo,
  p_monto    numeric,
  p_nota     text default null,
  p_turno_id bigint default null,
  p_venta_id bigint default null,
  p_gasto_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo numeric(12,2);
  v_id    bigint;
begin
  perform public._validar_monto(abs(p_monto), 'El monto');

  select saldo into v_saldo from public.caja_efectivo where id = 1 for update;

  if v_saldo + p_monto < 0 then
    if public.es_admin() then
      -- Formato argentino fijo (1.234,56): G/D de to_char dependen del lc_numeric del servidor.
      raise exception 'No hay suficiente efectivo en la caja de cambio (disponible: $%, necesario: $%)',
        translate(to_char(v_saldo, 'FM9,999,999,990.00'), ',.', '.,'),
        translate(to_char(-p_monto, 'FM9,999,999,990.00'), ',.', '.,')
        using errcode = 'P0001';
    end if;
    raise exception 'No hay suficiente efectivo en la caja de cambio para este gasto. Avisale al administrador'
      using errcode = 'P0001';
  end if;

  v_saldo := v_saldo + p_monto;
  update public.caja_efectivo set saldo = v_saldo, actualizado_en = now() where id = 1;

  insert into public.movimientos_efectivo
    (tipo, monto, saldo_resultante, nota, usuario_id, turno_id, venta_id, gasto_id)
  values
    (p_tipo, p_monto, v_saldo, p_nota, auth.uid(), p_turno_id, p_venta_id, p_gasto_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- Libro de efectivo para la pantalla del admin: con quién hizo cada movimiento.
create view public.v_movimientos_efectivo
with (security_invoker = true) as
select
  m.id,
  m.creado_en,
  m.tipo,
  m.monto,
  m.saldo_resultante,
  m.nota,
  m.usuario_id,
  p.nombre_completo as usuario_nombre,
  m.turno_id,
  m.venta_id,
  m.gasto_id
from public.movimientos_efectivo m
left join public.perfiles p on p.id = m.usuario_id;

grant select on public.v_movimientos_efectivo to authenticated;
