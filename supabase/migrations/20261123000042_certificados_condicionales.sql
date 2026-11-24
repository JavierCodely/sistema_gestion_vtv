-- =====================================================================
-- Migración 42: la condicional es un certificado, no un servicio (decisiones del negocio, 2026-11-23)
--
-- Reemplaza el modelo de la 40 (servicio condicional ligado a un servicio aprobado):
--   - Un certificado se marca **condicional** (`certificados.condicional`) con los **días para volver**
--     (`certificados.dias_vuelta`, 1–365). Se asigna a servicios/categorías con "Se usa en" como
--     cualquier otro. Cada destino tiene a lo sumo un certificado activo común y uno condicional.
--   - En la caja, un servicio con certificado condicional ofrece dos opciones: el certificado de siempre
--     (aprobado) o el condicional. La condicional cuesta lo mismo que el servicio (total o, sin
--     descuento, el 50%) y descuenta su hoja; `registrar_venta(..., p_condicional)`.
--   - La vuelta: la misma patente, dentro del plazo, con el **mismo servicio** y el certificado de
--     siempre: cobra el saldo ($ 0 o el 50% que faltaba) y descuenta la hoja común (como en la 41).
--   - La foto de la venta no cambia (`condicional_servicio_id` = el mismo servicio, `condicional_vence`
--     = día de negocio + días del certificado, `condicional_saldo`); la pone `registrar_venta`.
--     Las ventas con fecha pasada no llevan certificado: nunca son condicionales.
--   - Se quitan `servicios.condicional_de` y `servicios.dias_vuelta`. Las condicionales configuradas
--     con la 40 se pasan solas: el certificado que se usaba solo en el servicio condicional pasa a ser
--     el certificado condicional del servicio aprobado (con los mismos días) y el servicio condicional
--     queda desactivado (conserva su historial).
--   - `certificado_condicional_para_servicio()` (para la caja) y `condicionales_de_patente()` sin
--     `condicional_id` (la condicional nueva se hace con el mismo servicio).
-- =====================================================================

-- Certificados condicionales ---------------------------------------------------------------------

alter table public.certificados
  add column condicional boolean not null default false,
  add column dias_vuelta smallint,
  add constraint certificados_condicional_dias check (condicional = (dias_vuelta is not null)),
  add constraint certificados_dias_vuelta_validos check (dias_vuelta between 1 and 365);

comment on column public.certificados.condicional is
  'Certificado de condicional: en la caja se ofrece como alternativa al de siempre del servicio.';
comment on column public.certificados.dias_vuelta is
  'Certificado de condicional: días para volver y pagar lo que falta (foto en la venta).';

grant select (condicional, dias_vuelta),
      insert (condicional, dias_vuelta),
      update (condicional, dias_vuelta)
  on public.certificados to authenticated;

-- Copia de certificados.condicional en los destinos (para los índices únicos), como `activo`.
alter table public.certificado_destinos add column condicional boolean not null default false;

-- Un solo certificado activo por destino, nivel y tipo (común o condicional). Mismos nombres.
drop index public.certificados_un_global_activo;
drop index public.certificados_uno_por_categoria;
drop index public.certificados_uno_por_servicio;
create unique index certificados_un_global_activo
  on public.certificados (todos_servicios, condicional) where todos_servicios and activo;
create unique index certificados_uno_por_categoria
  on public.certificado_destinos (categoria_id, condicional) where activo and categoria_id is not null;
create unique index certificados_uno_por_servicio
  on public.certificado_destinos (servicio_id, condicional) where activo and servicio_id is not null;

-- Pasar las condicionales de la 40: el certificado que se usa solo en el servicio condicional (sin
-- "todos los servicios") pasa a ser el condicional del aprobado. Uno por aprobado (el primero).
do $$
declare
  r record;
begin
  for r in
    select distinct on (s.condicional_de) c.id as certificado_id, s.id as servicio_id,
           s.condicional_de as aprobado_id, s.dias_vuelta
    from public.servicios s
    join public.certificado_destinos d on d.servicio_id = s.id
    join public.certificados c on c.id = d.certificado_id
    where s.condicional_de is not null
      and not c.todos_servicios
      and not exists (select 1 from public.certificado_destinos o
                      where o.certificado_id = c.id and o.id <> d.id)
    order by s.condicional_de, c.activo desc, c.id
  loop
    update public.certificados
    set condicional = true, dias_vuelta = r.dias_vuelta
    where id = r.certificado_id;
    update public.certificado_destinos
    set servicio_id = r.aprobado_id, condicional = true
    where certificado_id = r.certificado_id;
  end loop;
end;
$$;

-- Los servicios condicionales de la 40 dejan de venderse (conservan su historial).
update public.servicios set activo = false where condicional_de is not null and activo;

-- Servicios: sin condicional ----------------------------------------------------------------------

drop trigger servicios_condicional on public.servicios;
drop function public.tg_servicios_condicional();
alter table public.servicios
  drop constraint servicios_condicional_completa,
  drop constraint servicios_dias_vuelta_validos,
  drop constraint servicios_condicional_de_otro,
  drop column condicional_de,
  drop column dias_vuelta;

-- La foto de la condicional la pone registrar_venta (ya no sale del servicio).
drop trigger ventas_condicional on public.ventas;
drop function public.tg_ventas_condicional();

-- Choques con otro certificado activo del mismo tipo (interna) ----------------------------------

drop function public._validar_destinos_certificado(bigint, boolean, bigint[], bigint[]);

create function public._validar_destinos_certificado(
  p_certificado_id bigint,
  p_todos          boolean,
  p_categoria_ids  bigint[],
  p_servicio_ids   bigint[],
  p_condicional    boolean
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
  v_tipo    text := case when p_condicional then 'condicional ' else '' end;
begin
  if p_todos then
    select c.nombre into v_otro
    from public.certificados c
    where c.activo and c.todos_servicios and c.condicional = p_condicional
      and c.id <> p_certificado_id
    limit 1;
    if v_otro is not null then
      raise exception 'Ya hay un certificado %activo para todos los servicios: "%". Desactivalo antes.',
        v_tipo, v_otro using errcode = 'P0001';
    end if;
  end if;

  select cs.nombre, c.nombre into v_destino, v_otro
  from public.certificado_destinos d
  join public.certificados c on c.id = d.certificado_id
  join public.categorias_servicio cs on cs.id = d.categoria_id
  where d.activo and d.condicional = p_condicional and d.certificado_id <> p_certificado_id
    and d.categoria_id = any (coalesce(p_categoria_ids, '{}'))
  order by cs.nombre
  limit 1;
  if v_destino is not null then
    raise exception 'La categoría "%" ya usa el certificado %activo "%". Desactivalo o quitale esa categoría antes.',
      v_destino, v_tipo, v_otro using errcode = 'P0001';
  end if;

  select s.nombre, c.nombre into v_destino, v_otro
  from public.certificado_destinos d
  join public.certificados c on c.id = d.certificado_id
  join public.servicios s on s.id = d.servicio_id
  where d.activo and d.condicional = p_condicional and d.certificado_id <> p_certificado_id
    and d.servicio_id = any (coalesce(p_servicio_ids, '{}'))
  order by s.nombre
  limit 1;
  if v_destino is not null then
    raise exception 'El servicio "%" ya usa el certificado %activo "%". Desactivalo o quitale ese servicio antes.',
      v_destino, v_tipo, v_otro using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public._validar_destinos_certificado(bigint, boolean, bigint[], bigint[], boolean)
  from public, authenticated, anon;

-- Activar / desactivar o cambiar el tipo: valida y copia `activo` y `condicional` a los destinos ---

create or replace function public.tg_certificados_destinos_activo()
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
            where d.certificado_id = new.id and d.servicio_id is not null),
      new.condicional);
  end if;
  update public.certificado_destinos set activo = new.activo, condicional = new.condicional
  where certificado_id = new.id and (activo <> new.activo or condicional <> new.condicional);
  return new;
end;
$$;

drop trigger certificados_destinos_activo on public.certificados;
create trigger certificados_destinos_activo
  before update of activo, condicional on public.certificados
  for each row when (old.activo is distinct from new.activo
                     or old.condicional is distinct from new.condicional)
  execute function public.tg_certificados_destinos_activo();

-- Fijar los destinos de una vez (admin): igual que la 39, con el tipo del certificado ------------

create or replace function public.fijar_destinos_certificado(
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
  v_activo      boolean;
  v_condicional boolean;
  v_categorias  bigint[];
  v_servicios   bigint[];
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

  select c.activo, c.condicional into v_activo, v_condicional
  from public.certificados c where c.id = p_certificado_id for update;
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
    perform public._validar_destinos_certificado(
      p_certificado_id, p_todos, v_categorias, v_servicios, v_condicional);
  end if;

  update public.certificados set todos_servicios = p_todos where id = p_certificado_id;

  delete from public.certificado_destinos
  where certificado_id = p_certificado_id
    and (   (categoria_id is not null and categoria_id <> all (v_categorias))
         or (servicio_id  is not null and servicio_id  <> all (v_servicios)));

  insert into public.certificado_destinos (certificado_id, categoria_id, activo, condicional)
  select p_certificado_id, x, v_activo, v_condicional from unnest(v_categorias) x
  where not exists (select 1 from public.certificado_destinos d
                    where d.certificado_id = p_certificado_id and d.categoria_id = x);

  insert into public.certificado_destinos (certificado_id, servicio_id, activo, condicional)
  select p_certificado_id, x, v_activo, v_condicional from unnest(v_servicios) x
  where not exists (select 1 from public.certificado_destinos d
                    where d.certificado_id = p_certificado_id and d.servicio_id = x);
end;
$$;

-- Certificado de un servicio por tipo: el activo más específico (servicio > categoría > todos) -----

create function public._certificado_para(p_servicio_id bigint, p_condicional boolean)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select x.id
  from public.servicios s
  cross join lateral (
    select d.certificado_id as id, 1 as prioridad
    from public.certificado_destinos d
    where d.activo and d.condicional = p_condicional and d.servicio_id = s.id
    union all
    select d.certificado_id, 2
    from public.certificado_destinos d
    where d.activo and d.condicional = p_condicional and d.categoria_id = s.categoria_id
    union all
    select c.id, 3
    from public.certificados c
    where c.activo and c.condicional = p_condicional and c.todos_servicios
  ) x
  where s.id = p_servicio_id
    and s.requiere_certificado
  order by x.prioridad
  limit 1
$$;

revoke all on function public._certificado_para(bigint, boolean) from public, authenticated, anon;

-- El de siempre (el que se entrega al aprobar). Misma firma que la 39.
create or replace function public.certificado_para_servicio(p_servicio_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();
  return public._certificado_para(p_servicio_id, false);
end;
$$;

-- El condicional del servicio (null si no tiene): la caja ofrece "Condicional" solo si existe.
create function public.certificado_condicional_para_servicio(p_servicio_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();
  return public._certificado_para(p_servicio_id, true);
end;
$$;

revoke all on function public.certificado_condicional_para_servicio(bigint) from public, anon;
grant execute on function public.certificado_condicional_para_servicio(bigint) to authenticated;

-- Stock: el tipo y los días (al final de la vista; la RPC valorizada se rehace) ------------------

create or replace view public.v_stock_certificados
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
  c.activo,
  c.condicional,
  c.dias_vuelta
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

drop function public.stock_certificados_valorizado();

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
  activo           boolean,
  condicional      boolean,
  dias_vuelta      smallint
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
    v.semaforo, v.activo, v.condicional, v.dias_vuelta
  from public.v_stock_certificados v
  join public.certificados c on c.id = v.id
  order by v.activo desc, v.nombre;
end;
$$;

revoke all on function public.stock_certificados_valorizado() from public, anon;
grant execute on function public.stock_certificados_valorizado() to authenticated;

-- Condicionales de una patente: sin `condicional_id` (la nueva se hace con el mismo servicio) ------

drop function public.condicionales_de_patente(text);

/**
 * Condicionales sin usar (no anuladas y sin vuelta) de una patente, sin costos: primero las vigentes (la
 * más vieja primero: vence antes) y después las vencidas (la más nueva primero), hasta 20.
 * `condicional_nombre` = el certificado condicional entregado; `servicio_id` = el servicio al que vuelve.
 */
create function public.condicionales_de_patente(p_patente text)
returns table (
  venta_id           bigint,
  fecha              date,
  condicional_nombre text,
  servicio_id        bigint,
  servicio_nombre    text,
  vence              date,
  vigente            boolean,
  pagado             numeric,
  saldo              numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patente text := public._normalizar_patente(p_patente);
  v_hoy     date := public.fecha_local(now());
begin
  perform public._exigir_usuario();
  return query
    select v.id, public.fecha_local(v.creado_en), coalesce(c.nombre, 'Condicional'),
           s.id, s.nombre, v.condicional_vence, v.condicional_vence >= v_hoy,
           v.precio::numeric, v.condicional_saldo::numeric
    from public.ventas v
    join public.servicios s on s.id = v.condicional_servicio_id
    left join public.certificados c on c.id = v.certificado_id
    where v.patente = v_patente
      and not v.anulada
      and not exists (select 1 from public.ventas r where r.vuelta_de = v.id and not r.anulada)
    order by (v.condicional_vence >= v_hoy) desc,
             case when v.condicional_vence >= v_hoy then v.creado_en end asc,
             v.creado_en desc, v.id
    limit 20;
end;
$$;

revoke execute on function public.condicionales_de_patente(text) from public, anon;
grant execute on function public.condicionales_de_patente(text) to authenticated;

-- Registrar venta: con el certificado condicional (p_condicional) --------------------------------
-- Firma de la 41 + `p_condicional`. Con `p_condicional` usa el certificado condicional del servicio
-- (si no tiene, 22023) y guarda la foto: vuelve al mismo servicio, vence en los días del certificado,
-- saldo 0 o la otra mitad (`p_condicional_mitad`, solo sin descuento). Sin `p_condicional`, si la
-- patente tiene una condicional vigente y sin usar de este servicio, la venta es la vuelta: cobra el
-- saldo, sin descuento, con el certificado de siempre. Una condicional nueva con otra vigente del mismo
-- servicio se rechaza (hay que registrar la vuelta).

drop function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean);

create function public.registrar_venta(
  p_turno_id          bigint,
  p_servicio_id       bigint,
  p_medio_pago        public.medio_pago default null,
  p_patente           text default null,
  p_pagos             jsonb default null,
  p_descuento_id      bigint default null,
  p_precio_esperado   numeric default null,
  p_condicional_mitad boolean default false,
  p_condicional       boolean default false
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno       public.turnos;
  v_servicio    public.servicios;
  v_descuento   public.descuentos;
  v_monto_desc  numeric(12,2) := 0;
  v_precio      numeric(12,2);
  v_lista       numeric(12,2);
  v_saldo       numeric(12,2);
  v_cert        public.certificados;
  v_cert_id     bigint;
  v_venta       public.ventas;
  v_pagos       jsonb;
  v_suma        numeric;
  v_condicional public.ventas;
  v_es_cond     boolean := coalesce(p_condicional, false);
  v_mitad       boolean := coalesce(p_condicional_mitad, false);
  v_cert_cond   public.certificados;
  v_patente     text := public._normalizar_patente(p_patente);
begin
  perform public._exigir_usuario();

  if p_medio_pago is not null and p_pagos is not null then
    raise exception 'Elegí un medio de pago o un pago mixto, no los dos' using errcode = '22023';
  end if;
  if p_medio_pago is null and p_pagos is null then
    raise exception 'Elegí un medio de pago' using errcode = '22023';
  end if;
  if p_pagos is not null then
    v_pagos := public._validar_pagos_mixtos(p_pagos);
  end if;
  -- $ 0 exacto se acepta (servicio sin cargo o vuelta sin saldo); cualquier otro, un monto válido.
  if p_precio_esperado is not null and p_precio_esperado <> 0 then
    perform public._validar_monto(p_precio_esperado, 'El precio esperado');
  end if;

  -- for share: varias ventas a la vez en la misma caja; serializa con cerrar_turno.
  v_turno := public._turno_para_trabajar(p_turno_id, false);

  select * into v_servicio from public.servicios where id = p_servicio_id;
  if v_servicio.id is null or not v_servicio.activo then
    raise exception 'El servicio no existe o está desactivado' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categorias_servicio
                 where id = v_servicio.categoria_id and activa) then
    raise exception 'La categoría de este servicio está desactivada' using errcode = '22023';
  end if;

  if v_mitad and not v_es_cond then
    raise exception 'Solo una condicional se puede pagar al 50%%' using errcode = '22023';
  end if;
  if v_es_cond then
    v_cert_id := public._certificado_para(v_servicio.id, true);
    if v_cert_id is null then
      raise exception 'El servicio "%" no tiene un certificado condicional: elegí el certificado de siempre',
        v_servicio.nombre using errcode = '22023';
    end if;
    select * into v_cert_cond from public.certificados where id = v_cert_id;
  end if;

  -- ¿Tiene una condicional vigente y sin usar de este servicio? La más vieja (for update: dos ventas a
  -- la vez de la misma condicional se serializan; el índice único es la garantía final).
  if v_patente is not null then
    select v.* into v_condicional
    from public.ventas v
    where v.patente = v_patente
      and v.condicional_servicio_id = v_servicio.id
      and not v.anulada
      and v.condicional_vence >= public.fecha_local(now())
      and not exists (select 1 from public.ventas r where r.vuelta_de = v.id and not r.anulada)
    order by v.creado_en, v.id
    limit 1
    for update of v;
  end if;

  if v_condicional.id is not null and v_es_cond then
    raise exception 'La patente % ya tiene una condicional vigente de "%" (del %): registrá la vuelta',
      v_patente, v_servicio.nombre, to_char(public.fecha_local(v_condicional.creado_en), 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  v_lista := v_servicio.precio;
  v_precio := v_servicio.precio;

  if v_mitad then
    if p_descuento_id is not null then
      raise exception 'Con un descuento la condicional se paga completa: no se puede pagar al 50%%'
        using errcode = 'P0001';
    end if;
    if v_servicio.precio = 0 then
      raise exception 'Un servicio sin cargo no se paga al 50%%' using errcode = '22023';
    end if;
  end if;

  if v_condicional.id is not null then
    -- Lo que faltaba de la condicional ($ 0 si la pagó completa).
    v_lista := v_condicional.condicional_saldo;
    v_precio := v_condicional.condicional_saldo;
    if p_descuento_id is not null then
      raise exception 'La patente % vuelve de la condicional del %: no lleva descuento',
        v_patente, to_char(public.fecha_local(v_condicional.creado_en), 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
    if p_precio_esperado is not null and p_precio_esperado <> v_precio then
      raise exception 'La patente % vuelve de la condicional del %: corresponde cobrar $ %. Revisá la venta.',
        v_patente, to_char(public.fecha_local(v_condicional.creado_en), 'DD/MM/YYYY'), public._pesos(v_precio)
        using errcode = 'P0001';
    end if;
  elsif v_mitad then
    -- La mitad (redondeada a centavos) ahora; el resto queda como saldo para la vuelta.
    v_precio := round(v_servicio.precio / 2, 2);
    v_saldo := v_servicio.precio - v_precio;
  elsif p_descuento_id is not null then
    -- for share: la foto no se mezcla con una edición simultánea del descuento.
    select * into v_descuento from public.descuentos where id = p_descuento_id for share;
    if v_descuento.id is null or not v_descuento.activo then
      raise exception 'El descuento no existe o está desactivado' using errcode = '22023';
    end if;
    if not exists (select 1 from public.descuento_servicios
                   where descuento_id = v_descuento.id and servicio_id = v_servicio.id) then
      raise exception 'El descuento "%" no está habilitado para "%"', v_descuento.nombre, v_servicio.nombre
        using errcode = '22023';
    end if;
    v_monto_desc := public._monto_descuento(v_descuento.tipo, v_descuento.valor, v_servicio.precio);
    v_precio := v_servicio.precio - v_monto_desc;
    if v_monto_desc <= 0 then
      raise exception 'El descuento "%" no descuenta nada sobre el precio de "%"', v_descuento.nombre, v_servicio.nombre
        using errcode = 'P0001';
    end if;
    if v_precio <= 0 then
      raise exception 'Con el descuento "%" el precio de "%" queda en $ %: tiene que ser mayor a cero',
        v_descuento.nombre, v_servicio.nombre, public._pesos(greatest(v_precio, 0))
        using errcode = 'P0001';
    end if;
  end if;

  if p_precio_esperado is not null and p_precio_esperado <> v_precio then
    raise exception 'El precio cambió: ahora es $ %. Revisá la venta.', public._pesos(v_precio)
      using errcode = 'P0001';
  end if;

  if v_pagos is not null then
    select sum((x ->> 'monto')::numeric) into v_suma from jsonb_array_elements(v_pagos) x;
    if v_suma <> v_precio then
      raise exception 'Las partes del pago suman $ % y el precio es $ %: tienen que coincidir',
        public._pesos(v_suma), public._pesos(v_precio)
        using errcode = '22023';
    end if;
  end if;

  -- usuario_id = quien vende (no el turno: el turno es de la caja).
  begin
    insert into public.ventas
      (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id,
       precio, medio_pago, patente,
       precio_lista, monto_descuento, descuento_id, descuento_nombre, descuento_tipo, descuento_valor,
       condicional_servicio_id, condicional_vence, condicional_saldo, vuelta_de)
    values
      (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
       v_precio, p_medio_pago, v_patente,
       v_lista, v_monto_desc, v_descuento.id, v_descuento.nombre, v_descuento.tipo, v_descuento.valor,
       case when v_es_cond then v_servicio.id end,
       case when v_es_cond then public.fecha_local(now()) + v_cert_cond.dias_vuelta end,
       case when v_es_cond then coalesce(v_saldo, 0) end,
       v_condicional.id)
    returning * into v_venta;
  exception when unique_violation then
    raise exception 'La condicional de la patente % ya se usó en otra venta: revisá el historial', v_patente
      using errcode = 'P0001';
  end;

  if v_pagos is null then
    insert into public.venta_pagos (venta_id, medio, monto)
    values (v_venta.id, p_medio_pago, v_venta.precio);
  else
    insert into public.venta_pagos (venta_id, medio, monto)
    select v_venta.id, (x ->> 'medio')::public.medio_pago, (x ->> 'monto')::numeric
    from jsonb_array_elements(v_pagos) x;
  end if;

  if v_servicio.requiere_certificado then
    -- La condicional entrega su certificado; el resto (la vuelta incluida), el de siempre.
    if not v_es_cond then
      v_cert_id := public._certificado_para(v_servicio.id, false);
    end if;

    if v_cert_id is not null then
      select * into v_cert from public.certificados where id = v_cert_id for update;
    end if;

    if v_cert.id is not null and v_cert.stock_hojas > 0 then
      update public.certificados set stock_hojas = stock_hojas - 1 where id = v_cert.id;

      insert into public.movimientos_certificado
        (certificado_id, tipo, hojas, costo_unitario, costo_total,
         stock_resultante, costo_promedio_resultante, venta_id, usuario_id)
      values
        (v_cert.id, 'venta', -1, v_cert.costo_promedio, -round(v_cert.costo_promedio, 2),
         v_cert.stock_hojas - 1, v_cert.costo_promedio, v_venta.id, auth.uid());

      update public.ventas
      set certificado_id = v_cert.id, costo_certificado = v_cert.costo_promedio
      where id = v_venta.id
      returning * into v_venta;

      -- Aviso al cruzar el stock mínimo.
      if v_cert.stock_hojas > v_cert.stock_minimo and v_cert.stock_hojas - 1 <= v_cert.stock_minimo then
        insert into public.alertas (tipo, mensaje, certificado_id, venta_id)
        values ('stock_bajo',
                format('Stock bajo de "%s": quedan %s hojas (mínimo %s)',
                       v_cert.nombre, v_cert.stock_hojas - 1, v_cert.stock_minimo),
                v_cert.id, v_venta.id);
      end if;
    else
      update public.ventas
      set certificado_id = v_cert.id, sin_stock = true
      where id = v_venta.id
      returning * into v_venta;

      insert into public.alertas (tipo, mensaje, certificado_id, venta_id)
      values ('venta_sin_stock',
              case when v_cert.id is null
                then format('Venta #%s (%s) sin certificado: no hay un certificado configurado para este servicio',
                            v_venta.id, v_servicio.nombre)
                else format('Venta #%s (%s) sin certificado: no hay stock de "%s"',
                            v_venta.id, v_servicio.nombre, v_cert.nombre)
              end,
              v_cert.id, v_venta.id);
    end if;
  end if;

  -- La parte en efectivo queda en el cajón de la caja hasta el cierre del turno.
  return v_venta;
end;
$$;

grant execute on function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean)
  to authenticated;
