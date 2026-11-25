-- Patente repetida: solo las ventas de hoy (decisión del negocio, 2026-11-25).
--
-- El aviso de patente repetida de la caja (migración 45) salta solo si la patente ya se vendió **el
-- mismo día** (día de negocio, hora AR: mismo día, mes y año). Las ventas de otros días no avisan
-- (la condicional vigente o vencida se sigue detectando aparte, con `condicionales_de_patente`).
--
-- `ventas_anteriores_de_patente(p_patente)` mantiene la firma y las columnas; ahora devuelve solo las
-- ventas sin anular de la patente exacta cuyo día de negocio es hoy (también una venta con fecha
-- pasada cargada con la fecha de hoy), de la más nueva a la más vieja, hasta 20.

create or replace function public.ventas_anteriores_de_patente(p_patente text)
returns table (
  venta_id           bigint,
  fecha              date,
  servicio_nombre    text,
  certificado_nombre text,
  condicional        boolean,
  vuelta             boolean
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
  if v_patente is null then
    raise exception 'Ingresá la patente del vehículo' using errcode = '22023';
  end if;
  return query
    select v.id, public.fecha_local(v.creado_en), v.servicio_nombre, c.nombre,
           v.condicional_vence is not null, v.vuelta_de is not null
    from public.ventas v
    left join public.certificados c on c.id = v.certificado_id
    where v.patente = v_patente
      and not v.anulada
      and public.fecha_local(v.creado_en) = v_hoy
    order by v.creado_en desc, v.id desc
    limit 20;
end;
$$;

revoke execute on function public.ventas_anteriores_de_patente(text) from public, anon;
grant execute on function public.ventas_anteriores_de_patente(text) to authenticated;
