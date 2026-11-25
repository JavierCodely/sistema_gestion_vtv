-- Condicional vencida: qué se hizo queda registrado en la venta (decisión del negocio, 2026-11-24).
--
-- Cuando una patente vuelve con una condicional **vencida** del servicio, la caja avisa que se pasó el
-- límite de días y el cajero elige continuar con el certificado (vuelta fuera de plazo, migración 46) o
-- cobrar de nuevo (el servicio completo u otra condicional). Lo elegido queda en la venta y se ve en
-- "Estado" del historial:
--
-- * `ventas.vuelta_fuera_de_plazo`: la vuelta se hizo después del vencimiento de su condicional.
-- * `ventas.condicional_vencida_de`: la venta (con turno, del mismo servicio y la misma patente) se
--   cobró de nuevo teniendo una condicional vencida y sin usar; esa condicional queda **resuelta**: deja
--   de aparecer en `condicionales_de_patente` y ya no admite la vuelta. Anular esta venta la libera.
--
-- Los llena el trigger `ventas_condicional_vencida` (BEFORE INSERT) con lo que ya decidió
-- `registrar_venta`: no cambia ninguna firma. Las ventas con fecha pasada no se marcan.

alter table public.ventas
  add column vuelta_fuera_de_plazo boolean not null default false,
  add column condicional_vencida_de bigint references public.ventas (id),
  add constraint ventas_vuelta_o_recobro check (vuelta_de is null or condicional_vencida_de is null);

create index ventas_condicional_vencida_de on public.ventas (condicional_vencida_de)
  where condicional_vencida_de is not null;

grant select (vuelta_fuera_de_plazo, condicional_vencida_de) on public.ventas to authenticated;

-- Las vueltas que ya se hicieron fuera de plazo (migración 46).
update public.ventas r
set vuelta_fuera_de_plazo = true
from public.ventas c
where r.vuelta_de = c.id
  and public.fecha_local(r.creado_en) > c.condicional_vence;

create function public._ventas_condicional_vencida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vence date;
begin
  if new.vuelta_de is not null then
    -- Una condicional que se cobró de nuevo ya está resuelta: no tiene vuelta.
    if exists (select 1 from public.ventas x
               where x.condicional_vencida_de = new.vuelta_de and not x.anulada) then
      raise exception 'La condicional de la patente % ya se cobró de nuevo en otra venta: revisá el historial',
        new.patente using errcode = 'P0001';
    end if;
    select c.condicional_vence into v_vence from public.ventas c where c.id = new.vuelta_de;
    new.vuelta_fuera_de_plazo := public.fecha_local(now()) > v_vence;
  elsif new.turno_id is not null and new.patente is not null then
    -- La condicional vencida y sin usar de esta patente y servicio (la más nueva), si la hay.
    new.condicional_vencida_de := (
      select v.id
      from public.ventas v
      where v.patente = new.patente
        and v.condicional_servicio_id = new.servicio_id
        and not v.anulada
        and v.condicional_vence < public.fecha_local(now())
        and not exists (select 1 from public.ventas r where r.vuelta_de = v.id and not r.anulada)
        and not exists (select 1 from public.ventas x
                        where x.condicional_vencida_de = v.id and not x.anulada)
      order by v.creado_en desc, v.id desc
      limit 1);
  end if;
  return new;
end;
$$;

revoke execute on function public._ventas_condicional_vencida() from public, anon, authenticated;

create trigger ventas_condicional_vencida
  before insert on public.ventas
  for each row execute function public._ventas_condicional_vencida();

-- Condicionales de una patente: sin las vencidas que ya se cobraron de nuevo ----------------------------

create or replace function public.condicionales_de_patente(p_patente text)
returns table (
  venta_id           bigint,
  fecha              date,
  condicional_nombre text,
  servicio_id        bigint,
  servicio_nombre    text,
  vence              date,
  vigente            boolean,
  pagado             numeric,
  saldo              numeric
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
  return query
    select v.id, public.fecha_local(v.creado_en), coalesce(c.nombre, 'Condicional'),
           s.id, s.nombre, v.condicional_vence, v.condicional_vence >= v_hoy,
           v.precio::numeric, v.condicional_saldo::numeric
    from public.ventas v
    join public.servicios s on s.id = v.condicional_servicio_id
    left join public.certificados c on c.id = v.certificado_id
    where v.patente = v_patente
      and not v.anulada
      and not exists (select 1 from public.ventas r where r.vuelta_de = v.id and not r.anulada)
      and not exists (select 1 from public.ventas x where x.condicional_vencida_de = v.id and not x.anulada)
    order by (v.condicional_vence >= v_hoy) desc,
             case when v.condicional_vence >= v_hoy then v.creado_en end asc,
             v.creado_en desc, v.id
    limit 20;
end;
$$;
