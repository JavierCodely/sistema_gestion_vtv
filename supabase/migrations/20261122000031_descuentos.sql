-- Descuentos (decisión del negocio, 2026-11-22):
-- * Catálogo `descuentos` del admin: nombre (normalizado, único sin mayúsculas), tipo (porcentaje o
--   monto fijo), valor y activo. CRUD directo con grants por columna; se desactiva, no se borra si se
--   usó en una venta (FK). El cajero lee solo los activos.
-- * Disponibilidad por servicio (`descuento_servicios`). La fija el admin de una vez con la RPC
--   `fijar_servicios_descuento(descuento, servicios[])` (atómica: la UI manda el conjunto final de
--   los switches; el switch de categoría es un atajo de la UI). Un servicio nuevo no se suma solo.
-- * El cajero pide los descuentos de un servicio a `descuentos_para_servicio()`, que ya trae el
--   monto a descontar y el precio final calculados por la BD.
-- * Venta: un descuento opcional (`registrar_venta(..., p_descuento_id)`), activo y habilitado para el
--   servicio, solo en ventas con turno. La venta guarda una foto (`descuento_id`, `descuento_nombre`,
--   `descuento_tipo`, `descuento_valor`, `precio_lista`, `monto_descuento`); `precio` sigue siendo lo
--   cobrado (lista − descuento, > 0). El pago mixto suma contra ese precio final, y todos los totales
--   (turnos, cajón, resumen diario, facturación, anulación) ya usan `precio`/`venta_pagos`.
-- * Precio esperado (`registrar_venta(..., p_precio_esperado)`, opcional): el precio final que el
--   cajero vio en pantalla. Si el servicio o el descuento cambiaron mientras tanto, la venta se
--   rechaza ("El precio cambió: ahora es $ X") en vez de cobrar otro importe. Se valida como un monto
--   (`_validar_monto`) salvo el 0 exacto, que se acepta porque un servicio puede valer $ 0 (mismo
--   criterio que `registrar_venta_pasada`); si el precio real no es 0, igual se rechaza por distinto.
--   Sin el parámetro (llamadas anteriores) no se compara.
-- * Ventas viejas y con fecha pasada: sin descuento (precio_lista = precio, monto 0).
-- * Estadísticas (admin): `resumen_descuentos(desde, hasta)`.

create type public.tipo_descuento as enum ('porcentaje', 'monto_fijo');

-- Catálogo ------------------------------------------------------------------------------------------

create table public.descuentos (
  id             bigint generated always as identity primary key,
  nombre         text not null
    constraint descuentos_nombre_valido check (btrim(nombre) <> '' and char_length(nombre) <= 100),
  tipo           public.tipo_descuento not null,
  -- Porcentaje: 0 < valor < 100 (hasta 2 decimales). Monto fijo: pesos, > 0.
  valor          numeric(12,2) not null
    constraint descuentos_valor_valido
      check (valor <> 'NaN'::numeric and valor > 0 and (tipo <> 'porcentaje' or valor < 100)),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index descuentos_nombre_unico on public.descuentos (lower(nombre));

create trigger descuentos_normalizar_nombre
  before insert or update of nombre on public.descuentos
  for each row execute function public.tg_normalizar_nombre();
create trigger descuentos_actualizado_en
  before update on public.descuentos
  for each row execute function public.tg_actualizado_en();

create table public.descuento_servicios (
  descuento_id bigint not null references public.descuentos (id) on delete cascade,
  servicio_id  bigint not null references public.servicios (id) on delete cascade,
  primary key (descuento_id, servicio_id)
);

create index descuento_servicios_servicio on public.descuento_servicios (servicio_id);

alter table public.descuentos enable row level security;
alter table public.descuento_servicios enable row level security;

create policy "admin lee descuentos, cajero los activos" on public.descuentos
  for select to authenticated
  using ((select public.es_admin()) or (activo and (select public.rol_actual()) is not null));
create policy "admin crea descuentos" on public.descuentos
  for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita descuentos" on public.descuentos
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra descuentos" on public.descuentos
  for delete to authenticated using ((select public.es_admin()));

-- La subconsulta aplica la RLS de descuentos: el cajero ve la disponibilidad de los activos.
create policy "disponibilidad de descuentos visibles" on public.descuento_servicios
  for select to authenticated
  using (exists (select 1 from public.descuentos d where d.id = descuento_servicios.descuento_id));

grant select (id, nombre, tipo, valor, activo, creado_en, actualizado_en) on public.descuentos to authenticated;
grant insert (nombre, tipo, valor, activo), update (nombre, tipo, valor, activo), delete
  on public.descuentos to authenticated;
-- La disponibilidad se escribe solo con fijar_servicios_descuento().
grant select on public.descuento_servicios to authenticated;

-- Monto a descontar de un precio. Uso interno.
create function public._monto_descuento(p_tipo public.tipo_descuento, p_valor numeric, p_precio numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'porcentaje' then round(p_precio * p_valor / 100, 2)
    else p_valor
  end
$$;

revoke execute on function public._monto_descuento(public.tipo_descuento, numeric, numeric)
  from public, anon, authenticated;

-- Fijar de una vez los servicios en los que se puede usar un descuento (admin). --------------------

create function public.fijar_servicios_descuento(p_descuento_id bigint, p_servicio_ids bigint[])
returns public.descuentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_descuento public.descuentos;
  v_ids       bigint[];
begin
  perform public._exigir_admin();

  if p_servicio_ids is null then
    raise exception 'Indicá los servicios del descuento (la lista puede estar vacía)' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(p_servicio_ids) x;
  if array_position(v_ids, null) is not null then
    raise exception 'Hay un servicio inválido en la lista' using errcode = '22023';
  end if;

  select * into v_descuento from public.descuentos where id = p_descuento_id for update;
  if v_descuento.id is null then
    raise exception 'El descuento no existe' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.servicios s where s.id = x)) then
    raise exception 'Hay un servicio que no existe en la lista' using errcode = '22023';
  end if;

  delete from public.descuento_servicios
  where descuento_id = p_descuento_id and servicio_id <> all (v_ids);

  insert into public.descuento_servicios (descuento_id, servicio_id)
  select p_descuento_id, x from unnest(v_ids) x
  on conflict do nothing;

  return v_descuento;
end;
$$;

grant execute on function public.fijar_servicios_descuento(bigint, bigint[]) to authenticated;

-- Descuentos que se pueden usar al vender un servicio, con el monto ya calculado. ------------------
-- Solo los activos, habilitados para el servicio, que descuentan algo (monto redondeado > 0) y dejan
-- un precio final > 0. Servicio desactivado o de una categoría desactivada: vacío (no se puede vender).

create function public.descuentos_para_servicio(p_servicio_id bigint)
returns table (
  id              bigint,
  nombre          text,
  tipo            public.tipo_descuento,
  valor           numeric(12,2),
  precio_lista    numeric(12,2),
  monto_descuento numeric(12,2),
  precio_final    numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return query
  select d.id, d.nombre, d.tipo, d.valor, s.precio,
         public._monto_descuento(d.tipo, d.valor, s.precio)::numeric(12,2),
         (s.precio - public._monto_descuento(d.tipo, d.valor, s.precio))::numeric(12,2)
  from public.servicios s
  join public.categorias_servicio cs on cs.id = s.categoria_id
  join public.descuento_servicios ds on ds.servicio_id = s.id
  join public.descuentos d on d.id = ds.descuento_id
  where s.id = p_servicio_id
    and s.activo
    and cs.activa
    and d.activo
    and public._monto_descuento(d.tipo, d.valor, s.precio) > 0
    and s.precio - public._monto_descuento(d.tipo, d.valor, s.precio) > 0
  order by d.nombre;
end;
$$;

grant execute on function public.descuentos_para_servicio(bigint) to authenticated;

-- Foto del descuento en la venta ---------------------------------------------------------------------

alter table public.ventas
  add column descuento_id     bigint references public.descuentos (id),
  add column descuento_nombre text,
  add column descuento_tipo   public.tipo_descuento,
  add column descuento_valor  numeric(12,2),
  add column precio_lista     numeric(12,2),
  add column monto_descuento  numeric(12,2) not null default 0;

update public.ventas set precio_lista = precio where precio_lista is null;

alter table public.ventas
  alter column precio_lista set not null,
  add constraint ventas_precio_lista_valido check (precio_lista <> 'NaN'::numeric and precio_lista >= 0),
  add constraint ventas_monto_descuento_valido check (monto_descuento <> 'NaN'::numeric and monto_descuento >= 0),
  add constraint ventas_precio_con_descuento check (precio = precio_lista - monto_descuento),
  add constraint ventas_descuento_completo check (
    (descuento_id is null and descuento_nombre is null and descuento_tipo is null
       and descuento_valor is null and monto_descuento = 0)
    or (descuento_id is not null and descuento_nombre is not null and descuento_tipo is not null
       and descuento_valor is not null and monto_descuento > 0)),
  -- Las ventas con fecha pasada no llevan descuento.
  add constraint ventas_descuento_con_turno check (turno_id is not null or descuento_id is null),
  add constraint ventas_descuento_valor_valido check (descuento_valor <> 'NaN'::numeric),
  add constraint ventas_descuento_nombre_largo check (char_length(descuento_nombre) <= 100),
  -- El monto de la foto es el que sale del tipo, el valor y el precio de lista. Es la misma cuenta
  -- que `_monto_descuento()`, escrita inline: esa función no tiene EXECUTE para los clientes y un
  -- CHECK se evalúa con los permisos de quien escribe la fila. Si cambia una, cambiar la otra
  -- (22_descuentos.sql controla que coincidan).
  add constraint ventas_monto_descuento_coherente check (
    descuento_id is null
    or monto_descuento = case descuento_tipo
                           when 'porcentaje' then round(precio_lista * descuento_valor / 100, 2)
                           else descuento_valor
                         end);

create index ventas_descuento on public.ventas (descuento_id) where descuento_id is not null;

-- Columnas nuevas legibles (migración 17: el grant de ventas es por columna).
grant select (descuento_id, descuento_nombre, descuento_tipo, descuento_valor, precio_lista, monto_descuento)
  on public.ventas to authenticated;

-- Registrar venta: + descuento opcional. ------------------------------------------------------------
-- + precio esperado opcional (ver el encabezado). Las llamadas anteriores (un medio, o pago mixto)
-- siguen funcionando: los parámetros nuevos son opcionales. Una sola sobrecarga.

drop function public.registrar_venta(bigint, public.medio_pago, text, jsonb);

create function public.registrar_venta(
  p_servicio_id  bigint,
  p_medio_pago   public.medio_pago default null,
  p_patente      text default null,
  p_pagos        jsonb default null,
  p_descuento_id bigint default null,
  p_precio_esperado numeric default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno     public.turnos;
  v_servicio  public.servicios;
  v_descuento public.descuentos;
  v_monto_desc numeric(12,2) := 0;
  v_precio    numeric(12,2);
  v_cert      public.certificados;
  v_cert_id   bigint;
  v_venta     public.ventas;
  v_pagos     jsonb;
  v_suma      numeric;
  v_patente   text := nullif(upper(regexp_replace(coalesce(p_patente, ''), '\s', '', 'g')), '');
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
  -- $ 0 exacto se acepta (servicio sin cargo); cualquier otro valor tiene que ser un monto válido.
  if p_precio_esperado is not null and p_precio_esperado <> 0 then
    perform public._validar_monto(p_precio_esperado, 'El precio esperado');
  end if;

  select * into v_turno from public.turnos
  where usuario_id = auth.uid() and cerrado_en is null
  for share;  -- serializa con cerrar_turno
  if v_turno.id is null then
    raise exception 'Necesitás un turno abierto para vender' using errcode = 'P0001';
  end if;

  select * into v_servicio from public.servicios where id = p_servicio_id;
  if v_servicio.id is null or not v_servicio.activo then
    raise exception 'El servicio no existe o está desactivado' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categorias_servicio
                 where id = v_servicio.categoria_id and activa) then
    raise exception 'La categoría de este servicio está desactivada' using errcode = '22023';
  end if;

  v_precio := v_servicio.precio;

  if p_descuento_id is not null then
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

  insert into public.ventas
    (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id,
     precio, medio_pago, patente,
     precio_lista, monto_descuento, descuento_id, descuento_nombre, descuento_tipo, descuento_valor)
  values
    (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
     v_precio, p_medio_pago, v_patente,
     v_servicio.precio, v_monto_desc, v_descuento.id, v_descuento.nombre, v_descuento.tipo, v_descuento.valor)
  returning * into v_venta;

  if v_pagos is null then
    insert into public.venta_pagos (venta_id, medio, monto)
    values (v_venta.id, p_medio_pago, v_venta.precio);
  else
    insert into public.venta_pagos (venta_id, medio, monto)
    select v_venta.id, (x ->> 'medio')::public.medio_pago, (x ->> 'monto')::numeric
    from jsonb_array_elements(v_pagos) x;
  end if;

  if v_servicio.requiere_certificado then
    v_cert_id := public.certificado_para_servicio(v_servicio.id);

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

  -- El efectivo de la venta (la parte en efectivo) queda en el cajón hasta el cierre del turno.
  return v_venta;
end;
$$;

grant execute on function public.registrar_venta(bigint, public.medio_pago, text, jsonb, bigint, numeric)
  to authenticated;

-- Venta con fecha pasada: sin descuento (precio de lista = precio cargado). ------------------------

create or replace function public.registrar_venta_pasada(
  p_fecha       date,
  p_hora        time,
  p_caja_id     bigint,
  p_servicio_id bigint,
  p_medio_pago  public.medio_pago,
  p_precio      numeric,
  p_patente     text default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caja     public.cajas;
  v_servicio public.servicios;
  v_momento  timestamptz;
  v_venta    public.ventas;
  v_patente  text := nullif(upper(regexp_replace(coalesce(p_patente, ''), '\s', '', 'g')), '');
begin
  perform public._exigir_admin();

  if p_fecha is null then
    raise exception 'Elegí la fecha de la venta' using errcode = '22023';
  end if;
  if p_hora is null then
    raise exception 'Elegí la hora de la venta' using errcode = '22023';
  end if;
  v_momento := (p_fecha + p_hora) at time zone 'America/Argentina/Buenos_Aires';
  if v_momento >= now() then
    raise exception 'La fecha y hora de la venta tienen que ser anteriores a este momento'
      using errcode = '22023';
  end if;
  if p_fecha < date '2000-01-01' then
    raise exception 'La fecha de la venta no puede ser anterior al 01/01/2000' using errcode = '22023';
  end if;

  if p_medio_pago is null then
    raise exception 'Elegí un medio de pago' using errcode = '22023';
  end if;

  select * into v_caja from public.cajas where id = p_caja_id;
  if v_caja.id is null then
    raise exception 'La caja no existe' using errcode = '22023';
  end if;

  select * into v_servicio from public.servicios where id = p_servicio_id;
  if v_servicio.id is null then
    raise exception 'El servicio no existe' using errcode = '22023';
  end if;

  -- Precio de esa fecha: puede ser $ 0 (como un servicio sin cargo), nunca negativo ni inválido.
  if p_precio is distinct from 0 then
    perform public._validar_monto(p_precio, 'El precio');
  end if;

  insert into public.ventas
    (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id,
     precio, precio_lista, medio_pago, patente, creado_en, cargada_en)
  values
    (null, v_caja.id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
     p_precio, p_precio, p_medio_pago, v_patente, v_momento, now())
  returning * into v_venta;

  insert into public.venta_pagos (venta_id, medio, monto)
  values (v_venta.id, p_medio_pago, v_venta.precio);

  if v_venta.medio_pago = 'efectivo' and v_venta.precio > 0 then
    perform public._mover_efectivo('venta', v_venta.precio,
      format('Venta #%s con fecha %s (%s)', v_venta.id, to_char(p_fecha, 'DD/MM/YYYY'), v_caja.nombre),
      null, v_venta.id, null);
  end if;

  return v_venta;
end;
$$;

-- v_movimientos_caja: + descuento (nombre de la foto, monto y precio de lista; NULL en gastos). -----

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
  coalesce(v.medio_pago::text, 'mixto') as medio,
  v.precio as monto,
  v.patente,
  v.sin_stock,
  v.anulada,
  v.anulada_motivo as motivo_anulacion,
  null::text as nota,
  v.servicio_id,
  null::bigint as categoria_gasto_id,
  (select jsonb_agg(jsonb_build_object('medio', vp.medio, 'monto', vp.monto) order by vp.medio)
   from public.venta_pagos vp where vp.venta_id = v.id) as pagos,
  v.descuento_nombre,
  v.monto_descuento,
  v.precio_lista
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
  g.categoria_id as categoria_gasto_id,
  null::jsonb as pagos,
  null::text as descuento_nombre,
  null::numeric(12,2) as monto_descuento,
  null::numeric(12,2) as precio_lista
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

-- Estadísticas de descuentos (admin). ----------------------------------------------------------------
-- Una sola RPC, fácil de consumir: filas con `agrupacion`
--   'total'     → una fila (id NULL, nombre 'Total') con todas las ventas con descuento;
--   'descuento' → una por descuento (nombre actual del catálogo);
--   'servicio'  → una por servicio (nombre actual del catálogo).
-- Cada fila: cantidad de ventas y total descontado. Sin anuladas; rango por día de negocio (hora AR).
-- Orden: total, descuentos y servicios; dentro de cada grupo de mayor a menor total descontado.

create function public.resumen_descuentos(p_desde date default null, p_hasta date default null)
returns table (
  agrupacion       text,
  id               bigint,
  nombre           text,
  cantidad_ventas  bigint,
  total_descontado numeric(14,2)
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
  with con_descuento as (
    select v.descuento_id, v.servicio_id, v.monto_descuento
    from public.ventas v
    where v.descuento_id is not null
      and not v.anulada
      and (p_desde is null or public.fecha_local(v.creado_en) >= p_desde)
      and (p_hasta is null or public.fecha_local(v.creado_en) <= p_hasta)
  ),
  filas as (
    select 'total'::text as grupo, 0 as orden, null::bigint as clave, 'Total'::text as etiqueta,
           count(*) as cantidad, sum(cd.monto_descuento) as descontado
    from con_descuento cd
    having count(*) > 0
    union all
    select 'descuento', 1, d.id, d.nombre, count(*), sum(cd.monto_descuento)
    from con_descuento cd
    join public.descuentos d on d.id = cd.descuento_id
    group by d.id, d.nombre
    union all
    select 'servicio', 2, s.id, s.nombre, count(*), sum(cd.monto_descuento)
    from con_descuento cd
    join public.servicios s on s.id = cd.servicio_id
    group by s.id, s.nombre
  )
  select f.grupo, f.clave, f.etiqueta, f.cantidad, f.descontado::numeric(14,2)
  from filas f
  order by f.orden, f.descontado desc, f.cantidad desc, f.etiqueta;
end;
$$;

grant execute on function public.resumen_descuentos(date, date) to authenticated;
