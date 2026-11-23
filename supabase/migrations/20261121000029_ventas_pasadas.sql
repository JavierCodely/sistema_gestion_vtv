-- Ventas con fecha pasada (decisiones del negocio, 2026-11-21):
-- * Solo el admin las carga, eligiendo fecha y hora, caja, servicio, medio de pago, precio y patente.
--   Es carga histórica: el precio se puede cambiar (el servicio pudo costar otra cosa en esa fecha) y
--   se aceptan cajas, servicios y categorías hoy desactivados (pudieron estar activos en esa fecha).
-- * No pertenecen a ningún turno (`turno_id` NULL): no cambian los totales ni las fotos de cierre de
--   los turnos. La fecha elegida va en `creado_en`, así los reportes por día (`fecha_local`) las
--   cuentan en ese día; `cargada_en` guarda cuándo se cargó.
-- * Si fue en efectivo, el monto entra ahora a la caja de cambio (movimiento `venta` en el libro).
-- * No descuentan hojas de certificado ni generan alertas (sin certificado, costo 0, `sin_stock` false).
-- * No se facturan desde el sistema (ARCA no acepta fechas de comprobante viejas).
-- * Anular una venta pasada en efectivo saca el monto de la caja de cambio.

alter table public.ventas
  alter column turno_id drop not null,
  add column cargada_en timestamptz,
  -- Toda venta es de un turno, salvo las cargadas con fecha pasada (y esas no tienen turno).
  add constraint ventas_turno_o_carga_pasada check ((turno_id is null) = (cargada_en is not null));

create index ventas_pasadas on public.ventas (id desc) where turno_id is null;

-- Columna nueva legible (migración 17: el grant de ventas es por columna).
grant select (cargada_en) on public.ventas to authenticated;

create function public.registrar_venta_pasada(
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

  if v_venta.medio_pago = 'efectivo' and v_venta.precio > 0 then
    perform public._mover_efectivo('venta', v_venta.precio,
      format('Venta #%s con fecha %s (%s)', v_venta.id, to_char(p_fecha, 'DD/MM/YYYY'), v_caja.nombre),
      null, v_venta.id, null);
  end if;

  return v_venta;
end;
$$;

revoke execute on function public.registrar_venta_pasada(date, time, bigint, bigint, public.medio_pago, numeric, text)
  from public, anon;
grant execute on function public.registrar_venta_pasada(date, time, bigint, bigint, public.medio_pago, numeric, text)
  to authenticated;

-- Anular: una venta pasada no tiene turno; si fue en efectivo, sale de la caja de cambio. ---------

create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta   public.ventas;
  v_turno   public.turnos;
  v_motivo  text;
  v_factura public.comprobantes;
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

  if v_venta.medio_pago = 'efectivo' and v_venta.precio > 0 then
    if v_turno.id is not null and v_turno.cerrado_en is null then
      if public._efectivo_en_caja(v_turno.id) < 0 then
        raise exception 'La caja del turno no tiene efectivo suficiente para devolver esta venta (en el cajón hay $%)',
          translate(to_char(public._efectivo_en_caja(v_turno.id) + v_venta.precio, 'FM9,999,999,990.00'), ',.', '.,')
          using errcode = 'P0001';
      end if;
    else
      -- Turno cerrado o venta cargada con fecha pasada: el dinero está en la caja de cambio.
      perform public._mover_efectivo('anulacion_venta', -v_venta.precio,
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

-- Facturación: las ventas cargadas con fecha pasada no se facturan. ---------------------------------
-- Trigger y no un cambio en preparar_factura: cubre cualquier camino que cree un comprobante.

create function public.tg_comprobante_sin_venta_pasada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.ventas where id = new.venta_id and turno_id is null) then
    raise exception 'Las ventas cargadas con fecha pasada no se facturan desde el sistema'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_comprobante_sin_venta_pasada() from public, anon, authenticated;

create trigger comprobantes_sin_venta_pasada
  before insert on public.comprobantes
  for each row execute function public.tg_comprobante_sin_venta_pasada();
