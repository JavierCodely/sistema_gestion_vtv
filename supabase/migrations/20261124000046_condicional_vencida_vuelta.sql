-- Condicional vencida: vuelta fuera de plazo (decisiones del negocio, 2026-11-24).
--
-- Si la patente vuelve con una condicional **vencida** (pasaron los días del certificado), la caja
-- avisa con un modal que se pasó el límite y deja elegir: continuar con el certificado (la vuelta
-- fuera de plazo), cobrar el servicio completo, generar otra condicional o es otra venta.
--
-- * `registrar_venta(..., p_vuelta_vencida bigint)`: el id de la condicional vencida que se honra. La
--   venta es su vuelta (`vuelta_de`) igual que dentro del plazo: cobra el saldo ($ 0 si se pagó entera;
--   el 50% que faltaba si se pagó la mitad), sin descuento, con el certificado de siempre. Puede
--   hacerlo cualquier usuario activo (cajero o admin); queda quién la hizo.
-- * Tiene que ser una condicional de esa patente y ese servicio, sin anular y sin vuelta (si no, 22023
--   o P0001). Si la patente tiene además una condicional **vigente** del servicio, la vuelta es esa
--   (P0001 "…: registrá la vuelta", la caja vuelve a revisar la patente). No se combina con
--   `p_condicional` (22023).
-- * Sin `p_vuelta_vencida` nada cambia: vencida, se cobra entera (o se hace otra condicional).
-- * Una sola vuelta por condicional (índice `ventas_una_vuelta_por_condicional`); anular la vuelta la
--   libera, como siempre. Fuera de plazo se reconoce porque el día de la vuelta es posterior a
--   `condicional_vence` de la condicional.

drop function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean);

create function public.registrar_venta(
  p_turno_id          bigint,
  p_servicio_id       bigint,
  p_medio_pago        public.medio_pago default null,
  p_patente           text default null,
  p_pagos             jsonb default null,
  p_descuento_id      bigint default null,
  p_precio_esperado   numeric default null,
  p_condicional_mitad boolean default false,
  p_condicional       boolean default false,
  p_vuelta_vencida    bigint default null
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
  if p_vuelta_vencida is not null and v_es_cond then
    raise exception 'Una vuelta de condicional no es otra condicional: elegí una de las dos' using errcode = '22023';
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

  if p_vuelta_vencida is not null then
    -- Con una vigente del servicio, la vuelta es esa (la caja no la vio): se revisa la patente.
    if v_condicional.id is not null then
      raise exception 'La patente % tiene una condicional vigente de "%" (del %): registrá la vuelta',
        v_patente, v_servicio.nombre, to_char(public.fecha_local(v_condicional.creado_en), 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
    -- Vuelta fuera de plazo: la condicional vencida, sin anular y sin usar, de esta patente y servicio.
    select v.* into v_condicional
    from public.ventas v
    where v.id = p_vuelta_vencida
    for update of v;
    if v_condicional.id is null
       or v_condicional.patente is distinct from v_patente
       or v_condicional.condicional_servicio_id is distinct from v_servicio.id then
      raise exception 'La condicional elegida no es de la patente % y el servicio "%"', coalesce(v_patente, ''), v_servicio.nombre
        using errcode = '22023';
    end if;
    if v_condicional.anulada then
      raise exception 'La condicional elegida está anulada: revisá la patente' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.ventas r where r.vuelta_de = v_condicional.id and not r.anulada) then
      raise exception 'La condicional de la patente % ya se usó en otra venta: revisá el historial', v_patente
        using errcode = 'P0001';
    end if;
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

grant execute on function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric, boolean, boolean, bigint)
  to authenticated;
