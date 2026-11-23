-- =====================================================================
-- Migración 38: patente obligatoria en las ventas de la caja (decisión del negocio, 2026-11-23)
--
-- Toda venta con turno (la que registra `registrar_venta` desde una caja abierta) lleva patente.
-- `registrar_venta` ya la normaliza (mayúsculas, sin espacios; vacía → NULL), así que el control
-- va en un trigger BEFORE INSERT de `ventas`: cubre cualquier camino de alta, sin reescribir la RPC.
-- Las ventas con fecha pasada (sin turno, carga histórica del admin) siguen con patente opcional.
-- Las ventas existentes sin patente no cambian (el control es solo al insertar).
-- =====================================================================

create function public.tg_ventas_patente_obligatoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.turno_id is not null and nullif(btrim(coalesce(new.patente, '')), '') is null then
    raise exception 'Ingresá la patente del vehículo' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_ventas_patente_obligatoria() from public, authenticated, anon;

create trigger ventas_patente_obligatoria
  before insert on public.ventas
  for each row execute function public.tg_ventas_patente_obligatoria();
