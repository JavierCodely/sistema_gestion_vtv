-- Emisión ARCA más segura (auditoría de seguridad y revisión de la fase 4b, 2026-11-20).
--
-- 1. Numeración reservada mientras haya un número sin confirmar: antes solo se impedía emitir dos
--    comprobantes a la vez ("procesando"). Si una emisión quedaba "a confirmar" (número N enviado
--    sin respuesta), otro comprobante del mismo punto de venta y tipo podía recibir N; al
--    reconciliar, el primero tomaba como propio el N del otro y quedaba trabado para siempre.
--    Ahora nadie más emite en ese punto de venta y tipo hasta reconciliar el pendiente.
-- 2. Toma con identificador: cada `_arca_tomar` genera `toma` y todas las funciones que cierran la
--    emisión lo exigen. Una ejecución vieja (que siguió viva después de que otra retomó el
--    comprobante) ya no puede pisar el estado. El plazo para retomar una emisión "abandonada" pasa
--    de 2 a 10 minutos: por encima del tiempo máximo de una Edge Function.
-- 3. Foto del emisor: razón social, domicilio, IIBB e inicio de actividades quedan guardados en el
--    comprobante al enviarlo, así la reimpresión muestra lo que se autorizó aunque cambie la
--    configuración.
-- 4. El cajero no puede reintentar en ráfaga: 5 segundos entre intentos del mismo comprobante.

-- ---------------------------------------------------------------------------------- columnas
alter table public.comprobantes
  add column toma uuid,
  add column tomado_en timestamptz,
  add column emisor_razon_social text check (char_length(emisor_razon_social) <= 200),
  add column emisor_domicilio text check (char_length(emisor_domicilio) <= 300),
  add column emisor_iibb text check (char_length(emisor_iibb) <= 50),
  add column emisor_inicio_actividades date;

-- Una emisión en curso al aplicar la migración es una emisión cortada: vuelve a pendiente (si tenía
-- número, lo conserva para reconciliar).
update public.comprobantes set estado = 'pendiente', procesando_desde = null
where estado = 'procesando';

alter table public.comprobantes
  add constraint comprobantes_toma_en_emision check ((estado = 'procesando') = (toma is not null));

-- Los comprobantes ya enviados toman la configuración actual (lo más cercano que hay).
update public.comprobantes c set
  emisor_razon_social = a.razon_social, emisor_domicilio = a.domicilio, emisor_iibb = a.iibb,
  emisor_inicio_actividades = a.inicio_actividades
from public.arca_configuracion a
where a.id and (c.estado = 'autorizado' or c.numero_intentado is not null);

-- Numeración reservada (punto 1): reemplaza al índice de "un solo procesando".
drop index public.comprobantes_un_procesando;
create unique index comprobantes_numeracion_reservada on public.comprobantes
  (ambiente, cuit_emisor, punto_venta, cbte_tipo)
  where estado = 'procesando' or numero_intentado is not null;

-- ---------------------------------------------------------------------- permisos de emisión
create or replace function public.puede_emitir_comprobante(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol  public.rol_usuario := public._exigir_usuario();
  v_comp public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_rol <> 'admin' then
    if v_comp.tipo = 'nota_credito' then
      raise exception 'Solo un administrador puede emitir notas de crédito' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.ventas v join public.turnos t on t.id = v.turno_id
      where v.id = v_comp.venta_id and t.usuario_id = auth.uid() and t.cerrado_en is null
    ) then
      raise exception 'Solo podés facturar las ventas de tu turno abierto' using errcode = '42501';
    end if;
  end if;
  if v_comp.estado = 'autorizado' then
    raise exception 'El comprobante ya está autorizado' using errcode = 'P0001';
  end if;
  if v_comp.estado = 'cancelado' then
    raise exception 'El comprobante está cancelado (la venta se anuló)' using errcode = 'P0001';
  end if;
  -- El cajero no reintenta en ráfaga (punto 4).
  if v_rol <> 'admin' and v_comp.tomado_en > now() - interval '5 seconds' then
    raise exception 'Esperá unos segundos antes de volver a intentar' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- ------------------------------------------------------------------------------------- tomar
create or replace function public._arca_tomar(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.arca_configuracion := public._arca_config_lista();
  v_comp   public.comprobantes;
  v_otro   public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id for update;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_comp.estado in ('autorizado', 'cancelado') then
    raise exception 'El comprobante ya está %', v_comp.estado using errcode = 'P0001';
  end if;
  if v_comp.estado = 'procesando' and v_comp.procesando_desde > now() - interval '10 minutes' then
    raise exception 'El comprobante se está emitiendo en este momento: esperá unos segundos'
      using errcode = 'P0001';
  end if;

  if v_comp.numero_intentado is null then
    if v_comp.tipo = 'factura' then
      -- Todavía no se envió nada: se emite con la configuración vigente.
      v_comp.ambiente := v_config.ambiente;
      v_comp.cuit_emisor := v_config.cuit;
      v_comp.punto_venta := v_config.punto_venta;
    elsif (v_comp.ambiente, v_comp.cuit_emisor) is distinct from (v_config.ambiente, v_config.cuit) then
      raise exception 'La factura original se emitió en % con el CUIT %: la nota de crédito tiene que emitirse con esa misma configuración',
        v_comp.ambiente, v_comp.cuit_emisor using errcode = 'P0001';
    end if;
    -- Foto del emisor con la que se envía (punto 3).
    v_comp.emisor_razon_social := v_config.razon_social;
    v_comp.emisor_domicilio := v_config.domicilio;
    v_comp.emisor_iibb := v_config.iibb;
    v_comp.emisor_inicio_actividades := v_config.inicio_actividades;
  elsif (v_comp.ambiente, v_comp.cuit_emisor) is distinct from (v_config.ambiente, v_config.cuit) then
    raise exception 'Este comprobante quedó a confirmar en % con el CUIT %: volvé a esa configuración para reconciliarlo',
      v_comp.ambiente, v_comp.cuit_emisor using errcode = 'P0001';
  end if;

  -- Otro comprobante del mismo punto de venta y tipo emitiéndose o a confirmar (punto 1).
  select * into v_otro from public.comprobantes
  where id <> v_comp.id and ambiente = v_comp.ambiente and cuit_emisor = v_comp.cuit_emisor
    and punto_venta = v_comp.punto_venta and cbte_tipo = v_comp.cbte_tipo
    and (estado = 'procesando' or numero_intentado is not null)
  limit 1;
  if v_otro.id is not null then
    if v_otro.numero_intentado is not null and v_otro.estado <> 'procesando' then
      raise exception 'La % de la venta N° % quedó a confirmar con ARCA: reintentala primero (hasta confirmarla no se puede emitir otra del mismo tipo)',
        case v_otro.tipo when 'factura' then 'factura' else 'nota de crédito' end, v_otro.venta_id
        using errcode = 'P0001';
    end if;
    raise exception 'Hay otro comprobante del mismo tipo emitiéndose: probá de nuevo en unos segundos'
      using errcode = 'P0001';
  end if;

  begin
    update public.comprobantes set
      ambiente = v_comp.ambiente, cuit_emisor = v_comp.cuit_emisor, punto_venta = v_comp.punto_venta,
      emisor_razon_social = v_comp.emisor_razon_social, emisor_domicilio = v_comp.emisor_domicilio,
      emisor_iibb = v_comp.emisor_iibb, emisor_inicio_actividades = v_comp.emisor_inicio_actividades,
      estado = 'procesando', procesando_desde = now(), toma = gen_random_uuid(), tomado_en = now(),
      intentos = intentos + 1, actualizado_en = now()
    where id = v_comp.id
    returning * into v_comp;
  exception when unique_violation then
    -- Carrera con otra toma simultánea del mismo punto de venta y tipo.
    raise exception 'Hay otro comprobante del mismo tipo emitiéndose: probá de nuevo en unos segundos'
      using errcode = 'P0001';
  end;
  return v_comp;
end;
$$;

-- -------------------------------------------- funciones de cierre: exigen la toma vigente (punto 2)
drop function public._arca_registrar_numero(bigint, bigint, date);
drop function public._arca_autorizar(bigint, bigint, date, text, date, text);
drop function public._arca_rechazar(bigint, text);
drop function public._arca_liberar(bigint, text);
drop function public._arca_descartar_numero(bigint);

-- Fila en emisión con esa toma, bloqueada; si no, la emisión ya no es de quien llama.
create function public._arca_en_emision(p_comprobante_id bigint, p_toma uuid)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  select * into v_comp from public.comprobantes
  where id = p_comprobante_id and estado = 'procesando' and toma = p_toma
  for update;
  if v_comp.id is null then
    raise exception 'El comprobante ya no está en esta emisión (otra la retomó o terminó)'
      using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- Antes de llamar a FECAESolicitar se guarda el número y la fecha que se van a pedir: si la
-- respuesta no llega, el próximo intento reconcilia ese número con FECompConsultar.
create function public._arca_registrar_numero(
  p_comprobante_id bigint, p_toma uuid, p_numero bigint, p_fecha date
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes
  set numero_intentado = p_numero, fecha = p_fecha, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

create function public._arca_autorizar(
  p_comprobante_id bigint, p_toma uuid, p_numero bigint, p_fecha date, p_cae text,
  p_cae_vencimiento date, p_mensaje text default null
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  begin
    update public.comprobantes set
      estado = 'autorizado', numero = p_numero, numero_intentado = null, fecha = p_fecha,
      cae = p_cae, cae_vencimiento = p_cae_vencimiento, mensaje = left(p_mensaje, 2000),
      procesando_desde = null, toma = null, autorizado_en = now(), actualizado_en = now()
    where id = p_comprobante_id
    returning * into v_comp;
  exception when unique_violation then
    -- Ese número ya es de otro comprobante del sistema: nunca se asigna dos veces.
    raise exception 'El número % ya pertenece a otro comprobante: revisá el log de ARCA', p_numero
      using errcode = 'P0001';
  end;
  return v_comp;
end;
$$;

-- ARCA rechazó el comprobante (Resultado R): el número no se consumió.
create function public._arca_rechazar(p_comprobante_id bigint, p_toma uuid, p_mensaje text)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes set
    estado = 'rechazado', numero_intentado = null, fecha = null, mensaje = left(p_mensaje, 2000),
    procesando_desde = null, toma = null, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

-- Error de comunicación (o de autenticación) sin resultado de ARCA: vuelve a pendiente. Si se
-- llegó a registrar un número, queda para reconciliar (y reservado, punto 1).
create function public._arca_liberar(p_comprobante_id bigint, p_toma uuid, p_mensaje text)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes set
    estado = 'pendiente', mensaje = left(p_mensaje, 2000), procesando_desde = null, toma = null,
    fecha = case when numero_intentado is null then null else fecha end, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

-- Reconciliación: el número intentado no figura en ARCA, así que nunca se emitió. Se descarta y el
-- comprobante sigue en emisión para pedir un número nuevo.
create function public._arca_descartar_numero(p_comprobante_id bigint, p_toma uuid)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes set numero_intentado = null, fecha = null, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

revoke all on function
  public._arca_en_emision(bigint, uuid),
  public._arca_registrar_numero(bigint, uuid, bigint, date),
  public._arca_autorizar(bigint, uuid, bigint, date, text, date, text),
  public._arca_rechazar(bigint, uuid, text),
  public._arca_liberar(bigint, uuid, text),
  public._arca_descartar_numero(bigint, uuid)
from public, anon, authenticated;
grant execute on function
  public._arca_en_emision(bigint, uuid),
  public._arca_registrar_numero(bigint, uuid, bigint, date),
  public._arca_autorizar(bigint, uuid, bigint, date, text, date, text),
  public._arca_rechazar(bigint, uuid, text),
  public._arca_liberar(bigint, uuid, text),
  public._arca_descartar_numero(bigint, uuid)
to service_role;

-- ---------------------------------------------------------------------------------- vista
-- Mismas columnas y al final la foto del emisor (create or replace solo permite agregar al final).
create or replace view public.v_comprobantes
with (security_invoker = true)
as
select
  c.id, c.venta_id, v.turno_id, c.tipo, c.asociado_id, c.clase, c.cbte_tipo, c.ambiente,
  c.cuit_emisor, c.punto_venta, c.numero, c.estado, c.fecha, c.fecha_servicio, c.doc_tipo,
  c.doc_nro, c.receptor_nombre, c.condicion_iva_receptor_id, ci.descripcion as condicion_iva_receptor,
  c.neto, c.iva, c.total, c.cae, c.cae_vencimiento, c.mensaje, c.intentos,
  (c.numero_intentado is not null) as a_reconciliar, c.creado_en, c.autorizado_en,
  v.servicio_nombre, v.patente,
  a.cbte_tipo as asociado_cbte_tipo, a.punto_venta as asociado_punto_venta,
  a.numero as asociado_numero, a.fecha as asociado_fecha,
  case when c.estado = 'autorizado' then
    'https://www.arca.gob.ar/fe/qr/?p=' || replace(encode(convert_to(jsonb_build_object(
      'ver', 1,
      'fecha', to_char(c.fecha, 'YYYY-MM-DD'),
      'cuit', c.cuit_emisor::bigint,
      'ptoVta', c.punto_venta,
      'tipoCmp', c.cbte_tipo,
      'nroCmp', c.numero,
      'importe', c.total,
      'moneda', 'PES',
      'ctz', 1,
      'tipoDocRec', c.doc_tipo,
      'nroDocRec', c.doc_nro,
      'tipoCodAut', 'E',
      'codAut', c.cae::bigint
    )::text, 'UTF8'), 'base64'), E'\n', '')
  end as qr_url,
  c.emisor_razon_social, c.emisor_domicilio, c.emisor_iibb, c.emisor_inicio_actividades
from public.comprobantes c
join public.ventas v on v.id = c.venta_id
join public.arca_condiciones_iva ci on ci.id = c.condicion_iva_receptor_id
left join public.comprobantes a on a.id = c.asociado_id;
