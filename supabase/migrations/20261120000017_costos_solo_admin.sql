-- Costos de certificados: SOLO el administrador (decisión del negocio, 2026-11-20).
-- El cajero nunca ve costo por hoja, costo promedio, valor del stock, costo de una venta ni margen.
--
-- Los privilegios por columna son por ROL y admin y cajero son ambos `authenticated`, así que:
--   - lo que lee cualquier usuario (tablas y vistas) queda SIN columnas de costo;
--   - el admin lee los costos solo por RPC `security definer` que exigen admin.
-- Columnas nuevas en certificados/ventas no quedan legibles hasta que se las agregue al grant.

-- 1) Tablas: lectura por columna, sin costos.
revoke select on public.certificados, public.ventas from authenticated;

grant select (id, nombre, unidad_compra, hojas_por_unidad, alcance, categoria_id, servicio_id,
              stock_minimo, stock_hojas, activo, creado_en, actualizado_en)
  on public.certificados to authenticated;

grant select (id, turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id, precio,
              medio_pago, patente, certificado_id, sin_stock, anulada, anulada_motivo, anulada_por,
              anulada_en, creado_en)
  on public.ventas to authenticated;
-- movimientos_certificado, compras_certificado y movimientos_efectivo ya son solo admin (RLS).

-- 2) Stock para todos: sin costo ni valuación.
drop view public.v_stock_certificados;
create view public.v_stock_certificados
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.unidad_compra,
  c.hojas_por_unidad,
  c.alcance,
  c.categoria_id,
  c.servicio_id,
  case c.alcance
    when 'global'    then 'Todos los servicios'
    when 'categoria' then cs.nombre
    else s.nombre
  end                                                as aplica_a,
  c.stock_minimo,
  c.stock_hojas,
  case
    when c.stock_hojas = 0               then 'sin_stock'
    when c.stock_hojas <= c.stock_minimo then 'bajo'
    else 'ok'
  end                                                as semaforo,
  c.activo
from public.certificados c
left join public.categorias_servicio cs on cs.id = c.categoria_id
left join public.servicios s on s.id = c.servicio_id;

grant select on public.v_stock_certificados to authenticated;

-- 3) Stock valorizado: solo admin.
create function public.stock_certificados_valorizado()
returns table (
  id               bigint,
  nombre           text,
  unidad_compra    public.unidad_compra,
  hojas_por_unidad integer,
  alcance          public.alcance_certificado,
  categoria_id     bigint,
  servicio_id      bigint,
  aplica_a         text,
  stock_minimo     integer,
  stock_hojas      integer,
  costo_promedio   numeric(14,2),
  valor_stock      numeric(14,2),
  semaforo         text,
  activo           boolean
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
    v.id, v.nombre, v.unidad_compra, v.hojas_por_unidad, v.alcance, v.categoria_id,
    v.servicio_id, v.aplica_a, v.stock_minimo, v.stock_hojas,
    round(c.costo_promedio, 2)::numeric(14,2),
    round(c.stock_hojas * c.costo_promedio, 2)::numeric(14,2),
    v.semaforo, v.activo
  from public.v_stock_certificados v
  join public.certificados c on c.id = v.id
  order by v.activo desc, v.nombre;
end;
$$;

-- 4) Resumen diario con costo y margen: solo admin (reemplaza a la vista v_resumen_diario).
drop view public.v_resumen_diario;

create function public.resumen_diario(p_desde date default null, p_hasta date default null)
returns table (
  fecha               date,
  cantidad_ventas     bigint,
  total_ventas        numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  total_tarjeta       numeric(14,2),
  total_gastos        numeric(14,2),
  flujo_neto          numeric(14,2),
  costo_certificados  numeric(14,2),
  margen_bruto        numeric(14,2),
  ventas_sin_stock    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  with mov as (
    select public.fecha_local(v.creado_en) as dia, v.precio as venta, v.medio_pago,
           v.costo_certificado as costo, v.sin_stock, 0::numeric as gasto
    from public.ventas v where not v.anulada
    union all
    select public.fecha_local(g.creado_en), 0, null, 0, false, g.monto
    from public.gastos g where not g.anulado
  )
  select
    m.dia,
    count(*) filter (where m.medio_pago is not null),
    coalesce(sum(m.venta), 0)::numeric(14,2),
    coalesce(sum(m.venta) filter (where m.medio_pago = 'efectivo'), 0)::numeric(14,2),
    coalesce(sum(m.venta) filter (where m.medio_pago = 'transferencia'), 0)::numeric(14,2),
    coalesce(sum(m.venta) filter (where m.medio_pago = 'tarjeta'), 0)::numeric(14,2),
    coalesce(sum(m.gasto), 0)::numeric(14,2),
    (coalesce(sum(m.venta), 0) - coalesce(sum(m.gasto), 0))::numeric(14,2),
    round(coalesce(sum(m.costo), 0), 2)::numeric(14,2),
    round(coalesce(sum(m.venta), 0) - coalesce(sum(m.costo), 0), 2)::numeric(14,2),
    count(*) filter (where m.sin_stock)
  from mov m
  where (p_desde is null or m.dia >= p_desde)
    and (p_hasta is null or m.dia <= p_hasta)
  group by m.dia
  order by m.dia;
end;
$$;

-- PUBLIC ya no recibe EXECUTE por defecto (migración 016): solo `authenticated`.
grant execute on function public.stock_certificados_valorizado() to authenticated;
grant execute on function public.resumen_diario(date, date) to authenticated;
