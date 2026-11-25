-- Patente repetida en la caja (decisión del negocio, 2026-11-24).
--
-- Al pasar el paso de la patente, si el vehículo ya tiene ventas, la caja muestra un aviso con la
-- fecha de cada venta, el servicio y el certificado que se entregó, y pregunta si se sigue con la
-- venta. Si se sigue, el flujo es el mismo de siempre (condicional vigente o vencida, categoría…).
--
-- * `ventas_anteriores_de_patente(p_patente)`: para todos los usuarios activos (cajero incluido),
--   ventas sin anular de la patente exacta (normalizada), de la más nueva a la más vieja, hasta 20.
--   Solo fecha, servicio, certificado y si fue condicional o vuelta: **sin montos, sin medio, sin caja
--   ni quién vendió y sin costos** (la búsqueda completa por patente sigue siendo del admin,
--   `ventas_por_patente`). El cajero ve ventas de turnos ya cerrados solo en estos datos.
-- * Las ventas con fecha pasada no llevan certificado: `certificado_nombre` NULL.

create function public.ventas_anteriores_de_patente(p_patente text)
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
    order by v.creado_en desc, v.id desc
    limit 20;
end;
$$;

revoke execute on function public.ventas_anteriores_de_patente(text) from public, anon;
grant execute on function public.ventas_anteriores_de_patente(text) to authenticated;
