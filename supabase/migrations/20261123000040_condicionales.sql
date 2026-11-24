-- =====================================================================
-- Migración 40: condicionales y búsqueda por patente (decisiones del negocio, 2026-11-23)
--
-- Condicional: un servicio puede ser la "condicional" de otro (el aprobado). Se cobra a su precio y
-- consume su propia hoja (el certificado que tenga asignado con "Se usa en"). Si el vehículo vuelve
-- dentro del plazo (días configurables en el servicio condicional) y aprueba, la venta del servicio
-- aprobado para esa patente es **sin cargo ($ 0)**, pero descuenta igual la hoja del servicio aprobado.
--   - `servicios.condicional_de` = el servicio aprobado; `servicios.dias_vuelta` = plazo en días.
--   - La venta de una condicional guarda una foto: `ventas.condicional_servicio_id` (aprobado) y
--     `ventas.condicional_vence` (día de negocio de la venta + días). Cambiar el servicio después no la
--     cambia.
--   - La vuelta es automática: `registrar_venta` del servicio aprobado con una patente que tiene una
--     condicional vigente y sin usar la registra a $ 0 (`ventas.vuelta_de` = la condicional). Una sola
--     vuelta sin cargo por condicional (índice único sin anuladas). Anular la vuelta libera la
--     condicional; una condicional con su vuelta no se anula hasta anular la vuelta.
--   - `condicionales_vigentes(patente)`: para que la caja avise "Vuelve de condicional".
-- Búsqueda por patente: `ventas_por_patente(texto)` (admin), con servicio, certificado entregado y
-- la relación condicional ↔ vuelta.
-- =====================================================================

-- Servicios: condicional de otro servicio ------------------------------------------------------------

alter table public.servicios
  add column condicional_de bigint references public.servicios (id),
  add column dias_vuelta smallint,
  add constraint servicios_condicional_completa
    check ((condicional_de is null) = (dias_vuelta is null)),
  add constraint servicios_dias_vuelta_validos check (dias_vuelta between 1 and 365),
  add constraint servicios_condicional_de_otro check (condicional_de <> id);

create index servicios_condicional_de on public.servicios (condicional_de);

comment on column public.servicios.condicional_de is
  'Si no es NULL, este servicio es una condicional: el servicio aprobado que se entrega sin cargo al volver.';
comment on column public.servicios.dias_vuelta is
  'Días desde la condicional para volver sin cargo (1 a 365). Solo en servicios condicionales.';

-- Una condicional apunta a un servicio aprobado (que no es condicional), y un servicio aprobado no
-- puede pasar a ser condicional: no hay cadenas.
create function public.tg_servicios_condicional()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_destino public.servicios;
  v_otro    text;
begin
  if new.condicional_de is null then
    return new;
  end if;
  select * into v_destino from public.servicios where id = new.condicional_de;
  if v_destino.id is not null and v_destino.condicional_de is not null then
    raise exception 'El servicio "%" también es una condicional: elegí el servicio que se entrega al aprobar',
      v_destino.nombre using errcode = '22023';
  end if;
  select nombre into v_otro from public.servicios
  where condicional_de = new.id order by nombre limit 1;
  if v_otro is not null then
    raise exception 'El servicio "%" es el que se entrega al volver de "%": no puede ser una condicional',
      new.nombre, v_otro using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_servicios_condicional() from public, authenticated, anon;

create trigger servicios_condicional
  before insert or update of condicional_de, dias_vuelta on public.servicios
  for each row execute function public.tg_servicios_condicional();

grant insert (condicional_de, dias_vuelta), update (condicional_de, dias_vuelta)
  on public.servicios to authenticated;

-- Ventas: foto de la condicional y vuelta ------------------------------------------------------------

alter table public.ventas
  add column condicional_servicio_id bigint references public.servicios (id),
  add column condicional_vence date,
  add column vuelta_de bigint references public.ventas (id),
  add constraint ventas_condicional_completa
    check ((condicional_servicio_id is null) = (condicional_vence is null)),
  add constraint ventas_vuelta_sin_cargo check (vuelta_de is null or precio = 0),
  add constraint ventas_vuelta_no_condicional
    check (vuelta_de is null or condicional_servicio_id is null);

comment on column public.ventas.condicional_servicio_id is
  'Venta de una condicional: servicio aprobado que se entrega sin cargo al volver (foto).';
comment on column public.ventas.condicional_vence is
  'Venta de una condicional: último día (de negocio) para volver sin cargo (foto).';
comment on column public.ventas.vuelta_de is
  'Vuelta sin cargo: la venta de la condicional que la habilitó.';

-- Una sola vuelta sin cargo por condicional (anular la vuelta la libera).
create unique index ventas_una_vuelta_por_condicional on public.ventas (vuelta_de) where not anulada;
create index ventas_patente on public.ventas (patente text_pattern_ops);
create index ventas_condicional_patente on public.ventas (patente, condicional_servicio_id)
  where condicional_servicio_id is not null and not anulada;

grant select (condicional_servicio_id, condicional_vence, vuelta_de) on public.ventas to authenticated;

-- La foto se toma al insertar, por cualquier camino (caja o venta con fecha pasada).
create function public.tg_ventas_condicional()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_servicio public.servicios;
begin
  if new.vuelta_de is not null then
    new.condicional_servicio_id := null;
    new.condicional_vence := null;
    return new;
  end if;
  select * into v_servicio from public.servicios where id = new.servicio_id;
  if v_servicio.condicional_de is not null then
    new.condicional_servicio_id := v_servicio.condicional_de;
    new.condicional_vence := public.fecha_local(new.creado_en) + v_servicio.dias_vuelta;
  else
    new.condicional_servicio_id := null;
    new.condicional_vence := null;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_ventas_condicional() from public, authenticated, anon;

create trigger ventas_condicional
  before insert on public.ventas
  for each row execute function public.tg_ventas_condicional();

-- Una condicional que ya tuvo su vuelta sin cargo no se anula (el vehículo se llevó la hoja sin pagar).
create function public.tg_ventas_condicional_anulada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vuelta bigint;
begin
  select id into v_vuelta from public.ventas
  where vuelta_de = new.id and not anulada
  order by id limit 1;
  if v_vuelta is not null then
    raise exception 'Esta condicional ya se usó en la venta N° % (vuelta sin cargo): anulá primero esa venta',
      v_vuelta using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_ventas_condicional_anulada() from public, authenticated, anon;

create trigger ventas_condicional_anulada
  before update of anulada on public.ventas
  for each row
  when (new.anulada and not old.anulada and old.condicional_servicio_id is not null)
  execute function public.tg_ventas_condicional_anulada();

-- Condicional vigente ---------------------------------------------------------------------------------

create function public._normalizar_patente(p_patente text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_patente, ''), '\s', '', 'g')), '')
$$;

revoke all on function public._normalizar_patente(text) from public, authenticated, anon;

/**
 * Condicionales vigentes y sin usar de una patente (las más viejas primero: vencen antes). Sin montos.
 * La caja la usa para avisar "Vuelve de condicional"; la regla la aplica `registrar_venta`.
 */
create function public.condicionales_vigentes(p_patente text)
returns table (
  venta_id               bigint,
  fecha                  date,
  condicional_nombre     text,
  servicio_id            bigint,
  servicio_nombre        text,
  vence                  date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patente text := public._normalizar_patente(p_patente);
begin
  perform public._exigir_usuario();
  return query
    select v.id, public.fecha_local(v.creado_en), v.servicio_nombre,
           s.id, s.nombre, v.condicional_vence
    from public.ventas v
    join public.servicios s on s.id = v.condicional_servicio_id
    where v.patente = v_patente
      and not v.anulada
      and v.condicional_vence >= public.fecha_local(now())
      and not exists (select 1 from public.ventas r where r.vuelta_de = v.id and not r.anulada)
    order by v.creado_en, v.id;
end;
$$;

revoke execute on function public.condicionales_vigentes(text) from public, anon;
grant execute on function public.condicionales_vigentes(text) to authenticated;

-- Registrar venta: la vuelta de una condicional es sin cargo ------------------------------------------
-- Misma firma que la migración 33. Cambios: si el servicio es el aprobado de una condicional vigente y
-- sin usar de esa patente, la venta es la vuelta (precio $ 0, sin descuento, `vuelta_de`). La hoja se
-- descuenta como en cualquier venta del servicio.

create or replace function public.registrar_venta(
  p_turno_id        bigint,
  p_servicio_id     bigint,
  p_medio_pago      public.medio_pago default null,
  p_patente         text default null,
  p_pagos           jsonb default null,
  p_descuento_id    bigint default null,
  p_precio_esperado numeric default null
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
  v_cert        public.certificados;
  v_cert_id     bigint;
  v_venta       public.ventas;
  v_pagos       jsonb;
  v_suma        numeric;
  v_condicional public.ventas;
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
  -- $ 0 exacto se acepta (servicio sin cargo o vuelta); cualquier otro valor tiene que ser un monto válido.
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

  -- ¿Vuelve de una condicional? La más vieja vigente y sin usar (for update: dos vueltas a la vez
  -- de la misma condicional se serializan; el índice único es la garantía final).
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

  v_lista := v_servicio.precio;
  v_precio := v_servicio.precio;

  if v_condicional.id is not null then
    if p_descuento_id is not null then
      raise exception 'La patente % vuelve de la condicional del %: es sin cargo y no lleva descuento',
        v_patente, to_char(public.fecha_local(v_condicional.creado_en), 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
    if p_precio_esperado is not null and p_precio_esperado <> 0 then
      raise exception 'La patente % vuelve de la condicional del %: la venta es sin cargo ($ 0). Revisá la venta.',
        v_patente, to_char(public.fecha_local(v_condicional.creado_en), 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
    v_lista := 0;
    v_precio := 0;
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
       vuelta_de)
    values
      (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
       v_precio, p_medio_pago, v_patente,
       v_lista, v_monto_desc, v_descuento.id, v_descuento.nombre, v_descuento.tipo, v_descuento.valor,
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

  -- La parte en efectivo queda en el cajón de la caja hasta el cierre del turno.
  return v_venta;
end;
$$;

-- Búsqueda por patente (admin) ------------------------------------------------------------------------

/**
 * Ventas cuya patente empieza con el texto (mínimo 3 caracteres, normalizado como al vender), de la más
 * nueva a la más vieja, hasta 500. Con el servicio, el certificado entregado y la relación condicional
 * ↔ vuelta. Sin costos.
 */
create function public.ventas_por_patente(p_patente text)
returns table (
  id                   bigint,
  creado_en            timestamptz,
  patente              text,
  caja_nombre          text,
  usuario_nombre       text,
  servicio_nombre      text,
  categoria_nombre     text,
  precio               numeric,
  medio                text,
  anulada              boolean,
  venta_pasada         boolean,
  certificado_nombre   text,
  sin_stock            boolean,
  condicional_vence    date,
  condicional_servicio text,
  vuelta_de            bigint,
  vuelta_venta_id      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patente text := public._normalizar_patente(p_patente);
begin
  perform public._exigir_admin();
  if v_patente is null or char_length(v_patente) < 3 then
    raise exception 'Escribí al menos 3 caracteres de la patente' using errcode = '22023';
  end if;
  return query
    select v.id, v.creado_en, v.patente, c.nombre, p.nombre_completo, v.servicio_nombre, cat.nombre,
           v.precio, coalesce(v.medio_pago::text, 'mixto'), v.anulada, v.turno_id is null,
           cert.nombre, v.sin_stock, v.condicional_vence, sc.nombre, v.vuelta_de,
           (select r.id from public.ventas r where r.vuelta_de = v.id and not r.anulada
            order by r.id limit 1)
    from public.ventas v
    join public.cajas c on c.id = v.caja_id
    join public.perfiles p on p.id = v.usuario_id
    join public.categorias_servicio cat on cat.id = v.categoria_id
    left join public.certificados cert on cert.id = v.certificado_id
    left join public.servicios sc on sc.id = v.condicional_servicio_id
    where v.patente like replace(replace(replace(v_patente, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by v.creado_en desc, v.id desc
    limit 500;
end;
$$;

revoke execute on function public.ventas_por_patente(text) from public, anon;
grant execute on function public.ventas_por_patente(text) to authenticated;
