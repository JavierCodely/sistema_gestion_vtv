-- Costo vigente del certificado (decisión del negocio, 2026-11-24).
--
-- Al crear o editar un certificado el admin carga cuánto le cuesta **una unidad de compra** (la
-- libreta, la caja o la hoja suelta): `certificados.costo_unidad`. La BD divide por las hojas de la
-- unidad y eso pasa a ser el **costo por hoja de todo el stock** (`costo_promedio`). Ej.: libreta de
-- 25 hojas a $ 3.700 → $ 148 por hoja; con 300 hojas en stock, el stock vale $ 44.400. Las ventas y
-- los ajustes posteriores se valúan a ese costo.
--
-- * Lo hace el trigger `certificados_costo_unidad` (BEFORE INSERT/UPDATE): cuando cambia `costo_unidad`
--   o las hojas por unidad (con un costo cargado). Vaciar el costo no toca el costo por hoja.
-- * Las compras siguen recalculando el costo promedio ponderado como siempre y no tocan
--   `costo_unidad` (la pantalla de compra lo propone como costo por unidad).
-- * Cada cambio de costo con el certificado ya creado queda en el kardex como movimiento
--   `revaluacion` (0 hojas, costo por hoja nuevo, `costo_total` = cuánto cambió el valor del stock).
--   Así `corregir_compra_certificado` ve que la compra ya no es el último movimiento (no puede volver
--   al promedio anterior) y el kardex explica el salto del costo promedio.
-- * Costos solo admin (migración 17): `costo_unidad` se escribe por columna, no se lee de la tabla; el
--   admin lo lee con `stock_certificados_valorizado()` (al final).

alter type public.tipo_mov_certificado add value if not exists 'revaluacion';

alter table public.certificados
  add column costo_unidad numeric(12,2),
  add constraint certificados_costo_unidad_valido
    check (costo_unidad is null or (costo_unidad > 0 and costo_unidad <> 'NaN'::numeric));

comment on column public.certificados.costo_unidad is
  'Costo vigente de una unidad de compra (libreta, caja u hoja suelta). Al cambiar fija costo_promedio = costo_unidad / hojas_por_unidad.';

grant insert (costo_unidad), update (costo_unidad) on public.certificados to authenticated;

-- Una revaluación no mueve hojas: el CHECK de hojas ≠ 0 la exceptúa. Se compara como texto porque
-- el valor nuevo del enum no se puede usar en la misma transacción en que se agrega (sql:produccion).
alter table public.movimientos_certificado drop constraint movimientos_certificado_hojas_check;
alter table public.movimientos_certificado add constraint movimientos_certificado_hojas_check
  check (hojas <> 0 or tipo::text = 'revaluacion');

-- Costo por hoja desde el costo de la unidad -------------------------------------------------------------

create function public.tg_certificados_costo_unidad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.costo_unidad is not null
     and (tg_op = 'INSERT'
          or new.costo_unidad is distinct from old.costo_unidad
          or new.hojas_por_unidad <> old.hojas_por_unidad) then
    new.costo_promedio := round(new.costo_unidad / new.hojas_por_unidad, 4);
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_certificados_costo_unidad() from public, anon, authenticated;

create trigger certificados_costo_unidad
  before insert or update of costo_unidad, hojas_por_unidad on public.certificados
  for each row execute function public.tg_certificados_costo_unidad();

-- Kardex del cambio de costo (security definer: el admin no inserta en el kardex directo).
create function public.tg_certificados_revaluacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.movimientos_certificado
    (certificado_id, tipo, hojas, costo_unitario, costo_total, stock_resultante,
     costo_promedio_resultante, nota, usuario_id)
  values
    (new.id, 'revaluacion', 0, new.costo_promedio,
     round(new.stock_hojas * (new.costo_promedio - old.costo_promedio), 2), new.stock_hojas,
     new.costo_promedio,
     format('Costo por %s: $ %s (%s hojas)',
            case new.unidad_compra when 'caja' then 'caja' when 'libreta' then 'libreta' else 'hoja' end,
            translate(to_char(new.costo_unidad, 'FM999,999,999,990.00'), ',.', '.,'),
            new.hojas_por_unidad),
     auth.uid());
  return null;
end;
$$;

revoke execute on function public.tg_certificados_revaluacion() from public, anon, authenticated;

create trigger certificados_revaluacion
  after update of costo_unidad, hojas_por_unidad on public.certificados
  for each row
  when (new.costo_promedio is distinct from old.costo_promedio)
  execute function public.tg_certificados_revaluacion();

-- Stock valorizado con el costo de la unidad (al final) ---------------------------------------------------

drop function public.stock_certificados_valorizado();

create function public.stock_certificados_valorizado()
returns table (
  id               bigint,
  nombre           text,
  unidad_compra    public.unidad_compra,
  hojas_por_unidad integer,
  todos_servicios  boolean,
  categoria_ids    bigint[],
  servicio_ids     bigint[],
  aplica_a         text,
  stock_minimo     integer,
  stock_hojas      integer,
  costo_promedio   numeric(14,2),
  valor_stock      numeric(14,2),
  semaforo         text,
  activo           boolean,
  condicional      boolean,
  dias_vuelta      smallint,
  costo_unidad     numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();

  return query
  select
    v.id, v.nombre, v.unidad_compra, v.hojas_por_unidad, v.todos_servicios, v.categoria_ids,
    v.servicio_ids, v.aplica_a, v.stock_minimo, v.stock_hojas,
    round(c.costo_promedio, 2)::numeric(14,2),
    round(c.stock_hojas * c.costo_promedio, 2)::numeric(14,2),
    v.semaforo, v.activo, v.condicional, v.dias_vuelta, c.costo_unidad
  from public.v_stock_certificados v
  join public.certificados c on c.id = v.id
  order by v.activo desc, v.nombre;
end;
$$;

revoke all on function public.stock_certificados_valorizado() from public, anon;
grant execute on function public.stock_certificados_valorizado() to authenticated;
