-- Gastos: eliminar rubros y subcategorías sin uso, y corregir un gasto del historial
-- (decisiones del negocio, 2026-11-24).
--
-- * `eliminar_categoria_gasto(id)` (solo admin): una subcategoría sin gastos, o un rubro cuyas
--   subcategorías no tienen gastos (se eliminan con él). Con gastos se rechaza con un mensaje que
--   dice desactivarla: el historial nunca cambia. Las del sistema (compra de certificados) y el rubro
--   que las contiene no se eliminan. Es el único camino para borrar: se quita el DELETE directo.
-- * `corregir_gasto(...)` (solo admin, motivo obligatorio), como `corregir_compra_certificado`: en
--   una transacción se anula el original (en efectivo, el dinero vuelve al cajón si su turno sigue
--   abierto o a la caja de cambio) y se registra el corregido con la subcategoría, el monto, la fuente
--   y la nota nuevos. El corregido conserva la fecha, el turno, la caja y quién lo cargó (es el mismo
--   gasto, bien cargado); en efectivo se paga con el cajón si el turno sigue abierto o con la caja de
--   cambio si no (si no alcanza, se rechaza y no cambia nada). El original queda tachado con el
--   motivo y enlazado: `gastos.reemplazado_por` (en el original) y `gastos.corrige_a` (en el
--   corregido). Los gastos automáticos de compras se corrigen desde la compra.

-- Columnas de la corrección ---------------------------------------------------------------------------

alter table public.gastos
  add column reemplazado_por bigint references public.gastos (id),
  add column corrige_a       bigint references public.gastos (id),
  add constraint gastos_reemplazado_anulado check (reemplazado_por is null or anulado),
  add constraint gastos_corrige_a_unico unique (corrige_a);

comment on column public.gastos.reemplazado_por is
  'Gasto que lo reemplazó al corregirlo (corregir_gasto). El original queda anulado.';
comment on column public.gastos.corrige_a is
  'Gasto original que este corrige (corregir_gasto).';

-- authenticated lee la tabla entera (migración 13): las columnas nuevas quedan legibles con la RLS.

-- Historial: las columnas nuevas al final ------------------------------------------------------------

create or replace view public.v_movimientos_caja
with (security_invoker = true) as
select
  'venta'::text as tipo,
  v.id,
  v.creado_en as fecha,
  public.fecha_local(v.creado_en) as fecha_local,
  v.turno_id,
  v.caja_id,
  c.nombre as caja_nombre,
  v.usuario_id,
  coalesce(p.nombre_completo, public.nombre_usuario(v.usuario_id)) as usuario_nombre,
  v.servicio_nombre as concepto,
  cs.nombre as detalle,
  coalesce(v.medio_pago::text, 'mixto') as medio,
  v.precio as monto,
  v.patente,
  v.sin_stock,
  v.anulada,
  v.anulada_motivo as motivo_anulacion,
  null::text as nota,
  v.servicio_id,
  null::bigint as categoria_gasto_id,
  (select jsonb_agg(jsonb_build_object('medio', vp.medio, 'monto', vp.monto) order by vp.medio)
   from public.venta_pagos vp where vp.venta_id = v.id) as pagos,
  v.descuento_nombre,
  v.monto_descuento,
  v.precio_lista,
  null::bigint as reemplazado_por,
  null::bigint as corrige_a
from public.ventas v
join public.cajas c on c.id = v.caja_id
left join public.perfiles p on p.id = v.usuario_id
left join public.categorias_servicio cs on cs.id = v.categoria_id
union all
select
  'gasto'::text as tipo,
  g.id,
  g.creado_en as fecha,
  public.fecha_local(g.creado_en) as fecha_local,
  g.turno_id,
  g.caja_id,
  c.nombre as caja_nombre,
  g.usuario_id,
  coalesce(p.nombre_completo, public.nombre_usuario(g.usuario_id)) as usuario_nombre,
  sub.nombre as concepto,
  rubro.nombre as detalle,
  g.fuente::text as medio,
  - g.monto as monto,
  null::text as patente,
  false as sin_stock,
  g.anulado as anulada,
  g.anulado_motivo as motivo_anulacion,
  g.nota,
  null::bigint as servicio_id,
  g.categoria_id as categoria_gasto_id,
  null::jsonb as pagos,
  null::text as descuento_nombre,
  null::numeric(12,2) as monto_descuento,
  null::numeric(12,2) as precio_lista,
  g.reemplazado_por,
  g.corrige_a
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

-- Eliminar categorías ---------------------------------------------------------------------------------

create function public.eliminar_categoria_gasto(p_categoria_id bigint)
returns public.categorias_gasto
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat     public.categorias_gasto;
  v_sub     public.categorias_gasto;
  v_usada   text;
begin
  perform public._exigir_admin();

  -- for update: una carga de gasto en paralelo (la FK toma un lock sobre la categoría) espera o
  -- hace fallar el borrado; nunca queda un gasto apuntando a nada.
  select * into v_cat from public.categorias_gasto where id = p_categoria_id for update;
  if v_cat.id is null then
    raise exception 'La categoría de gasto no existe' using errcode = '22023';
  end if;
  if v_cat.sistema is not null then
    raise exception 'La categoría "%" la usa el sistema y no se puede eliminar', v_cat.nombre
      using errcode = '42501';
  end if;

  if v_cat.padre_id is not null then
    if exists (select 1 from public.gastos where categoria_id = v_cat.id) then
      raise exception 'La subcategoría "%" ya tiene gastos: desactivala en vez de eliminarla', v_cat.nombre
        using errcode = 'P0001';
    end if;
    delete from public.categorias_gasto where id = v_cat.id;
    return v_cat;
  end if;

  perform 1 from public.categorias_gasto where padre_id = v_cat.id for update;
  select * into v_sub from public.categorias_gasto
  where padre_id = v_cat.id and sistema is not null
  limit 1;
  if v_sub.id is not null then
    raise exception 'El rubro "%" tiene la subcategoría automática "%": no se puede eliminar',
      v_cat.nombre, v_sub.nombre using errcode = 'P0001';
  end if;
  select s.nombre into v_usada
  from public.categorias_gasto s
  where s.padre_id = v_cat.id and exists (select 1 from public.gastos g where g.categoria_id = s.id)
  order by s.nombre
  limit 1;
  if v_usada is not null then
    raise exception 'El rubro "%" ya tiene gastos en "%": desactivalo en vez de eliminarlo',
      v_cat.nombre, v_usada using errcode = 'P0001';
  end if;

  delete from public.categorias_gasto where padre_id = v_cat.id;
  delete from public.categorias_gasto where id = v_cat.id;
  return v_cat;
end;
$$;

grant execute on function public.eliminar_categoria_gasto(bigint) to authenticated;

revoke delete on public.categorias_gasto from authenticated;
drop policy "admin borra categorias de gasto" on public.categorias_gasto;

-- Corregir un gasto -----------------------------------------------------------------------------------

create function public.corregir_gasto(
  p_gasto_id     bigint,
  p_categoria_id bigint,
  p_monto        numeric,
  p_fuente       public.fuente_fondos,
  p_nota         text,
  p_motivo       text
)
returns public.gastos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original  public.gastos;
  v_corregido public.gastos;
  v_turno     public.turnos;
  v_cat       public.categorias_gasto;
  v_motivo    text;
  v_nota      text;
  v_en_cajon  boolean;
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'El motivo es obligatorio');
  if char_length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres' using errcode = '22023';
  end if;
  perform public._validar_monto(p_monto, 'El monto');
  if p_fuente is null then
    raise exception 'Indicá la fuente del gasto (efectivo o transferencia)' using errcode = '22023';
  end if;
  v_nota := public._texto_obligatorio(p_nota, 'La nota es obligatoria');

  -- Mismo orden de locks que anular_gasto: el turno (serializa con el cierre y el cajón) y el gasto.
  select * into v_original from public.gastos where id = p_gasto_id;
  if v_original.id is null then
    raise exception 'El gasto no existe' using errcode = '22023';
  end if;
  if v_original.turno_id is not null then
    select * into v_turno from public.turnos where id = v_original.turno_id for update;
  end if;
  select * into v_original from public.gastos where id = p_gasto_id for update;
  if v_original.anulado then
    raise exception 'El gasto ya estaba anulado: no se puede corregir' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.categorias_gasto where id = v_original.categoria_id and sistema is not null) then
    raise exception 'Este gasto lo generó una compra de certificados: corregí la compra' using errcode = 'P0001';
  end if;

  -- La subcategoría nueva: como en registrar_gasto, salvo que puede quedar la del original aunque
  -- hoy esté desactivada (corregir el monto de un gasto viejo no obliga a cambiarle la categoría).
  select * into v_cat from public.categorias_gasto where id = p_categoria_id;
  if v_cat.id is null then
    raise exception 'La categoría de gasto no existe' using errcode = '22023';
  end if;
  if v_cat.padre_id is null then
    raise exception 'Elegí una subcategoría, no un rubro' using errcode = '22023';
  end if;
  if v_cat.sistema is not null then
    raise exception 'La categoría "%" se registra automáticamente; no se carga a mano', v_cat.nombre
      using errcode = '22023';
  end if;
  if v_cat.id <> v_original.categoria_id then
    if not v_cat.activa then
      raise exception 'La categoría "%" está desactivada', v_cat.nombre using errcode = '22023';
    end if;
    if not exists (select 1 from public.categorias_gasto where id = v_cat.padre_id and activa) then
      raise exception 'El rubro de la categoría "%" está desactivado', v_cat.nombre using errcode = '22023';
    end if;
  end if;

  v_en_cajon := v_turno.id is not null and v_turno.cerrado_en is null;

  -- 1) Anular el original (en efectivo: con el turno abierto el cajón se recalcula solo; si no,
  --    el dinero vuelve a la caja de cambio).
  update public.gastos
  set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_en = now()
  where id = v_original.id;
  if v_original.fuente = 'efectivo' and not v_en_cajon then
    perform public._mover_efectivo('anulacion_gasto', v_original.monto,
      'Corrección de gasto #' || v_original.id || ': ' || v_motivo, null, null, v_original.id);
  end if;

  -- 2) Registrar el corregido: misma fecha, turno, caja y quién lo cargó.
  insert into public.gastos (categoria_id, monto, fuente, nota, usuario_id, turno_id, caja_id,
                             creado_en, corrige_a)
  values (v_cat.id, p_monto, p_fuente, v_nota, v_original.usuario_id, v_original.turno_id,
          v_original.caja_id, v_original.creado_en, v_original.id)
  returning * into v_corregido;

  update public.gastos set reemplazado_por = v_corregido.id where id = v_original.id;

  if p_fuente = 'efectivo' then
    if v_en_cajon then
      if public._efectivo_en_caja(v_turno.id) < 0 then
        raise exception 'No hay suficiente efectivo en la caja del turno (disponible: $%, necesario: $%)',
          translate(to_char(public._efectivo_en_caja(v_turno.id) + p_monto, 'FM9,999,999,990.00'), ',.', '.,'),
          translate(to_char(p_monto, 'FM9,999,999,990.00'), ',.', '.,')
          using errcode = 'P0001';
      end if;
    else
      perform public._mover_efectivo('gasto', -p_monto,
        'Gasto #' || v_corregido.id || ' (corrige al #' || v_original.id || '): ' || v_nota,
        null, null, v_corregido.id);
    end if;
  end if;

  return v_corregido;
end;
$$;

grant execute on function public.corregir_gasto(bigint, bigint, numeric, public.fuente_fondos, text, text)
  to authenticated;
