-- Caja del cajero: efectivo del cajón y anular sus ventas (decisiones del negocio, 2026-11-24).
--
-- * `efectivo_en_caja_de_turno(p_turno_id)`: cualquier usuario activo, de un turno **abierto**, ve el
--   efectivo del cajón (efectivo inicial + parte en efectivo de las ventas − gastos en efectivo, sin
--   anulados; `_efectivo_en_caja`). Es lo único de dinero del turno que ve el cajero: los totales por
--   medio, las observaciones y la foto del cierre siguen siendo solo del admin (`turnos`, `v_turnos`).
--   Un turno cerrado o inexistente se rechaza (como `registrar_venta`).
-- * `anular_venta`: el cajero anula **solo sus ventas** de un turno abierto (motivo obligatorio; queda
--   `anulada_por`, `anulada_en`, `anulada_motivo`). Las de otros, las de turnos cerrados y las cargadas
--   con fecha pasada las sigue anulando solo el admin (42501). Si la venta estaba facturada, la nota de
--   crédito queda pendiente: emitirla sigue siendo del admin (`puede_emitir_comprobante`).
-- * `nombre_usuario`: el cajero ve también el nombre de quien anuló una venta de un turno abierto
--   ("Anuló" en el historial de la caja).

-- Efectivo del cajón -----------------------------------------------------------------------------------

create function public.efectivo_en_caja_de_turno(p_turno_id bigint)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos;
begin
  perform public._exigir_usuario();
  -- Turno abierto (mismas validaciones y mensajes que vender en la caja); lo bloquea `for share`
  -- para leer el cajón coherente con un cierre en curso.
  v_turno := public._turno_para_trabajar(p_turno_id, false);
  return public._efectivo_en_caja(v_turno.id)::numeric(14,2);
end;
$$;

revoke execute on function public.efectivo_en_caja_de_turno(bigint) from public, anon;
grant execute on function public.efectivo_en_caja_de_turno(bigint) to authenticated;

-- Anular venta: el cajero, las suyas de un turno abierto -------------------------------------------------

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
  v_admin    boolean;
begin
  perform public._exigir_usuario();
  v_admin := public.es_admin();
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

  if not v_admin then
    -- Se mira después del bloqueo: si el turno se cerró mientras se esperaba, ya se ve cerrado.
    if v_turno.id is null or v_turno.cerrado_en is not null then
      raise exception 'Solo el administrador anula ventas de un turno cerrado'
        using errcode = '42501';
    end if;
    if v_venta.usuario_id is distinct from auth.uid() then
      raise exception 'Solo podés anular las ventas que registraste vos: pedile al administrador que la anule'
        using errcode = '42501';
    end if;
  end if;

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
      -- Turno cerrado o venta cargada con fecha pasada (solo admin): el dinero está en la caja de cambio.
      perform public._mover_efectivo('anulacion_venta', -v_efectivo,
        'Anulación de venta #' || v_venta.id || ': ' || v_motivo, null, v_venta.id, null);
    end if;
  end if;

  if v_factura.estado = 'autorizado' then
    -- Queda pendiente; la emite el admin (o el admin que anuló, desde la pantalla, en el momento).
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

-- Nombre de quien anuló ----------------------------------------------------------------------------------

create or replace function public.nombre_usuario(p_usuario_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return (
    select p.nombre_completo
    from public.perfiles p
    where p.id = p_usuario_id
      and (public.es_admin()
           or p.id = auth.uid()
           or exists (select 1 from public.turnos t join public.ventas v on v.turno_id = t.id
                      where t.cerrado_en is null and (v.usuario_id = p.id or v.anulada_por = p.id))
           or exists (select 1 from public.turnos t join public.gastos g on g.turno_id = t.id
                      where t.cerrado_en is null and g.usuario_id = p.id))
  -- security definer: lee `turnos` sin su RLS (solo admin); devuelve un nombre, nunca datos del turno.
  );
end;
$$;
