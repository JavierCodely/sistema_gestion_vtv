-- =====================================================================
-- Migración 39: un certificado se usa en una o más categorías y/o servicios
-- (decisión del negocio, 2026-11-23)
--
-- Antes cada certificado tenía UN destino (`alcance` global / categoría / servicio). Ahora:
-- * `certificados.todos_servicios` = se usa en todos los servicios (el "global" de antes).
-- * Si no, `certificado_destinos`: una fila por categoría entera (también los servicios que se
--   agreguen después a esa categoría) o por servicio suelto; se pueden mezclar.
-- * Un certificado nuevo no se usa en ningún servicio hasta que se le fijan los destinos.
-- * Al vender se usa el activo más específico, como siempre: servicio > categoría > todos.
-- * Un solo certificado activo por destino y nivel (para que la elección sea inequívoca):
--   índices únicos parciales sobre `certificado_destinos.activo` (copia de `certificados.activo`,
--   la mantiene un trigger) y sobre `certificados (todos_servicios) where activo`. Antes de chocar
--   con el índice, la BD avisa con el nombre del destino y del otro certificado.
-- * Los destinos se fijan de una vez con `fijar_destinos_certificado()` (admin, atómica).
-- Los certificados existentes conservan su destino (global → todos_servicios; categoría o
-- servicio → una fila en certificado_destinos).
-- =====================================================================

alter table public.certificados add column todos_servicios boolean not null default false;

create table public.certificado_destinos (
  id             bigint generated always as identity primary key,
  certificado_id bigint not null references public.certificados (id) on delete cascade,
  categoria_id   bigint references public.categorias_servicio (id) on delete cascade,
  servicio_id    bigint references public.servicios (id) on delete cascade,
  -- Copia de certificados.activo (para los índices únicos de abajo); la mantiene un trigger.
  activo         boolean not null,
  constraint certificado_destinos_uno check ((categoria_id is null) <> (servicio_id is null))
);

create index certificado_destinos_certificado on public.certificado_destinos (certificado_id);
create unique index certificado_destinos_categoria_unica
  on public.certificado_destinos (certificado_id, categoria_id) where categoria_id is not null;
create unique index certificado_destinos_servicio_unico
  on public.certificado_destinos (certificado_id, servicio_id) where servicio_id is not null;

-- Pasar los destinos existentes al modelo nuevo.
update public.certificados set todos_servicios = true where alcance = 'global';
insert into public.certificado_destinos (certificado_id, categoria_id, activo)
  select id, categoria_id, activo from public.certificados where alcance = 'categoria';
insert into public.certificado_destinos (certificado_id, servicio_id, activo)
  select id, servicio_id, activo from public.certificados where alcance = 'servicio';

-- Quitar el modelo viejo (la vista y la RPC de stock se rehacen abajo).
drop function public.stock_certificados_valorizado();
drop view public.v_stock_certificados;
drop index public.certificados_un_global_activo;
drop index public.certificados_uno_por_categoria;
drop index public.certificados_uno_por_servicio;
alter table public.certificados
  drop constraint certificados_alcance_coherente,
  drop column alcance,
  drop column categoria_id,
  drop column servicio_id;
drop type public.alcance_certificado;

-- Un solo certificado activo por destino y nivel. Mismos nombres que antes (la UI los traduce).
create unique index certificados_un_global_activo
  on public.certificados (todos_servicios) where todos_servicios and activo;
create unique index certificados_uno_por_categoria
  on public.certificado_destinos (categoria_id) where activo and categoria_id is not null;
create unique index certificados_uno_por_servicio
  on public.certificado_destinos (servicio_id) where activo and servicio_id is not null;

-- Permisos: todos leen los destinos (como los certificados); se escriben solo por la RPC.
alter table public.certificado_destinos enable row level security;
create policy "usuarios activos leen destinos de certificados" on public.certificado_destinos
  for select to authenticated using ((select public.rol_actual()) is not null);
grant select on public.certificado_destinos to authenticated;
-- todos_servicios es legible; no editable por columna (se fija con fijar_destinos_certificado).
grant select (todos_servicios) on public.certificados to authenticated;

-- Choques con otro certificado activo (interna) -------------------------------------------------
-- Avisa con nombres antes de que lo rechace un índice único. Los índices siguen siendo la garantía
-- ante dos cambios simultáneos (23505, la UI lo traduce por el nombre del índice).

create function public._validar_destinos_certificado(
  p_certificado_id bigint,
  p_todos          boolean,
  p_categoria_ids  bigint[],
  p_servicio_ids   bigint[]
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_destino text;
  v_otro    text;
begin
  if p_todos then
    select c.nombre into v_otro
    from public.certificados c
    where c.activo and c.todos_servicios and c.id <> p_certificado_id
    limit 1;
    if v_otro is not null then
      raise exception 'Ya hay un certificado activo para todos los servicios: "%". Desactivalo antes.', v_otro
        using errcode = 'P0001';
    end if;
  end if;

  select cs.nombre, c.nombre into v_destino, v_otro
  from public.certificado_destinos d
  join public.certificados c on c.id = d.certificado_id
  join public.categorias_servicio cs on cs.id = d.categoria_id
  where d.activo and d.certificado_id <> p_certificado_id
    and d.categoria_id = any (coalesce(p_categoria_ids, '{}'))
  order by cs.nombre
  limit 1;
  if v_destino is not null then
    raise exception 'La categoría "%" ya usa el certificado activo "%". Desactivalo o quitale esa categoría antes.',
      v_destino, v_otro using errcode = 'P0001';
  end if;

  select s.nombre, c.nombre into v_destino, v_otro
  from public.certificado_destinos d
  join public.certificados c on c.id = d.certificado_id
  join public.servicios s on s.id = d.servicio_id
  where d.activo and d.certificado_id <> p_certificado_id
    and d.servicio_id = any (coalesce(p_servicio_ids, '{}'))
  order by s.nombre
  limit 1;
  if v_destino is not null then
    raise exception 'El servicio "%" ya usa el certificado activo "%". Desactivalo o quitale ese servicio antes.',
      v_destino, v_otro using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public._validar_destinos_certificado(bigint, boolean, bigint[], bigint[])
  from public, authenticated, anon;

-- Activar / desactivar un certificado: copia `activo` a sus destinos ----------------------------

create function public.tg_certificados_destinos_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activo then
    perform public._validar_destinos_certificado(
      new.id,
      new.todos_servicios,
      array(select d.categoria_id from public.certificado_destinos d
            where d.certificado_id = new.id and d.categoria_id is not null),
      array(select d.servicio_id from public.certificado_destinos d
            where d.certificado_id = new.id and d.servicio_id is not null));
  end if;
  update public.certificado_destinos set activo = new.activo
  where certificado_id = new.id and activo <> new.activo;
  return new;
end;
$$;

revoke all on function public.tg_certificados_destinos_activo() from public, authenticated, anon;

-- BEFORE: el aviso con nombres sale antes de que el índice único del global rechace la fila.
create trigger certificados_destinos_activo
  before update of activo on public.certificados
  for each row when (old.activo is distinct from new.activo)
  execute function public.tg_certificados_destinos_activo();

-- Fijar los destinos de una vez (admin) ---------------------------------------------------------
-- p_todos = true: todos los servicios (las listas quedan vacías).
-- p_todos = false: las categorías enteras de p_categoria_ids y los servicios de p_servicio_ids
-- ('{}' = ninguno: el certificado no se usa en ninguna venta).

create function public.fijar_destinos_certificado(
  p_certificado_id bigint,
  p_todos          boolean,
  p_categoria_ids  bigint[],
  p_servicio_ids   bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo     boolean;
  v_categorias bigint[];
  v_servicios  bigint[];
begin
  perform public._exigir_admin();

  if p_todos is null then
    raise exception 'Indicá si el certificado se usa en todos los servicios' using errcode = '22023';
  end if;
  if not p_todos and (p_categoria_ids is null or p_servicio_ids is null) then
    raise exception 'Indicá las categorías y los servicios del certificado (las listas pueden estar vacías)'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_categorias
  from unnest(case when p_todos then '{}'::bigint[] else p_categoria_ids end) x;
  select coalesce(array_agg(distinct x), '{}') into v_servicios
  from unnest(case when p_todos then '{}'::bigint[] else p_servicio_ids end) x;
  if array_position(v_categorias, null) is not null then
    raise exception 'Hay una categoría inválida en la lista' using errcode = '22023';
  end if;
  if array_position(v_servicios, null) is not null then
    raise exception 'Hay un servicio inválido en la lista' using errcode = '22023';
  end if;

  select c.activo into v_activo from public.certificados c where c.id = p_certificado_id for update;
  if v_activo is null then
    raise exception 'El certificado no existe' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(v_categorias) x
             where not exists (select 1 from public.categorias_servicio cs where cs.id = x)) then
    raise exception 'Hay una categoría que no existe en la lista' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_servicios) x
             where not exists (select 1 from public.servicios s where s.id = x)) then
    raise exception 'Hay un servicio que no existe en la lista' using errcode = '22023';
  end if;

  if v_activo then
    perform public._validar_destinos_certificado(p_certificado_id, p_todos, v_categorias, v_servicios);
  end if;

  update public.certificados set todos_servicios = p_todos where id = p_certificado_id;

  delete from public.certificado_destinos
  where certificado_id = p_certificado_id
    and (   (categoria_id is not null and categoria_id <> all (v_categorias))
         or (servicio_id  is not null and servicio_id  <> all (v_servicios)));

  insert into public.certificado_destinos (certificado_id, categoria_id, activo)
  select p_certificado_id, x, v_activo from unnest(v_categorias) x
  where not exists (select 1 from public.certificado_destinos d
                    where d.certificado_id = p_certificado_id and d.categoria_id = x);

  insert into public.certificado_destinos (certificado_id, servicio_id, activo)
  select p_certificado_id, x, v_activo from unnest(v_servicios) x
  where not exists (select 1 from public.certificado_destinos d
                    where d.certificado_id = p_certificado_id and d.servicio_id = x);
end;
$$;

revoke all on function public.fijar_destinos_certificado(bigint, boolean, bigint[], bigint[]) from public, anon;
grant execute on function public.fijar_destinos_certificado(bigint, boolean, bigint[], bigint[]) to authenticated;

-- Certificado que corresponde a un servicio: el activo más específico ---------------------------
-- (servicio > categoría > todos). Null si el servicio no lleva certificado o no hay ninguno.

create or replace function public.certificado_para_servicio(p_servicio_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public._exigir_usuario();

  select x.id into v_id
  from public.servicios s
  cross join lateral (
    select d.certificado_id as id, 1 as prioridad
    from public.certificado_destinos d
    where d.activo and d.servicio_id = s.id
    union all
    select d.certificado_id, 2
    from public.certificado_destinos d
    where d.activo and d.categoria_id = s.categoria_id
    union all
    select c.id, 3
    from public.certificados c
    where c.activo and c.todos_servicios
  ) x
  where s.id = p_servicio_id
    and s.requiere_certificado
  order by x.prioridad
  limit 1;

  return v_id;
end;
$$;

-- Stock para todos (sin costos) ------------------------------------------------------------------
-- aplica_a: "Todos los servicios", "Sin asignar" o la lista ("Categoría Autos, Reverificación":
-- primero las categorías enteras y después los servicios sueltos, por nombre).

create view public.v_stock_certificados
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.unidad_compra,
  c.hojas_por_unidad,
  c.todos_servicios,
  coalesce(d.categoria_ids, '{}')                    as categoria_ids,
  coalesce(d.servicio_ids, '{}')                     as servicio_ids,
  case
    when c.todos_servicios then 'Todos los servicios'
    when d.nombres is null then 'Sin asignar'
    else d.nombres
  end                                                as aplica_a,
  c.stock_minimo,
  c.stock_hojas,
  case
    when c.stock_hojas = 0               then 'sin_stock'
    when c.stock_hojas <= c.stock_minimo then 'bajo'
    else 'ok'
  end                                                as semaforo,
  c.activo
from public.certificados c
left join lateral (
  select
    array_agg(x.categoria_id order by x.categoria_id) filter (where x.categoria_id is not null)
      as categoria_ids,
    array_agg(x.servicio_id order by x.servicio_id) filter (where x.servicio_id is not null)
      as servicio_ids,
    string_agg(x.etiqueta, ', ' order by x.orden, x.nombre) as nombres
  from (
    select
      cd.categoria_id,
      cd.servicio_id,
      case when cd.categoria_id is not null then 'Categoría ' || cs.nombre else s.nombre end as etiqueta,
      case when cd.categoria_id is not null then 1 else 2 end as orden,
      coalesce(cs.nombre, s.nombre) as nombre
    from public.certificado_destinos cd
    left join public.categorias_servicio cs on cs.id = cd.categoria_id
    left join public.servicios s on s.id = cd.servicio_id
    where cd.certificado_id = c.id
  ) x
) d on true;

grant select on public.v_stock_certificados to authenticated;

-- Stock valorizado: solo admin ------------------------------------------------------------------

create function public.stock_certificados_valorizado()
returns table (
  id               bigint,
  nombre           text,
  unidad_compra    public.unidad_compra,
  hojas_por_unidad integer,
  todos_servicios  boolean,
  categoria_ids    bigint[],
  servicio_ids     bigint[],
  aplica_a         text,
  stock_minimo     integer,
  stock_hojas      integer,
  costo_promedio   numeric(14,2),
  valor_stock      numeric(14,2),
  semaforo         text,
  activo           boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();

  return query
  select
    v.id, v.nombre, v.unidad_compra, v.hojas_por_unidad, v.todos_servicios, v.categoria_ids,
    v.servicio_ids, v.aplica_a, v.stock_minimo, v.stock_hojas,
    round(c.costo_promedio, 2)::numeric(14,2),
    round(c.stock_hojas * c.costo_promedio, 2)::numeric(14,2),
    v.semaforo, v.activo
  from public.v_stock_certificados v
  join public.certificados c on c.id = v.id
  order by v.activo desc, v.nombre;
end;
$$;

revoke all on function public.stock_certificados_valorizado() from public, anon;
grant execute on function public.stock_certificados_valorizado() to authenticated;
