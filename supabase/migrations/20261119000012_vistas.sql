-- Vistas para pantallas y reportes. Todas con security_invoker: respetan la RLS
-- del usuario que consulta (el cajero ve lo suyo, el admin ve todo).

-- Ventas y gastos juntos. Los gastos con monto NEGATIVO (fila roja en la UI).
-- Las filas anuladas se incluyen (anulada = true) para mostrarlas tachadas;
-- los totales deben excluirlas.
create view public.v_movimientos_caja
with (security_invoker = true) as
select
  'venta'::text                  as tipo,
  v.id                           as id,
  v.creado_en                    as fecha,
  public.fecha_local(v.creado_en) as fecha_local,
  v.turno_id,
  v.caja_id,
  c.nombre                       as caja_nombre,
  v.usuario_id,
  p.nombre                       as usuario_nombre,
  v.servicio_nombre              as concepto,
  cs.nombre                      as detalle,
  v.medio_pago::text             as medio,
  v.precio                       as monto,
  v.patente,
  v.sin_stock,
  v.anulada,
  v.anulada_motivo               as motivo_anulacion,
  null::text                     as nota,
  v.servicio_id,
  null::bigint                   as categoria_gasto_id
from public.ventas v
join public.cajas c on c.id = v.caja_id
left join public.perfiles p on p.id = v.usuario_id
left join public.categorias_servicio cs on cs.id = v.categoria_id
union all
select
  'gasto'::text,
  g.id,
  g.creado_en,
  public.fecha_local(g.creado_en),
  g.turno_id,
  g.caja_id,
  c.nombre,
  g.usuario_id,
  p.nombre,
  sub.nombre,
  rubro.nombre,
  g.fuente::text,
  -g.monto,
  null,
  false,
  g.anulado,
  g.anulado_motivo,
  g.nota,
  null,
  g.categoria_id
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

-- Turnos con totales calculados en vivo (excluyen anulados).
create view public.v_turnos
with (security_invoker = true) as
select
  t.*,
  c.nombre  as caja_nombre,
  p.nombre  as usuario_nombre,
  t.cerrado_en is null as abierto,
  coalesce(v.cantidad, 0)                     as ventas_cantidad,
  coalesce(v.efectivo, 0)::numeric(14,2)      as ventas_efectivo,
  coalesce(v.transferencia, 0)::numeric(14,2) as ventas_transferencia,
  coalesce(v.tarjeta, 0)::numeric(14,2)       as ventas_tarjeta,
  coalesce(v.total, 0)::numeric(14,2)         as ventas_total,
  coalesce(g.total, 0)::numeric(14,2)         as gastos_total,
  (coalesce(v.total, 0) - coalesce(g.total, 0))::numeric(14,2) as neto
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles p on p.id = t.usuario_id
left join lateral (
  select
    count(*)                                                          as cantidad,
    sum(precio)                                                       as total,
    sum(precio) filter (where medio_pago = 'efectivo')                as efectivo,
    sum(precio) filter (where medio_pago = 'transferencia')           as transferencia,
    sum(precio) filter (where medio_pago = 'tarjeta')                 as tarjeta
  from public.ventas where turno_id = t.id and not anulada
) v on true
left join lateral (
  select sum(monto) as total from public.gastos where turno_id = t.id and not anulado
) g on true;

-- Resumen por día (hora argentina), sin anulados.
create view public.v_resumen_diario
with (security_invoker = true) as
with mov as (
  select public.fecha_local(creado_en) as fecha, precio as venta, medio_pago,
         costo_certificado as costo, sin_stock, 0::numeric as gasto
  from public.ventas where not anulada
  union all
  select public.fecha_local(creado_en), 0, null, 0, false, monto
  from public.gastos where not anulado
)
select
  fecha,
  count(*) filter (where medio_pago is not null)                         as cantidad_ventas,
  coalesce(sum(venta), 0)::numeric(14,2)                                 as total_ventas,
  coalesce(sum(venta) filter (where medio_pago = 'efectivo'), 0)::numeric(14,2)      as total_efectivo,
  coalesce(sum(venta) filter (where medio_pago = 'transferencia'), 0)::numeric(14,2) as total_transferencia,
  coalesce(sum(venta) filter (where medio_pago = 'tarjeta'), 0)::numeric(14,2)       as total_tarjeta,
  coalesce(sum(gasto), 0)::numeric(14,2)                                 as total_gastos,
  (coalesce(sum(venta), 0) - coalesce(sum(gasto), 0))::numeric(14,2)    as flujo_neto,
  round(coalesce(sum(costo), 0), 2)::numeric(14,2)                       as costo_certificados,
  round(coalesce(sum(venta), 0) - coalesce(sum(costo), 0), 2)::numeric(14,2) as margen_bruto,
  count(*) filter (where sin_stock)                                      as ventas_sin_stock
from mov
group by fecha;

-- Stock de certificados con valuación y semáforo.
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
  end                                               as aplica_a,
  c.stock_minimo,
  c.stock_hojas,
  round(c.costo_promedio, 2)::numeric(14,2)         as costo_promedio,
  round(c.stock_hojas * c.costo_promedio, 2)::numeric(14,2) as valor_stock,
  case
    when c.stock_hojas = 0              then 'sin_stock'
    when c.stock_hojas <= c.stock_minimo then 'bajo'
    else 'ok'
  end                                               as semaforo,
  c.activo
from public.certificados c
left join public.categorias_servicio cs on cs.id = c.categoria_id
left join public.servicios s on s.id = c.servicio_id;

-- Gastos agregados por día, rubro, subcategoría y fuente (sin anulados).
create view public.v_gastos_por_categoria
with (security_invoker = true) as
select
  public.fecha_local(g.creado_en) as fecha,
  rubro.id     as rubro_id,
  rubro.nombre as rubro,
  sub.id       as categoria_id,
  sub.nombre   as categoria,
  g.fuente,
  count(*)     as cantidad,
  sum(g.monto)::numeric(14,2) as total
from public.gastos g
join public.categorias_gasto sub on sub.id = g.categoria_id
join public.categorias_gasto rubro on rubro.id = sub.padre_id
where not g.anulado
group by 1, 2, 3, 4, 5, 6;
