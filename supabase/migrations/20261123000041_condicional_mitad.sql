-- =====================================================================
-- Migración 41: condicional al 50% (decisiones del negocio, 2026-11-23)
--
-- Sobre la 40 (condicionales con vuelta sin cargo), ya aplicada en la nube:
--   - Una condicional sin descuento se puede pagar al 50%: `registrar_venta(..., p_condicional_mitad)`
--     cobra round(precio / 2, 2) y guarda el resto en `ventas.condicional_saldo` (foto). Pagada entera,
--     el saldo es 0. Con descuento se paga completa.
--   - La vuelta dentro del plazo cobra el saldo de la condicional ($ 0 si se pagó entera; el 50% que
--     faltaba si no), sin descuento, y descuenta la hoja del aprobado (como en la 40).
--   - Vencido el plazo no hay vuelta: lo pagado queda en la patente. `condicionales_de_patente(patente)`
--     (reemplaza a `condicionales_vigentes`) lista las condicionales sin usar, vigentes y vencidas, con
--     lo pagado y el saldo, para que la caja avise y ofrezca otra condicional o el aprobado completo.
--   - Impuestos: el monto fijo se reparte por la parte del servicio que cobra cada venta (mitad y mitad;
--     la vuelta a $ 0 no lleva). El porcentaje ya va sobre lo pagado.
--   - `ventas_por_patente` suma `condicional_saldo`.
-- =====================================================================

-- Ventas: saldo de la condicional ---------------------------------------------------------------------

alter table public.ventas add column condicional_saldo numeric(12,2);

-- Las condicionales ya vendidas (con la 40) se pagaron enteras.
update public.ventas set condicional_saldo = 0 where condicional_servicio_id is not null;

alter table public.ventas
  drop constraint ventas_condicional_completa,
  add constraint ventas_condicional_completa
    check ((condicional_servicio_id is null) = (condicional_vence is null)
           and (condicional_servicio_id is null) = (condicional_saldo is null)),
  add constraint ventas_condicional_saldo_valido
    check (condicional_saldo <> 'NaN'::numeric and condicional_saldo >= 0),
  -- Al 50% solo sin descuento (con descuento, la condicional se paga completa).
  add constraint ventas_condicional_mitad_sin_descuento
    check (coalesce(condicional_saldo, 0) = 0 or descuento_id is null),
  -- La vuelta ya no es siempre $ 0 (cobra el saldo), pero nunca lleva descuento.
  drop constraint ventas_vuelta_sin_cargo,
  add constraint ventas_vuelta_sin_descuento check (vuelta_de is null or descuento_id is null),
  -- Lo cobrado = lista − descuento − lo que queda para la vuelta (reemplaza el CHECK de la migración 31).
  drop constraint ventas_precio_con_descuento,
  add constraint ventas_precio_cobrado
    check (precio = precio_lista - monto_descuento - coalesce(condicional_saldo, 0));

comment on column public.ventas.condicional_servicio_id is
  'Venta de una condicional: servicio aprobado que se entrega sin cargo al volver (foto).';
comment on column public.ventas.condicional_vence is
  'Venta de una condicional: último día (de negocio) para volver sin cargo (foto).';
comment on column public.ventas.condicional_saldo is
  'Venta de una condicional: lo que falta pagar al volver dentro del plazo (0 si pagó el total; foto).';
comment on column public.ventas.vuelta_de is
  'Vuelta sin cargo: la venta de la condicional que la habilitó.';

grant select (condicional_servicio_id, condicional_vence, condicional_saldo, vuelta_de)
  on public.ventas to authenticated;

-- La foto se toma al insertar, por cualquier camino (caja o venta con fecha pasada).
create or replace function public.tg_ventas_condicional()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_servicio public.servicios;
begin
  if new.vuelta_de is null then
    select * into v_servicio from public.servicios where id = new.servicio_id;
  end if;
  if v_servicio.condicional_de is not null then
    new.condicional_servicio_id := v_servicio.condicional_de;
    new.condicional_vence := public.fecha_local(new.creado_en) + v_servicio.dias_vuelta;
    -- El saldo lo pone `registrar_venta` (pago al 50%); por cualquier otro camino, pagó el total.
    new.condicional_saldo := coalesce(new.condicional_saldo, 0);
  else
    new.condicional_servicio_id := null;
    new.condicional_vence := null;
    new.condicional_saldo := null;
  end if;
  return new;
end;
$$;

-- Una condicional que ya tuvo su vuelta no se anula (la vuelta cobró contando con lo pagado en ella).
create or replace function public.tg_ventas_condicional_anulada()
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
    raise exception 'Esta condicional ya se usó en la venta N° % (vuelta de la condicional): anulá primero esa venta',
      v_vuelta using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Condicionales de una patente (reemplaza a `condicionales_vigentes`) --------------------------------

drop function public.condicionales_vigentes(text);

/**
 * Condicionales sin usar (no anuladas y sin vuelta) de una patente, sin costos: primero las vigentes (la
 * más vieja primero: vence antes) y después las vencidas (la más nueva primero), hasta 20. La caja la usa
 * para avisar "Vuelve de condicional" o "La condicional venció"; la regla la aplica `registrar_venta`.
 * `condicional_id` = el servicio condicional (para hacer otra); `servicio_id` = el aprobado.
 */
create function public.condicionales_de_patente(p_patente text)
returns table (
  venta_id           bigint,
  fecha              date,
  condicional_id     bigint,
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
    select v.id, public.fecha_local(v.creado_en), v.servicio_id, v.servicio_nombre,
           s.id, s.nombre, v.condicional_vence, v.condicional_vence >= v_hoy,
           v.precio::numeric, v.condicional_saldo::numeric
    from public.ventas v
    join public.servicios s on s.id = v.condicional_servicio_id
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

-- Registrar venta: condicional al 50% y vuelta de una condicional ---------------------------------------
-- Firma de la migración 33 + `p_condicional_mitad` (pagar al 50% una condicional sin descuento). Si el
-- servicio es el aprobado de una condicional vigente y sin usar de esa patente, la venta es la vuelta:
-- cobra el saldo de la condicional ($ 0 o la otra mitad), sin descuento, con `vuelta_de`. La hoja se
-- descuenta como en cualquier venta del servicio.

drop function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric);

create function public.registrar_venta(
  p_turno_id          bigint,
  p_servicio_id       bigint,
  p_medio_pago        public.medio_pago default null,
  p_patente           text default null,
  p_pagos             jsonb default null,
  p_descuento_id      bigint default null,
  p_precio_esperado   numeric default null,
  p_condicional_mitad boolean default false
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

  if coalesce(p_condicional_mitad, false) then
    if v_servicio.condicional_de is null then
      raise exception 'Solo una condicional se puede pagar al 50%%' using errcode = '22023';
    end if;
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
  elsif coalesce(p_condicional_mitad, false) then
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
       condicional_saldo, vuelta_de)
    values
      (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
       v_precio, p_medio_pago, v_patente,
       v_lista, v_monto_desc, v_descuento.id, v_descuento.nombre, v_descuento.tipo, v_descuento.valor,
       v_saldo, v_condicional.id)
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

grant execute on function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean)
  to authenticated;

-- Impuestos: el monto fijo se reparte entre la condicional y su vuelta ---------------------------------
-- Igual que la migración 36, con una fracción del servicio que cobra esta venta: la condicional al 50%
-- lleva su parte (precio / (precio + saldo)) y la vuelta la suya (precio / total de la condicional); la
-- vuelta de una condicional pagada completa lleva 0. El resto de las ventas, 1 (sin cambios).

create or replace function public._calcular_impuestos_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta    public.ventas;
  v_origen   public.ventas;
  v_fraccion numeric := 1;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    return;
  end if;

  if v_venta.condicional_saldo > 0 then
    v_fraccion := v_venta.precio / (v_venta.precio + v_venta.condicional_saldo);
  elsif v_venta.vuelta_de is not null then
    select * into v_origen from public.ventas where id = v_venta.vuelta_de;
    v_fraccion := case when v_origen.precio + v_origen.condicional_saldo > 0
                       then v_venta.precio / (v_origen.precio + v_origen.condicional_saldo)
                       else 0 end;
  end if;

  delete from public.venta_impuestos where venta_id = p_venta_id;

  insert into public.venta_impuestos
    (venta_id, impuesto_id, impuesto_nombre, tipo, valor, medio, base, monto)
  with alcanzados as (
    select i.id, i.nombre, i.tipo, i.valor, i.medios
    from public.impuestos i
    where i.activo
      and (i.todos_servicios
           or exists (select 1 from public.impuesto_servicios s
                      where s.impuesto_id = i.id and s.servicio_id = v_venta.servicio_id))
  ),
  partes as (
    select a.id, a.nombre, a.tipo, a.valor, p.medio, p.monto as base,
           sum(p.monto) over (partition by a.id) as base_alcanzada,
           row_number() over (partition by a.id order by p.monto desc, p.medio) as orden
    from alcanzados a
    join public.venta_pagos p on p.venta_id = p_venta_id and p.medio = any (a.medios)
  ),
  con_total as (
    select pt.*,
           (case pt.tipo
              when 'porcentaje' then round(pt.base_alcanzada * pt.valor / 100, 2)
              else round(pt.valor * v_fraccion
                         * case when v_venta.precio = 0 then 1
                                else pt.base_alcanzada / v_venta.precio end, 2)
            end) as total
    from partes pt
  ),
  repartido as (
    select ct.*,
           (case when ct.base_alcanzada = 0 then (case when ct.orden = 1 then ct.total else 0 end)
                 else round(ct.total * ct.base / ct.base_alcanzada, 2) end) as parte
    from con_total ct
  ),
  final as (
    select r.id, r.nombre, r.tipo, r.valor, r.medio, r.base,
           (case when r.orden = 1
                 then r.total - (sum(r.parte) over (partition by r.id) - r.parte)
                 else r.parte end) as monto
    from repartido r
    where r.total > 0
  )
  select p_venta_id, f.id, f.nombre, f.tipo, f.valor, f.medio, f.base, f.monto
  from final f
  where f.monto > 0;
end;
$$;

revoke execute on function public._calcular_impuestos_venta(bigint) from public, anon, authenticated;

-- Búsqueda por patente (admin): suma `condicional_saldo` (cambia el tipo de retorno: se recrea) ---------

drop function public.ventas_por_patente(text);

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
  condicional_saldo    numeric,
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
           cert.nombre, v.sin_stock, v.condicional_vence, v.condicional_saldo::numeric, sc.nombre, v.vuelta_de,
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
