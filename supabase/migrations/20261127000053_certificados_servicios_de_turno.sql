-- =====================================================================
-- Migración 53: certificados y servicios de un turno (decisión del negocio, 2026-11-27)
--
-- `certificados_servicios_de_turno(p_turno_id)`: lo que muestra la ventana "Certificados y servicios"
-- del turno, en la caja y en las ventas de cada turno del admin.
--   * agrupacion = 'certificado': una fila por certificado entregado en el turno. `cantidad` = hojas
--     entregadas en ventas sin anular; `anuladas` = hojas que se fueron en ventas anuladas (la hoja no
--     vuelve al stock al anular). Una venta sin stock no entregó hoja y no cuenta.
--   * agrupacion = 'servicio': los servicios activos (de categorías activas) y los que se vendieron en
--     el turno aunque hoy estén desactivados, con su `precio` actual del catálogo y cuántas ventas sin
--     anular se cobraron **solo en efectivo** y **solo por transferencia** (decisión: las de tarjeta y
--     las mixtas no se cuentan en esta ventana). `efectivo_total` / `transferencia_total` = lo cobrado
--     (precio de cada venta, con descuento): **solo el admin**; para el cajero vienen NULL (el cajero no
--     ve totales en $, decisión 2026-11-20).
-- Acceso: igual que `resumen_ventas_de_turno` (migración 50): el cajero, de un turno abierto (mismas
-- validaciones que vender); el admin, de cualquier turno. Sin costos.
-- =====================================================================

create function public.certificados_servicios_de_turno(p_turno_id bigint)
returns table (
  agrupacion             text,
  id                     bigint,
  nombre                 text,
  categoria_nombre       text,
  condicional            boolean,
  precio                 numeric(12,2),
  cantidad               integer,
  anuladas               integer,
  efectivo_cantidad      integer,
  transferencia_cantidad integer,
  efectivo_total         numeric(14,2),
  transferencia_total    numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos;
  v_admin boolean;
begin
  perform public._exigir_usuario();
  v_admin := public.es_admin();
  if v_admin then
    if p_turno_id is null then
      raise exception 'Elegí el turno' using errcode = '22023';
    end if;
    select * into v_turno from public.turnos t where t.id = p_turno_id;
    if v_turno.id is null then
      raise exception 'El turno elegido no existe' using errcode = '22023';
    end if;
  else
    v_turno := public._turno_para_trabajar(p_turno_id, false);
  end if;

  return query
  with del_turno as (
    select v.id, v.servicio_id, v.certificado_id, v.sin_stock, v.anulada, v.medio_pago, v.precio
    from public.ventas v
    where v.turno_id = v_turno.id
  ),
  certificados as (
    select 'certificado'::text as agrupacion, c.id, c.nombre, null::text as categoria_nombre,
           c.condicional, null::numeric(12,2) as precio,
           (count(*) filter (where not d.anulada))::integer as cantidad,
           (count(*) filter (where d.anulada))::integer as anuladas,
           0 as efectivo_cantidad, 0 as transferencia_cantidad,
           null::numeric(14,2) as efectivo_total, null::numeric(14,2) as transferencia_total,
           1 as grupo, null::text as orden_categoria
    from del_turno d
    join public.certificados c on c.id = d.certificado_id
    where not d.sin_stock
    group by c.id, c.nombre, c.condicional
  ),
  servicios as (
    select 'servicio'::text, s.id, s.nombre, cs.nombre, false, s.precio,
           (count(d.id) filter (where not d.anulada))::integer,
           (count(d.id) filter (where d.anulada))::integer,
           (count(d.id) filter (where not d.anulada and d.medio_pago = 'efectivo'))::integer,
           (count(d.id) filter (where not d.anulada and d.medio_pago = 'transferencia'))::integer,
           case when v_admin then coalesce(sum(d.precio) filter (
             where not d.anulada and d.medio_pago = 'efectivo'), 0) end::numeric(14,2),
           case when v_admin then coalesce(sum(d.precio) filter (
             where not d.anulada and d.medio_pago = 'transferencia'), 0) end::numeric(14,2),
           2, cs.nombre
    from public.servicios s
    join public.categorias_servicio cs on cs.id = s.categoria_id
    left join del_turno d on d.servicio_id = s.id
    group by s.id, s.nombre, s.precio, s.activo, cs.nombre, cs.activa
    having (s.activo and cs.activa) or count(d.id) > 0
  )
  select x.agrupacion, x.id, x.nombre, x.categoria_nombre, x.condicional, x.precio, x.cantidad,
         x.anuladas, x.efectivo_cantidad, x.transferencia_cantidad, x.efectivo_total,
         x.transferencia_total
  from (select * from certificados union all select * from servicios) x
  order by x.grupo, x.orden_categoria nulls first, x.nombre, x.id;
end;
$$;

revoke execute on function public.certificados_servicios_de_turno(bigint) from public, anon;
grant execute on function public.certificados_servicios_de_turno(bigint) to authenticated;
