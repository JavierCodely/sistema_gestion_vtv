-- =====================================================================
-- Migración 52: arreglos de la auditoría contable (2026-11-27)
--
-- 1. Impuesto de monto fijo en una condicional al 50% + su vuelta: cada venta redondeaba su parte por
--    separado y, con un valor de centavos impares, las dos sumaban 1 centavo de más (150,01 → 75,01 +
--    75,01). Ahora la vuelta lleva lo que falta para el total del par: round(valor × (base de la
--    condicional + base de la vuelta) / total del servicio, 2) − lo ya registrado en la condicional,
--    siempre que la condicional tenga ese impuesto con el mismo valor (si el impuesto cambió en el
--    medio, cada venta usa su valor, como hasta ahora). Con la venta entera alcanzada, el par suma
--    exactamente el valor.
-- 2. `resumen_diario.costo_certificados` sumaba el costo de cada venta con 4 decimales y redondeaba al
--    final, mientras que el kardex (`movimientos_certificado`) registra cada venta redondeada a 2
--    decimales: podían diferir en centavos. Ahora el reporte suma el costo de cada venta redondeado a 2
--    decimales (el mismo criterio que el kardex); también el margen bruto.
-- 3. La patente se normalizaba distinto en la BD (mayúsculas y sin espacios) que en la UI (solo letras
--    y números): "AB-123-CD" y "AB123CD" quedaban como dos vehículos (vuelta de condicional, aviso de
--    patente repetida, estadísticas). `_normalizar_patente` ahora deja solo A-Z y 0-9, y el trigger
--    `ventas_a_normalizar_patente` la aplica a toda venta (también las de fecha pasada, que tenían su
--    propia normalización). Se llama "a_" para correr antes que los demás BEFORE INSERT de `ventas`
--    (Postgres los ejecuta por orden alfabético). Las ventas existentes se normalizan.
-- =====================================================================

-- 3. Patente ------------------------------------------------------------------------------------------
create or replace function public._normalizar_patente(p_patente text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(upper(coalesce(p_patente, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

create function public._ventas_normalizar_patente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.patente := public._normalizar_patente(new.patente);
  return new;
end;
$$;

revoke all on function public._ventas_normalizar_patente() from public, authenticated, anon;

create trigger ventas_a_normalizar_patente
  before insert or update of patente on public.ventas
  for each row execute function public._ventas_normalizar_patente();

update public.ventas
set patente = public._normalizar_patente(patente)
where patente is distinct from public._normalizar_patente(patente);

-- 1. Impuesto fijo de la vuelta ------------------------------------------------------------------------
create or replace function public._calcular_impuestos_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta    public.ventas;
  v_origen   public.ventas;
  v_fraccion numeric := 1;
  -- Total del servicio de la condicional (lo cobrado + el saldo); 0 si no es una vuelta.
  v_total_condicional numeric := 0;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    return;
  end if;

  if v_venta.condicional_saldo > 0 then
    v_fraccion := v_venta.precio / (v_venta.precio + v_venta.condicional_saldo);
  elsif v_venta.vuelta_de is not null then
    select * into v_origen from public.ventas where id = v_venta.vuelta_de;
    v_total_condicional := v_origen.precio + v_origen.condicional_saldo;
    v_fraccion := case when v_total_condicional > 0
                       then v_venta.precio / v_total_condicional
                       else 0 end;
  end if;

  delete from public.venta_impuestos where venta_id = p_venta_id;

  insert into public.venta_impuestos
    (venta_id, impuesto_id, impuesto_nombre, tipo, valor, medio, base, monto)
  with alcanzados as (
    select i.id, i.nombre, i.tipo, i.valor, i.medios
    from public.impuestos i
    where i.activo
      and (i.todos_servicios
           or exists (select 1 from public.impuesto_servicios s
                      where s.impuesto_id = i.id and s.servicio_id = v_venta.servicio_id))
  ),
  -- Lo que ya registró la condicional de cada impuesto (solo en una vuelta).
  de_la_condicional as (
    select vi.impuesto_id, vi.valor, sum(vi.base) as base, sum(vi.monto) as monto
    from public.venta_impuestos vi
    where v_origen.id is not null and vi.venta_id = v_origen.id
    group by vi.impuesto_id, vi.valor
  ),
  partes as (
    select a.id, a.nombre, a.tipo, a.valor, p.medio, p.monto as base,
           sum(p.monto) over (partition by a.id) as base_alcanzada,
           row_number() over (partition by a.id order by p.monto desc, p.medio) as orden
    from alcanzados a
    join public.venta_pagos p on p.venta_id = p_venta_id and p.medio = any (a.medios)
  ),
  con_total as (
    select pt.*,
           (case
              when pt.tipo = 'porcentaje' then round(pt.base_alcanzada * pt.valor / 100, 2)
              -- Vuelta de una condicional que ya registró este impuesto con el mismo valor: lo que
              -- falta para el total del par (el redondeo se hace una sola vez).
              when dc.impuesto_id is not null and v_total_condicional > 0 then
                greatest(round(pt.valor * (dc.base + pt.base_alcanzada) / v_total_condicional, 2)
                         - dc.monto, 0)
              else round(pt.valor * v_fraccion
                         * case when v_venta.precio = 0 then 1
                                else pt.base_alcanzada / v_venta.precio end, 2)
            end) as total
    from partes pt
    left join de_la_condicional dc
      on pt.tipo = 'monto_fijo' and dc.impuesto_id = pt.id and dc.valor = pt.valor
  ),
  repartido as (
    select ct.*,
           (case when ct.base_alcanzada = 0 then (case when ct.orden = 1 then ct.total else 0 end)
                 else round(ct.total * ct.base / ct.base_alcanzada, 2) end) as parte
    from con_total ct
  ),
  final as (
    select r.id, r.nombre, r.tipo, r.valor, r.medio, r.base,
           (case when r.orden = 1
                 then r.total - (sum(r.parte) over (partition by r.id) - r.parte)
                 else r.parte end) as monto
    from repartido r
    where r.total > 0
  )
  select p_venta_id, f.id, f.nombre, f.tipo, f.valor, f.medio, f.base, f.monto
  from final f
  where f.monto > 0;
end;
$$;

revoke execute on function public._calcular_impuestos_venta(bigint) from public, anon, authenticated;

-- 2. Costo de certificados del resumen diario ------------------------------------------------------------
create or replace function public.resumen_diario(p_desde date default null, p_hasta date default null)
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
  with vd as (
    select public.fecha_local(v.creado_en) as dia,
           count(*) as cantidad,
           sum(v.precio) as monto,
           -- Cada venta redondeada a 2 decimales, como la registra el kardex.
           sum(round(v.costo_certificado, 2)) as costo,
           count(*) filter (where v.sin_stock) as sin_stock
    from public.ventas v
    where not v.anulada
    group by 1
  ),
  pd as (
    select public.fecha_local(v.creado_en) as dia,
           sum(p.monto) filter (where p.medio = 'efectivo') as efectivo,
           sum(p.monto) filter (where p.medio = 'transferencia') as transferencia,
           sum(p.monto) filter (where p.medio = 'tarjeta') as tarjeta
    from public.ventas v
    join public.venta_pagos p on p.venta_id = v.id
    where not v.anulada
    group by 1
  ),
  gd as (
    select public.fecha_local(g.creado_en) as dia, sum(g.monto) as monto
    from public.gastos g
    where not g.anulado
    group by 1
  ),
  dias as (
    select vd.dia from vd union select gd.dia from gd
  )
  select
    d.dia,
    coalesce(vd.cantidad, 0)::bigint,
    coalesce(vd.monto, 0)::numeric(14,2),
    coalesce(pd.efectivo, 0)::numeric(14,2),
    coalesce(pd.transferencia, 0)::numeric(14,2),
    coalesce(pd.tarjeta, 0)::numeric(14,2),
    coalesce(gd.monto, 0)::numeric(14,2),
    (coalesce(vd.monto, 0) - coalesce(gd.monto, 0))::numeric(14,2),
    coalesce(vd.costo, 0)::numeric(14,2),
    (coalesce(vd.monto, 0) - coalesce(vd.costo, 0))::numeric(14,2),
    coalesce(vd.sin_stock, 0)::bigint
  from dias d
  left join vd on vd.dia = d.dia
  left join pd on pd.dia = d.dia
  left join gd on gd.dia = d.dia
  where (p_desde is null or d.dia >= p_desde)
    and (p_hasta is null or d.dia <= p_hasta)
  order by d.dia;
end;
$$;
