-- =====================================================================
-- Migración 37: Dashboard del admin (decisiones del negocio, 2026-11-23)
--
-- Solo lectura y solo admin. La BD arma todos los números; el frontend los dibuja.
-- * `ventas_por_dia(desde, hasta)`: cantidad y total vendido por día de negocio (hora AR), un
--   día por fila, desde `desde` hasta `hasta` **o hasta hoy** (los días que todavía no pasaron no
--   vienen: el gráfico de "esta semana" un lunes trae solo el lunes). Máximo 366 días.
-- * `resumen_dashboard(desde, hasta, turno)`: ventas del período o del turno, agrupadas en
--   `total` (siempre 1 fila), `servicio`, `categoria` (nombres actuales del catálogo) y `descuento`
--   (cuántas ventas lo usaron, lo cobrado y lo descontado).
-- * `resumen_gastos(desde, hasta, turno)`: gastos del período o del turno en `total` (1 fila),
--   `compra_certificados` y `otros_gastos` (1 fila cada uno, en 0 si no hay), `rubro` y
--   `subcategoria` ("Rubro › Subcategoría"). Las compras de certificados se cuentan por su gasto
--   automático (categoría del sistema `compra_certificados`): nunca dos veces. Nunca tienen turno.
-- En todas: sin anuladas, día de negocio = `fecha_local(creado_en)` (las ventas con fecha pasada
-- cuentan en su fecha) y, con turno, solo lo de ese turno.
-- =====================================================================

create function public._validar_rango_reporte(p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public._validar_rango_reporte(date, date) from public, authenticated, anon;

-- Ventas por día ------------------------------------------------------------------------------------
create function public.ventas_por_dia(p_desde date, p_hasta date)
returns table (fecha date, cantidad bigint, total numeric(14,2))
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hasta date;
begin
  perform public._exigir_admin();
  if p_desde is null or p_hasta is null then
    raise exception 'Indicá las fechas desde y hasta' using errcode = '22023';
  end if;
  perform public._validar_rango_reporte(p_desde, p_hasta);
  if p_hasta - p_desde > 366 then
    raise exception 'El rango no puede superar un año' using errcode = '22023';
  end if;
  -- Los días que todavía no llegaron no se devuelven.
  v_hasta := least(p_hasta, public.fecha_local(now()));

  return query
  with por_dia as (
    select public.fecha_local(v.creado_en) as dia, count(*) as cant, sum(v.precio) as monto
    from public.ventas v
    where not v.anulada
      and public.fecha_local(v.creado_en) between p_desde and v_hasta
    group by 1
  )
  select d::date, coalesce(p.cant, 0), coalesce(p.monto, 0)::numeric(14,2)
  from generate_series(p_desde, v_hasta, interval '1 day') as d
  left join por_dia p on p.dia = d::date
  order by d;
end;
$$;

grant execute on function public.ventas_por_dia(date, date) to authenticated;

-- Ventas: servicios, categorías y descuentos ----------------------------------------------------------
create function public.resumen_dashboard(
  p_desde    date   default null,
  p_hasta    date   default null,
  p_turno_id bigint default null
)
returns table (
  agrupacion       text,
  id               bigint,
  nombre           text,
  cantidad         bigint,
  total            numeric(14,2),
  total_descontado numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  perform public._validar_rango_reporte(p_desde, p_hasta);

  return query
  with del_periodo as (
    select v.servicio_id, v.servicio_nombre, v.categoria_id, v.descuento_id, v.descuento_nombre,
           v.precio, v.monto_descuento
    from public.ventas v
    where not v.anulada
      and (p_turno_id is null or v.turno_id = p_turno_id)
      and (p_desde is null or public.fecha_local(v.creado_en) >= p_desde)
      and (p_hasta is null or public.fecha_local(v.creado_en) <= p_hasta)
  ),
  filas as (
    select 'total'::text as grupo, 0 as orden, null::bigint as clave, 'Total'::text as etiqueta,
           count(*) as cant, coalesce(sum(p.precio), 0) as monto,
           coalesce(sum(p.monto_descuento), 0) as descontado
    from del_periodo p
    union all
    select 'servicio', 1, p.servicio_id, coalesce(max(s.nombre), max(p.servicio_nombre)),
           count(*), sum(p.precio), sum(p.monto_descuento)
    from del_periodo p
    left join public.servicios s on s.id = p.servicio_id
    group by p.servicio_id
    union all
    select 'categoria', 2, p.categoria_id, coalesce(max(c.nombre), 'Sin categoría'),
           count(*), sum(p.precio), sum(p.monto_descuento)
    from del_periodo p
    left join public.categorias_servicio c on c.id = p.categoria_id
    group by p.categoria_id
    union all
    select 'descuento', 3, p.descuento_id, coalesce(max(d.nombre), max(p.descuento_nombre)),
           count(*), sum(p.precio), sum(p.monto_descuento)
    from del_periodo p
    left join public.descuentos d on d.id = p.descuento_id
    where p.descuento_id is not null
    group by p.descuento_id
  )
  select f.grupo, f.clave, f.etiqueta, f.cant, f.monto::numeric(14,2), f.descontado::numeric(14,2)
  from filas f
  order by f.orden, f.cant desc, f.monto desc, f.etiqueta;
end;
$$;

grant execute on function public.resumen_dashboard(date, date, bigint) to authenticated;

-- Gastos -------------------------------------------------------------------------------------------
create function public.resumen_gastos(
  p_desde    date   default null,
  p_hasta    date   default null,
  p_turno_id bigint default null
)
returns table (
  agrupacion text,
  id         bigint,
  nombre     text,
  cantidad   bigint,
  total      numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  perform public._validar_rango_reporte(p_desde, p_hasta);

  return query
  with del_periodo as (
    select g.monto, sub.id as sub_id, sub.nombre as sub_nombre, rub.id as rubro_id,
           rub.nombre as rubro_nombre, (sub.sistema = 'compra_certificados') is true as es_compra
    from public.gastos g
    join public.categorias_gasto sub on sub.id = g.categoria_id
    join public.categorias_gasto rub on rub.id = sub.padre_id
    where not g.anulado
      and (p_turno_id is null or g.turno_id = p_turno_id)
      and (p_desde is null or public.fecha_local(g.creado_en) >= p_desde)
      and (p_hasta is null or public.fecha_local(g.creado_en) <= p_hasta)
  ),
  filas as (
    select 'total'::text as grupo, 0 as orden, null::bigint as clave, 'Total'::text as etiqueta,
           count(*) as cant, coalesce(sum(p.monto), 0) as monto
    from del_periodo p
    union all
    select 'compra_certificados', 1, null, 'Compra de certificados',
           count(*), coalesce(sum(p.monto), 0)
    from del_periodo p
    where p.es_compra
    union all
    select 'otros_gastos', 2, null, 'Otros gastos', count(*), coalesce(sum(p.monto), 0)
    from del_periodo p
    where not p.es_compra
    union all
    select 'rubro', 3, p.rubro_id, max(p.rubro_nombre), count(*), sum(p.monto)
    from del_periodo p
    group by p.rubro_id
    union all
    select 'subcategoria', 4, p.sub_id, max(p.rubro_nombre) || ' › ' || max(p.sub_nombre),
           count(*), sum(p.monto)
    from del_periodo p
    group by p.sub_id
  )
  select f.grupo, f.clave, f.etiqueta, f.cant, f.monto::numeric(14,2)
  from filas f
  order by f.orden, f.monto desc, f.cant desc, f.etiqueta;
end;
$$;

grant execute on function public.resumen_gastos(date, date, bigint) to authenticated;
