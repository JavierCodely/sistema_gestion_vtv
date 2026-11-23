-- Pago mixto (decisión del negocio, 2026-11-22): una venta con turno (cajero o admin atendiendo una
-- caja) se puede cobrar con más de un medio de pago.
--
-- * La fuente de verdad del cobro es `venta_pagos`: una fila por medio (efectivo, transferencia,
--   tarjeta) con su monto. Una venta de un solo medio tiene una fila con todo el precio; una mixta,
--   2 o 3 filas con medios distintos, cada una > 0, que suman el precio.
-- * `ventas.medio_pago` queda como resumen: el medio si fue uno solo, NULL si fue mixto. No se agrega
--   'mixto' al enum `medio_pago`: `npm run sql:produccion` aplica todas las migraciones en una sola
--   transacción y un valor nuevo de enum no se puede usar en la transacción que lo agrega. Además,
--   'mixto' no es un medio de pago real: no debe poder aparecer en `venta_pagos.medio`.
--   La coherencia entre `ventas` y `venta_pagos` la garantiza un trigger de restricción diferido
--   (se controla al terminar la transacción, cuando la venta ya tiene todos sus pagos).
-- * Todo lo que repartía por `ventas.medio_pago` pasa a repartir por `venta_pagos`: el efectivo del
--   cajón (`_efectivo_en_caja`), las fotos de `cerrar_turno`, `v_turnos`, `resumen_diario()` y la
--   anulación (solo vuelve la parte en efectivo). `v_movimientos_caja.medio` dice 'mixto' y suma la
--   columna `pagos` con el detalle.
-- * Las ventas con fecha pasada siguen con un solo medio (con su fila en `venta_pagos`).

-- Tabla de pagos -----------------------------------------------------------------------------------

create table public.venta_pagos (
  venta_id bigint not null references public.ventas (id),
  medio    public.medio_pago not null,
  -- 0 solo en ventas de $ 0 (venta pasada sin cargo); en un pago mixto cada parte es > 0.
  monto    numeric(12,2) not null
    constraint venta_pagos_monto_valido check (monto <> 'NaN'::numeric and monto >= 0),
  primary key (venta_id, medio)
);

comment on table public.venta_pagos is
  'Cobro de cada venta: una fila por medio de pago. Fuente de verdad de los totales por medio.';

-- Las ventas existentes: una fila con su medio y su precio (también las pasadas y las anuladas).
insert into public.venta_pagos (venta_id, medio, monto)
select v.id, v.medio_pago, v.precio from public.ventas v;

alter table public.ventas alter column medio_pago drop not null;

comment on column public.ventas.medio_pago is
  'Medio de pago si se cobró con uno solo; NULL si fue un pago mixto (detalle en venta_pagos).';

-- Coherencia ventas ↔ venta_pagos (al cerrar la transacción). --------------------------------------

create function public._verificar_pagos_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta    public.ventas;
  v_cantidad int;
  v_suma     numeric;
  v_medio    public.medio_pago;
  v_minimo   numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    return;
  end if;

  select count(*), sum(p.monto), min(p.medio), min(p.monto)
    into v_cantidad, v_suma, v_medio, v_minimo
  from public.venta_pagos p
  where p.venta_id = p_venta_id;

  if v_cantidad = 0
     or v_suma <> v_venta.precio
     or (v_venta.medio_pago is not null and (v_cantidad <> 1 or v_medio <> v_venta.medio_pago))
     or (v_venta.medio_pago is null and (v_cantidad < 2 or v_minimo <= 0)) then
    raise exception 'El cobro de la venta #% no coincide con su precio y medio de pago', p_venta_id
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public._verificar_pagos_venta(bigint) from public, anon, authenticated;

create function public.tg_verificar_pagos_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'ventas' then
    perform public._verificar_pagos_venta(new.id);
  else
    if tg_op in ('INSERT', 'UPDATE') then
      perform public._verificar_pagos_venta(new.venta_id);
    end if;
    if tg_op in ('UPDATE', 'DELETE') then
      perform public._verificar_pagos_venta(old.venta_id);
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_verificar_pagos_venta() from public, anon, authenticated;

create constraint trigger ventas_pagos_coherentes
  after insert or update of precio, medio_pago on public.ventas
  deferrable initially deferred
  for each row execute function public.tg_verificar_pagos_venta();

create constraint trigger venta_pagos_coherentes
  after insert or update or delete on public.venta_pagos
  deferrable initially deferred
  for each row execute function public.tg_verificar_pagos_venta();

-- RLS y grants: misma visibilidad que la venta; se escribe solo por RPC. ---------------------------

alter table public.venta_pagos enable row level security;

-- La subconsulta a `ventas` aplica la RLS de ventas de quien consulta (el cajero, las suyas).
create policy "pagos de ventas visibles" on public.venta_pagos
  for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_pagos.venta_id));

grant select on public.venta_pagos to authenticated;

-- Pagos de un pago mixto: valida y devuelve las partes normalizadas. Uso interno. -----------------
-- p_pagos: [{"medio": "efectivo", "monto": 5000}, {"medio": "tarjeta", "monto": 15000}]

create function public._validar_pagos_mixtos(p_pagos jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parte  jsonb;
  v_medio  public.medio_pago;
  v_monto  numeric;
  v_vistos public.medio_pago[] := '{}';
  v_salida jsonb := '[]';
begin
  if jsonb_typeof(p_pagos) is distinct from 'array' then
    raise exception 'El pago mixto no es válido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_pagos) < 2 then
    raise exception 'Un pago mixto necesita al menos dos medios de pago distintos (si pagó con uno solo, elegí ese medio)'
      using errcode = '22023';
  end if;

  for v_parte in select value from jsonb_array_elements(p_pagos) loop
    if jsonb_typeof(v_parte) is distinct from 'object' then
      raise exception 'El pago mixto no es válido' using errcode = '22023';
    end if;

    if nullif(btrim(v_parte ->> 'medio'), '') is null then
      raise exception 'Elegí el medio de pago de cada parte' using errcode = '22023';
    end if;
    begin
      v_medio := (v_parte ->> 'medio')::public.medio_pago;
    exception when invalid_text_representation then
      raise exception 'El medio de pago "%" no es válido', v_parte ->> 'medio' using errcode = '22023';
    end;
    if v_medio = any (v_vistos) then
      raise exception 'No repitas un medio de pago en el pago mixto (% aparece dos veces)', v_medio
        using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_medio;

    if jsonb_typeof(v_parte -> 'monto') not in ('number', 'string') then
      raise exception 'El monto en % no es válido', v_medio using errcode = '22023';
    end if;
    begin
      v_monto := (v_parte ->> 'monto')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'El monto en % no es válido', v_medio using errcode = '22023';
    end;
    perform public._validar_monto(v_monto, 'El monto en ' || v_medio::text);

    v_salida := v_salida || jsonb_build_object('medio', v_medio, 'monto', v_monto);
  end loop;

  return v_salida;
end;
$$;

revoke execute on function public._validar_pagos_mixtos(jsonb) from public, anon, authenticated;

-- Pesos en formato argentino para los mensajes ($ 20.000,50). Uso interno.
create function public._pesos(p_monto numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(to_char(p_monto, 'FM999,999,999,990.00'), ',.', '.,')
$$;

revoke execute on function public._pesos(numeric) from public, anon, authenticated;

-- Efectivo del cajón: solo la parte en efectivo de cada venta. -------------------------------------

create or replace function public._efectivo_en_caja(p_turno_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.efectivo_inicial, 0)
       + coalesce((select sum(p.monto)
                   from public.ventas v
                   join public.venta_pagos p on p.venta_id = v.id
                   where v.turno_id = t.id and p.medio = 'efectivo' and not v.anulada), 0)
       - coalesce((select sum(g.monto) from public.gastos g
                   where g.turno_id = t.id and g.fuente = 'efectivo' and not g.anulado), 0)
  from public.turnos t
  where t.id = p_turno_id
$$;

-- Cerrar turno: fotos por medio desde los pagos. ---------------------------------------------------

create or replace function public.cerrar_turno(
  p_observaciones text default null,
  p_turno_id      bigint default null
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol      public.rol_usuario := public._exigir_usuario();
  v_turno    public.turnos;
  v_efectivo numeric(12,2);
begin
  if p_turno_id is null then
    select * into v_turno from public.turnos
    where usuario_id = auth.uid() and cerrado_en is null
    for update;
    if v_turno.id is null then
      raise exception 'No tenés un turno abierto' using errcode = 'P0001';
    end if;
  else
    select * into v_turno from public.turnos where id = p_turno_id for update;
    if v_turno.id is null then
      raise exception 'El turno no existe' using errcode = '22023';
    end if;
    if v_turno.usuario_id <> auth.uid() and v_rol <> 'admin' then
      raise exception 'Solo un administrador puede cerrar el turno de otro usuario' using errcode = '42501';
    end if;
    if v_turno.cerrado_en is not null then
      raise exception 'El turno ya estaba cerrado' using errcode = 'P0001';
    end if;
  end if;

  v_efectivo := public._efectivo_en_caja(v_turno.id);

  update public.turnos t
  set cerrado_en          = now(),
      observaciones       = nullif(btrim(p_observaciones), ''),
      cantidad_ventas     = r.cantidad,
      total_efectivo      = r.efectivo,
      total_transferencia = r.transferencia,
      total_tarjeta       = r.tarjeta,
      total_gastos        = r.gastos,
      efectivo_cierre     = v_efectivo
  from (
    select
      (select count(*) from public.ventas v
        where v.turno_id = v_turno.id and not v.anulada)                         as cantidad,
      coalesce(sum(p.monto) filter (where p.medio = 'efectivo'), 0)               as efectivo,
      coalesce(sum(p.monto) filter (where p.medio = 'transferencia'), 0)          as transferencia,
      coalesce(sum(p.monto) filter (where p.medio = 'tarjeta'), 0)                as tarjeta,
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

-- Registrar venta: un medio (como hasta ahora) o pago mixto. ---------------------------------------
-- Llamada de siempre: registrar_venta(p_servicio_id, p_medio_pago, p_patente) sigue funcionando.

drop function public.registrar_venta(bigint, public.medio_pago, text);

create function public.registrar_venta(
  p_servicio_id bigint,
  p_medio_pago  public.medio_pago default null,
  p_patente     text default null,
  p_pagos       jsonb default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno    public.turnos;
  v_servicio public.servicios;
  v_cert     public.certificados;
  v_cert_id  bigint;
  v_venta    public.ventas;
  v_pagos    jsonb;
  v_suma     numeric;
  v_patente  text := nullif(upper(regexp_replace(coalesce(p_patente, ''), '\s', '', 'g')), '');
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

  if v_pagos is not null then
    select sum((x ->> 'monto')::numeric) into v_suma from jsonb_array_elements(v_pagos) x;
    if v_suma <> v_servicio.precio then
      raise exception 'Las partes del pago suman $ % y el precio es $ %: tienen que coincidir',
        public._pesos(v_suma), public._pesos(v_servicio.precio)
        using errcode = '22023';
    end if;
  end if;

  insert into public.ventas
    (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id,
     precio, medio_pago, patente)
  values
    (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
     v_servicio.precio, p_medio_pago, v_patente)
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

grant execute on function public.registrar_venta(bigint, public.medio_pago, text, jsonb) to authenticated;

-- Venta con fecha pasada: un solo medio, con su fila en venta_pagos. -------------------------------

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
     precio, medio_pago, patente, creado_en, cargada_en)
  values
    (null, v_caja.id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
     p_precio, p_medio_pago, v_patente, v_momento, now())
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

-- Anular venta: vuelve solo la parte en efectivo. --------------------------------------------------

create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta    public.ventas;
  v_turno    public.turnos;
  v_motivo   text;
  v_factura  public.comprobantes;
  v_efectivo numeric(12,2);
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'El motivo es obligatorio');

  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe' using errcode = '22023';
  end if;
  -- El turno primero (mismo orden que cerrar_turno y los gastos): serializa el cálculo del cajón.
  if v_venta.turno_id is not null then
    select * into v_turno from public.turnos where id = v_venta.turno_id for update;
  end if;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if v_venta.anulada then
    raise exception 'La venta ya estaba anulada' using errcode = 'P0001';
  end if;

  select * into v_factura from public.comprobantes
  where venta_id = p_venta_id and tipo = 'factura' for update;
  if v_factura.estado = 'procesando' or v_factura.numero_intentado is not null then
    raise exception 'La factura de esta venta se envió a ARCA y falta confirmar el resultado: reintentá la emisión y después anulá la venta'
      using errcode = 'P0001';
  end if;

  update public.ventas
  set anulada = true, anulada_motivo = v_motivo, anulada_por = auth.uid(), anulada_en = now()
  where id = p_venta_id
  returning * into v_venta;

  select coalesce(sum(p.monto), 0) into v_efectivo
  from public.venta_pagos p
  where p.venta_id = p_venta_id and p.medio = 'efectivo';

  if v_efectivo > 0 then
    if v_turno.id is not null and v_turno.cerrado_en is null then
      if public._efectivo_en_caja(v_turno.id) < 0 then
        raise exception 'La caja del turno no tiene efectivo suficiente para devolver esta venta (en el cajón hay $ %)',
          public._pesos(public._efectivo_en_caja(v_turno.id) + v_efectivo)
          using errcode = 'P0001';
      end if;
    else
      -- Turno cerrado o venta cargada con fecha pasada: el dinero está en la caja de cambio.
      perform public._mover_efectivo('anulacion_venta', -v_efectivo,
        'Anulación de venta #' || v_venta.id || ': ' || v_motivo, null, v_venta.id, null);
    end if;
  end if;

  if v_factura.estado = 'autorizado' then
    insert into public.comprobantes (
      venta_id, tipo, asociado_id, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta,
      fecha_servicio, doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor_id,
      neto, iva, total, creado_por)
    values (
      v_venta.id, 'nota_credito', v_factura.id, v_factura.clase,
      case v_factura.clase when 'A' then 3 else 8 end, v_factura.ambiente, v_factura.cuit_emisor,
      v_factura.punto_venta, v_factura.fecha_servicio, v_factura.doc_tipo, v_factura.doc_nro,
      v_factura.receptor_nombre, v_factura.condicion_iva_receptor_id,
      v_factura.neto, v_factura.iva, v_factura.total, auth.uid());
  elsif v_factura.id is not null then
    -- Nunca llegó a ARCA: no hay nada que compensar.
    update public.comprobantes
    set estado = 'cancelado', mensaje = 'Venta anulada antes de facturarse', actualizado_en = now()
    where id = v_factura.id;
  end if;

  return v_venta;
end;
$$;

-- Vistas ---------------------------------------------------------------------------------------------

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
  t.efectivo_cierre
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles p on p.id = t.usuario_id
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
) g on true;

-- medio = 'mixto' en un pago mixto; `pagos` = detalle [{medio, monto}] (NULL en los gastos).
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
   from public.venta_pagos vp where vp.venta_id = v.id) as pagos
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
  null::jsonb as pagos
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

-- Resumen diario: totales por medio desde los pagos. -----------------------------------------------

create or replace function public.resumen_diario(p_desde date default null, p_hasta date default null)
returns table (
  fecha               date,
  cantidad_ventas     bigint,
  total_ventas        numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  total_tarjeta       numeric(14,2),
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
           sum(v.costo_certificado) as costo,
           count(*) filter (where v.sin_stock) as sin_stock
    from public.ventas v
    where not v.anulada
    group by 1
  ),
  pd as (
    select public.fecha_local(v.creado_en) as dia,
           sum(p.monto) filter (where p.medio = 'efectivo') as efectivo,
           sum(p.monto) filter (where p.medio = 'transferencia') as transferencia,
           sum(p.monto) filter (where p.medio = 'tarjeta') as tarjeta
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
    coalesce(pd.tarjeta, 0)::numeric(14,2),
    coalesce(gd.monto, 0)::numeric(14,2),
    (coalesce(vd.monto, 0) - coalesce(gd.monto, 0))::numeric(14,2),
    round(coalesce(vd.costo, 0), 2)::numeric(14,2),
    round(coalesce(vd.monto, 0) - coalesce(vd.costo, 0), 2)::numeric(14,2),
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
