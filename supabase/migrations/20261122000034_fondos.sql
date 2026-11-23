-- Fondos (decisiones del negocio, 2026-11-22): la sección "Caja de efectivo" del admin pasa a ser
-- "Fondos", con pestañas Efectivo · Transferencia · Crédito/Débito · Mixto. Solo admin.
--
-- * Cuentas (`cuenta_fondos`): 'efectivo' (la caja de cambio de siempre, sin cambios de
--   comportamiento), 'transferencia' y 'tarjeta' (la pestaña "Crédito/Débito": el sistema tiene un
--   solo medio 'tarjeta', no se separa). "Mixto" NO es una cuenta: es informativa (ver más abajo).
--   El enum incluye 'efectivo' para que el libro unificado y el resumen tengan una sola columna
--   `cuenta`; `movimiento_fondos('efectivo', ...)` deriva en `movimiento_efectivo` (la misma regla y
--   el mismo libro de siempre). `create type` (no `alter type add value`): se puede usar en la misma
--   transacción de `npm run sql:produccion`.
--
-- * El libro de transferencia y tarjeta se CALCULA (vista `v_movimientos_fondos`), no se copia con
--   triggers: nunca se desincroniza con ventas, pagos, gastos ni compras. Sus filas:
--     - venta           (+) cada fila de `venta_pagos` del medio, con monto > 0 (incluye la parte de
--                           un pago mixto y las ventas pasadas), fecha = `ventas.creado_en`.
--     - venta_anulada   (−) el reverso de esa fila si la venta se anuló, fecha = `ventas.anulada_en`.
--     - gasto / compra  (−) `gastos` con `fuente = 'transferencia'`, fecha = `gastos.creado_en`.
--     - gasto_anulado / compra_anulada (+) su reverso, fecha = `gastos.anulado_en`.
--     - manual          (±) `movimientos_fondos` (fondo inicial, ingreso, retiro).
--   Compras de certificados: se cuentan por su GASTO automático (`compras_certificado.gasto_id`),
--   nunca por la fila de la compra, así no hay doble conteo. Corregir una compra anula su gasto
--   (reverso `compra_anulada` en la fecha de la corrección) y la corregida trae su gasto nuevo.
--   La tarjeta no tiene egresos automáticos (`fuente_fondos` es efectivo o transferencia).
--   Los egresos automáticos nunca se rechazan (comportamiento de siempre): el saldo de transferencia
--   puede quedar negativo y se muestra así. Un retiro MANUAL no puede dejarlo negativo.
--
-- * Efectivo en el libro unificado: una fila por cada `movimientos_efectivo` (mismos montos y
--   fechas): el saldo es el de `caja_efectivo`. Las ventas en efectivo de un turno abierto están en
--   el cajón, no en la caja de cambio: llegan con el `cierre_turno`.
--
-- * Mixto: `v_ventas_mixtas` (detalle) y `resumen_ventas_mixtas()` (totales). Cada parte de una venta
--   mixta YA está en su cuenta (transferencia y tarjeta como fila `venta`; efectivo vía cajón →
--   cierre de turno), así que estas cifras nunca se suman a las cuentas.
--
-- * Paginación del libro: clave estable (fecha desc, clave desc). `clave` es única en toda la vista:
--   '<origen>:<id 19 dígitos>' (+ ':<medio>' en ventas).

-- Tipos ---------------------------------------------------------------------------------------------

create type public.cuenta_fondos as enum ('efectivo', 'transferencia', 'tarjeta');
create type public.tipo_mov_fondos as enum ('fondo_inicial', 'ingreso', 'retiro');

-- Cuentas (una fila por cuenta): se bloquea con `for update` para serializar los retiros manuales. --

create table public.cuentas_fondos (
  cuenta public.cuenta_fondos primary key
);

comment on table public.cuentas_fondos is
  'Una fila por cuenta de Fondos. Se bloquea (for update) para que dos retiros simultáneos no dejen el saldo negativo.';

insert into public.cuentas_fondos (cuenta) values ('efectivo'), ('transferencia'), ('tarjeta');

alter table public.cuentas_fondos enable row level security;
create policy "admin lee cuentas de fondos" on public.cuentas_fondos
  for select to authenticated using ((select public.es_admin()));
grant select on public.cuentas_fondos to authenticated;

-- Movimientos manuales de transferencia y tarjeta (el efectivo sigue en movimientos_efectivo). ------

create table public.movimientos_fondos (
  id         bigint generated always as identity primary key,
  cuenta     public.cuenta_fondos not null
    constraint movimientos_fondos_cuenta_no_efectivo check (cuenta <> 'efectivo'),
  tipo       public.tipo_mov_fondos not null,
  -- Con signo: + entra, − sale (solo el retiro resta).
  monto      numeric(12,2) not null
    constraint movimientos_fondos_monto_valido check (monto <> 'NaN'::numeric and monto <> 0),
  nota       text not null
    constraint movimientos_fondos_nota_largo check (char_length(btrim(nota)) between 1 and 500),
  usuario_id uuid not null references public.perfiles (id),
  creado_en  timestamptz not null default now(),
  constraint movimientos_fondos_signo check ((tipo = 'retiro') = (monto < 0))
);

create index movimientos_fondos_cuenta on public.movimientos_fondos (cuenta, creado_en desc);

alter table public.movimientos_fondos enable row level security;
create policy "admin lee movimientos de fondos" on public.movimientos_fondos
  for select to authenticated using ((select public.es_admin()));
grant select on public.movimientos_fondos to authenticated;

-- Índices para armar el libro. ----------------------------------------------------------------------

create index venta_pagos_medio on public.venta_pagos (medio, venta_id);
create index gastos_transferencia on public.gastos (creado_en desc) where fuente = 'transferencia';
create index ventas_mixtas on public.ventas (id desc) where medio_pago is null;

-- Libro unificado -----------------------------------------------------------------------------------
-- security_invoker: cada tabla base aplica su RLS. Además se filtra por es_admin(): la RLS de
-- ventas, venta_pagos y gastos deja al cajero leer lo de los turnos abiertos, y Fondos es solo admin.
-- De `ventas` usa solo columnas con grant (nunca costos).

create view public.v_movimientos_fondos
with (security_invoker = true) as
with libro as (
  -- Ventas por transferencia o tarjeta (también la parte de un pago mixto y las ventas pasadas).
  select
    p.medio::text::public.cuenta_fondos               as cuenta,
    format('venta:%s:%s', lpad(v.id::text, 19, '0'), p.medio) as clave,
    v.creado_en                                        as fecha,
    'venta'::text                                      as origen,
    'venta'::text                                      as tipo,
    'ingreso'::text                                    as sentido,
    v.servicio_nombre || coalesce(' — ' || v.patente, '') as descripcion,
    null::text                                         as nota,
    p.monto                                            as monto,
    v.usuario_id                                       as usuario_id,
    v.id                                               as venta_id,
    null::bigint                                       as gasto_id,
    null::bigint                                       as compra_id,
    null::bigint                                       as movimiento_id,
    v.turno_id                                         as turno_id,
    v.caja_id                                          as caja_id,
    (v.medio_pago is null)                             as pago_mixto,
    (v.turno_id is null)                               as venta_pasada
  from public.venta_pagos p
  join public.ventas v on v.id = p.venta_id
  where p.medio in ('transferencia', 'tarjeta') and p.monto > 0

  union all
  -- Reverso de una venta anulada, en la fecha de la anulación.
  select
    p.medio::text::public.cuenta_fondos,
    format('venta_anulada:%s:%s', lpad(v.id::text, 19, '0'), p.medio),
    v.anulada_en,
    'venta_anulada', 'venta_anulada', 'ingreso',
    'Anulación de venta #' || v.id || ': ' || v.servicio_nombre || coalesce(' — ' || v.patente, ''),
    v.anulada_motivo,
    -p.monto,
    v.anulada_por,
    v.id, null, null, null,
    v.turno_id, v.caja_id,
    (v.medio_pago is null), (v.turno_id is null)
  from public.venta_pagos p
  join public.ventas v on v.id = p.venta_id
  where p.medio in ('transferencia', 'tarjeta') and p.monto > 0 and v.anulada

  union all
  -- Gastos por transferencia (las compras de certificados, por su gasto automático).
  select
    'transferencia'::public.cuenta_fondos,
    format('gasto:%s', lpad(g.id::text, 19, '0')),
    g.creado_en,
    case when c.id is null then 'gasto' else 'compra' end,
    case when c.id is null then 'gasto' else 'compra' end,
    'egreso',
    case when c.id is null then coalesce(rubro.nombre || ' › ', '') || sub.nombre
         else 'Compra de certificados: ' || cert.nombre end,
    g.nota,
    -g.monto,
    g.usuario_id,
    null, g.id, c.id, null,
    g.turno_id, g.caja_id,
    false, false
  from public.gastos g
  join public.categorias_gasto sub on sub.id = g.categoria_id
  left join public.categorias_gasto rubro on rubro.id = sub.padre_id
  left join public.compras_certificado c on c.gasto_id = g.id
  left join public.certificados cert on cert.id = c.certificado_id
  where g.fuente = 'transferencia'

  union all
  -- Reverso de un gasto anulado (o de la compra corregida), en la fecha de la anulación.
  select
    'transferencia'::public.cuenta_fondos,
    format('gasto_anulado:%s', lpad(g.id::text, 19, '0')),
    g.anulado_en,
    case when c.id is null then 'gasto_anulado' else 'compra_anulada' end,
    case when c.id is null then 'gasto_anulado' else 'compra_anulada' end,
    'egreso',
    case when c.id is null then 'Anulación de gasto: ' || coalesce(rubro.nombre || ' › ', '') || sub.nombre
         else 'Corrección de compra de certificados: ' || cert.nombre end,
    g.anulado_motivo,
    g.monto,
    g.anulado_por,
    null, g.id, c.id, null,
    g.turno_id, g.caja_id,
    false, false
  from public.gastos g
  join public.categorias_gasto sub on sub.id = g.categoria_id
  left join public.categorias_gasto rubro on rubro.id = sub.padre_id
  left join public.compras_certificado c on c.gasto_id = g.id
  left join public.certificados cert on cert.id = c.certificado_id
  where g.fuente = 'transferencia' and g.anulado

  union all
  -- Movimientos manuales de transferencia y tarjeta.
  select
    m.cuenta,
    format('manual:%s', lpad(m.id::text, 19, '0')),
    m.creado_en,
    'manual', m.tipo::text,
    case when m.tipo = 'retiro' then 'egreso' else 'ingreso' end,
    case m.tipo when 'fondo_inicial' then 'Saldo inicial' when 'ingreso' then 'Ingreso' else 'Retiro' end,
    m.nota,
    m.monto,
    m.usuario_id,
    null, null, null, m.id,
    null, null,
    false, false
  from public.movimientos_fondos m

  union all
  -- Efectivo: el libro de la caja de cambio, tal cual.
  select
    'efectivo'::public.cuenta_fondos,
    format('efectivo:%s', lpad(e.id::text, 19, '0')),
    e.creado_en,
    case e.tipo
      when 'fondo_inicial' then 'manual'
      when 'ingreso' then 'manual'
      when 'retiro' then 'manual'
      when 'venta' then 'venta'
      when 'anulacion_venta' then 'venta_anulada'
      when 'gasto' then case when c.id is null then 'gasto' else 'compra' end
      when 'anulacion_gasto' then case when c.id is null then 'gasto_anulado' else 'compra_anulada' end
      else e.tipo::text
    end,
    e.tipo::text,
    case when e.tipo in ('fondo_inicial', 'ingreso', 'venta', 'anulacion_venta', 'cierre_turno')
         then 'ingreso' else 'egreso' end,
    case
      when e.tipo = 'fondo_inicial' then 'Fondo inicial'
      when e.tipo = 'ingreso' then 'Ingreso'
      when e.tipo = 'retiro' then 'Retiro'
      when e.tipo = 'venta' then v.servicio_nombre || coalesce(' — ' || v.patente, '')
      when e.tipo = 'anulacion_venta' then
        'Anulación de venta #' || v.id || ': ' || v.servicio_nombre || coalesce(' — ' || v.patente, '')
      when e.tipo = 'gasto' then
        case when c.id is null then coalesce(rubro.nombre || ' › ', '') || sub.nombre
             else 'Compra de certificados: ' || cert.nombre end
      when e.tipo = 'anulacion_gasto' then
        case when c.id is null then 'Anulación de gasto: ' || coalesce(rubro.nombre || ' › ', '') || sub.nombre
             else 'Corrección de compra de certificados: ' || cert.nombre end
      when e.tipo = 'apertura_turno' then 'Apertura de turno'
      when e.tipo = 'cierre_turno' then 'Cierre de turno'
      else e.tipo::text
    end,
    e.nota,
    e.monto,
    e.usuario_id,
    e.venta_id, e.gasto_id, c.id, e.id,
    coalesce(e.turno_id, v.turno_id, g.turno_id),
    coalesce(t.caja_id, v.caja_id, g.caja_id),
    coalesce(v.id is not null and v.medio_pago is null, false), coalesce(v.id is not null and v.turno_id is null, false)
  from public.movimientos_efectivo e
  left join public.ventas v on v.id = e.venta_id
  left join public.gastos g on g.id = e.gasto_id
  left join public.categorias_gasto sub on sub.id = g.categoria_id
  left join public.categorias_gasto rubro on rubro.id = sub.padre_id
  left join public.compras_certificado c on c.gasto_id = g.id
  left join public.certificados cert on cert.id = c.certificado_id
  left join public.turnos t on t.id = e.turno_id
)
select
  l.cuenta,
  l.clave,
  l.fecha,
  public.fecha_local(l.fecha) as fecha_local,
  l.origen,
  l.tipo,
  l.sentido,
  l.descripcion,
  l.nota,
  l.monto::numeric(12,2)     as monto,
  l.usuario_id,
  u.nombre_completo           as usuario_nombre,
  l.venta_id,
  l.gasto_id,
  l.compra_id,
  l.movimiento_id,
  l.turno_id,
  l.caja_id,
  cj.nombre                   as caja_nombre,
  l.pago_mixto,
  l.venta_pasada
from libro l
left join public.perfiles u on u.id = l.usuario_id
left join public.cajas cj on cj.id = l.caja_id
where (select public.es_admin());

comment on view public.v_movimientos_fondos is
  'Libro de Fondos (solo admin): efectivo (caja de cambio), transferencia y tarjeta. Monto con signo. Paginar por (fecha desc, clave desc).';

grant select on public.v_movimientos_fondos to authenticated;

-- Ventas con pago mixto (pestaña informativa "Mixto"). -----------------------------------------------

create view public.v_ventas_mixtas
with (security_invoker = true) as
select
  v.id,
  v.creado_en,
  public.fecha_local(v.creado_en) as fecha_local,
  v.turno_id,
  v.caja_id,
  cj.nombre                       as caja_nombre,
  v.servicio_nombre,
  v.patente,
  v.usuario_id,
  u.nombre_completo               as usuario_nombre,
  v.precio,
  coalesce(pg.efectivo, 0)::numeric(12,2)      as pago_efectivo,
  coalesce(pg.transferencia, 0)::numeric(12,2) as pago_transferencia,
  coalesce(pg.tarjeta, 0)::numeric(12,2)       as pago_tarjeta,
  pg.pagos,
  v.anulada,
  v.anulada_en,
  v.anulada_motivo
from public.ventas v
left join public.cajas cj on cj.id = v.caja_id
left join public.perfiles u on u.id = v.usuario_id
left join lateral (
  select sum(p.monto) filter (where p.medio = 'efectivo')      as efectivo,
         sum(p.monto) filter (where p.medio = 'transferencia') as transferencia,
         sum(p.monto) filter (where p.medio = 'tarjeta')       as tarjeta,
         jsonb_agg(jsonb_build_object('medio', p.medio, 'monto', p.monto) order by p.medio) as pagos
  from public.venta_pagos p
  where p.venta_id = v.id
) pg on true
where v.medio_pago is null
  and v.turno_id is not null
  and (select public.es_admin());

comment on view public.v_ventas_mixtas is
  'Ventas con pago mixto (solo admin, informativa): cada parte ya cuenta en su cuenta de Fondos. Paginar por id desc.';

grant select on public.v_ventas_mixtas to authenticated;

-- Movimiento manual ---------------------------------------------------------------------------------

create function public.movimiento_fondos(
  p_cuenta public.cuenta_fondos,
  p_tipo   public.tipo_mov_fondos,
  p_monto  numeric,
  p_nota   text
)
returns public.v_movimientos_fondos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota  text;
  v_saldo numeric;
  v_id    bigint;
  v_clave text;
  v_fila  public.v_movimientos_fondos;
begin
  perform public._exigir_admin();

  if p_cuenta is null then
    raise exception 'Elegí la cuenta (efectivo, transferencia o tarjeta)' using errcode = '22023';
  end if;
  if p_tipo is null then
    raise exception 'Elegí el tipo de movimiento' using errcode = '22023';
  end if;
  perform public._validar_monto(p_monto, 'El monto');
  v_nota := public._texto_obligatorio(p_nota, 'La nota es obligatoria');
  if char_length(v_nota) > 500 then
    raise exception 'La nota no puede superar los 500 caracteres' using errcode = '22023';
  end if;

  if p_cuenta = 'efectivo' then
    -- La caja de cambio de siempre: misma regla (sin saldo negativo) y mismo libro.
    v_id := (public.movimiento_efectivo(p_tipo::text::public.tipo_mov_efectivo, p_monto, v_nota)).id;
    v_clave := format('efectivo:%s', lpad(v_id::text, 19, '0'));
  else
    -- Serializa los movimientos manuales de la cuenta: el segundo retiro ve el primero.
    perform 1 from public.cuentas_fondos where cuenta = p_cuenta for update;

    if p_tipo = 'retiro' then
      select coalesce(sum(f.monto), 0) into v_saldo
      from public.v_movimientos_fondos f
      where f.cuenta = p_cuenta;

      if v_saldo - p_monto < 0 then
        raise exception 'No alcanza el saldo de %: hay $ % y el retiro es de $ %',
          case p_cuenta when 'transferencia' then 'transferencias' else 'crédito/débito' end,
          public._pesos(v_saldo), public._pesos(p_monto)
          using errcode = 'P0001';
      end if;
    end if;

    insert into public.movimientos_fondos (cuenta, tipo, monto, nota, usuario_id)
    values (p_cuenta, p_tipo, case when p_tipo = 'retiro' then -p_monto else p_monto end, v_nota, auth.uid())
    returning id into v_id;
    v_clave := format('manual:%s', lpad(v_id::text, 19, '0'));
  end if;

  select * into v_fila from public.v_movimientos_fondos f where f.clave = v_clave;
  return v_fila;
end;
$$;

revoke all on function public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text)
  from public, anon;
grant execute on function public.movimiento_fondos(public.cuenta_fondos, public.tipo_mov_fondos, numeric, text)
  to authenticated;

-- Totales por cuenta --------------------------------------------------------------------------------
-- saldo: de todos los tiempos. ingresos / egresos / neto: filas del libro con fecha_local en el rango.
-- ingresos = suma de las filas de sentido 'ingreso' (ventas menos sus anulaciones, ingresos manuales,
-- cierres de turno); egresos = −suma de las de sentido 'egreso' (gastos y compras menos sus
-- anulaciones, retiros, aperturas de turno). neto = ingresos − egresos = suma del libro en el rango.

create function public.resumen_fondos(p_desde date default null, p_hasta date default null)
returns table (
  cuenta               public.cuenta_fondos,
  saldo                numeric(14,2),
  ingresos             numeric(14,2),
  egresos              numeric(14,2),
  neto                 numeric(14,2),
  cantidad_movimientos bigint
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
  with en_rango as (
    select f.cuenta, f.sentido, f.monto
    from public.v_movimientos_fondos f
    where (p_desde is null or f.fecha_local >= p_desde)
      and (p_hasta is null or f.fecha_local <= p_hasta)
  )
  select
    c.c,
    coalesce((select sum(f.monto) from public.v_movimientos_fondos f where f.cuenta = c.c), 0)::numeric(14,2),
    coalesce((select sum(r.monto) from en_rango r where r.cuenta = c.c and r.sentido = 'ingreso'), 0)::numeric(14,2),
    coalesce((select -sum(r.monto) from en_rango r where r.cuenta = c.c and r.sentido = 'egreso'), 0)::numeric(14,2),
    coalesce((select sum(r.monto) from en_rango r where r.cuenta = c.c), 0)::numeric(14,2),
    (select count(*) from en_rango r where r.cuenta = c.c)
  from unnest(enum_range(null::public.cuenta_fondos)) as c(c)
  order by c.c;
end;
$$;

revoke all on function public.resumen_fondos(date, date) from public, anon;
grant execute on function public.resumen_fondos(date, date) to authenticated;

-- Totales de ventas mixtas (informativo) ------------------------------------------------------------
-- Ventas mixtas no anuladas con fecha de venta (día de negocio) en el rango, como resumen_diario().
-- `incluido_en_cuentas` es siempre true: estas cifras ya están en las cuentas, no se suman.

create function public.resumen_ventas_mixtas(p_desde date default null, p_hasta date default null)
returns table (
  cantidad_ventas     bigint,
  total               numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  total_tarjeta       numeric(14,2),
  incluido_en_cuentas boolean
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
  select
    count(distinct v.id),
    coalesce(sum(p.monto), 0)::numeric(14,2),
    coalesce(sum(p.monto) filter (where p.medio = 'efectivo'), 0)::numeric(14,2),
    coalesce(sum(p.monto) filter (where p.medio = 'transferencia'), 0)::numeric(14,2),
    coalesce(sum(p.monto) filter (where p.medio = 'tarjeta'), 0)::numeric(14,2),
    true
  from public.ventas v
  join public.venta_pagos p on p.venta_id = v.id
  where v.medio_pago is null
    and v.turno_id is not null
    and not v.anulada
    and (p_desde is null or public.fecha_local(v.creado_en) >= p_desde)
    and (p_hasta is null or public.fecha_local(v.creado_en) <= p_hasta);
end;
$$;

revoke all on function public.resumen_ventas_mixtas(date, date) from public, anon;
grant execute on function public.resumen_ventas_mixtas(date, date) to authenticated;
