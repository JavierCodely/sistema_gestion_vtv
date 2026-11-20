-- Fase 4: para abrir un turno el cajero necesita saber qué cajas están libres. La RLS de `turnos`
-- solo le muestra los propios, así que no puede verlo leyendo la tabla: esta función expone lo
-- mínimo (si la caja está ocupada y por quién), sin totales ni datos del turno ajeno.

create function public.cajas_para_turno()
returns table (id bigint, nombre text, ocupada boolean, ocupada_por text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return query
  select c.id, c.nombre, t.id is not null, p.nombre
  from public.cajas c
  left join public.turnos t on t.caja_id = c.id and t.cerrado_en is null
  left join public.perfiles p on p.id = t.usuario_id
  where c.activa
  order by c.nombre;
end;
$$;

revoke all on function public.cajas_para_turno() from public, anon;
grant execute on function public.cajas_para_turno() to authenticated;
