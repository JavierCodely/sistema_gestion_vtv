-- Total de ventas realizadas y anuladas de un turno (decisión del negocio, 2026-11-25).
--
-- * `resumen_ventas_de_turno(p_turno_id)`: cantidad y monto de las ventas **realizadas** (sin anular) y de
--   las **anuladas** del turno entero (no depende de los filtros de la pantalla). `precio` es lo cobrado
--   (con descuento; una vuelta de condicional a $ 0 cuenta como venta de $ 0).
-- * La ven el cajero y el admin: cambia la decisión del 2026-11-20 ("el cajero no ve totales") solo para
--   estos dos totales. El cajero, de un turno **abierto** (mismas validaciones que `registrar_venta`); el
--   admin, de cualquier turno. Los totales por medio, gastos, neto y la foto del cierre siguen siendo
--   solo del admin (`v_turnos`).

create function public.resumen_ventas_de_turno(p_turno_id bigint)
returns table (
  realizadas_cantidad integer,
  realizadas_total    numeric(14,2),
  anuladas_cantidad   integer,
  anuladas_total      numeric(14,2)
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos;
begin
  perform public._exigir_usuario();
  if public.es_admin() then
    if p_turno_id is null then
      raise exception 'Elegí el turno' using errcode = '22023';
    end if;
    select * into v_turno from public.turnos where id = p_turno_id;
    if v_turno.id is null then
      raise exception 'El turno elegido no existe' using errcode = '22023';
    end if;
  else
    -- Turno abierto (mismos mensajes que vender en la caja).
    v_turno := public._turno_para_trabajar(p_turno_id, false);
  end if;

  return query
  select
    (count(*) filter (where not v.anulada))::integer,
    coalesce(sum(v.precio) filter (where not v.anulada), 0)::numeric(14,2),
    (count(*) filter (where v.anulada))::integer,
    coalesce(sum(v.precio) filter (where v.anulada), 0)::numeric(14,2)
  from public.ventas v
  where v.turno_id = v_turno.id;
end;
$$;

revoke execute on function public.resumen_ventas_de_turno(bigint) from public, anon;
grant execute on function public.resumen_ventas_de_turno(bigint) to authenticated;
