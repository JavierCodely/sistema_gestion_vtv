-- Apertura y cierre de turnos.

create function public.abrir_turno(p_caja_id bigint)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caja  public.cajas;
  v_turno public.turnos;
begin
  perform public._exigir_usuario();

  select * into v_caja from public.cajas where id = p_caja_id;
  if v_caja.id is null or not v_caja.activa then
    raise exception 'La caja no existe o está desactivada' using errcode = '22023';
  end if;
  if exists (select 1 from public.turnos where usuario_id = auth.uid() and cerrado_en is null) then
    raise exception 'Ya tenés un turno abierto; cerralo antes de abrir otro' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.turnos where caja_id = p_caja_id and cerrado_en is null) then
    raise exception 'La caja "%" ya tiene un turno abierto', v_caja.nombre using errcode = 'P0001';
  end if;

  begin
    insert into public.turnos (caja_id, usuario_id)
    values (p_caja_id, auth.uid())
    returning * into v_turno;
  exception when unique_violation then
    raise exception 'La caja "%" acaba de ser ocupada por otro usuario', v_caja.nombre
      using errcode = 'P0001';
  end;

  return v_turno;
end;
$$;

-- Cierra el turno propio, o cualquiera si lo pide un admin indicando p_turno_id.
create function public.cerrar_turno(p_observaciones text default null, p_turno_id bigint default null)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol   public.rol_usuario := public._exigir_usuario();
  v_turno public.turnos;
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

  update public.turnos t
  set cerrado_en          = now(),
      observaciones       = nullif(btrim(p_observaciones), ''),
      cantidad_ventas     = r.cantidad,
      total_efectivo      = r.efectivo,
      total_transferencia = r.transferencia,
      total_tarjeta       = r.tarjeta,
      total_gastos        = r.gastos
  from (
    select
      count(*) filter (where not v.anulada)                                         as cantidad,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'efectivo'), 0)      as efectivo,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'transferencia'), 0) as transferencia,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'tarjeta'), 0)       as tarjeta,
      (select coalesce(sum(g.monto), 0) from public.gastos g
        where g.turno_id = v_turno.id and not g.anulado)                            as gastos
    from public.ventas v
    where v.turno_id = v_turno.id
  ) r
  where t.id = v_turno.id
  returning t.* into v_turno;

  return v_turno;
end;
$$;
