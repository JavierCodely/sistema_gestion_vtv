-- Efectivo por turno (decisiones del negocio, 2026-11-21):
-- * Solo el admin abre turnos: elige caja, cajero y el efectivo inicial para cambio (> 0), que sale de
--   la caja de efectivo general (`caja_efectivo`).
-- * Durante el turno, las ventas en efectivo y los gastos pagados en efectivo quedan en el cajón de
--   esa caja: no mueven la caja general. Un gasto en efectivo del turno solo se acepta si el cajón
--   alcanza.
-- * Al cerrar, efectivo inicial + ventas en efectivo − gastos en efectivo (sin anulados) vuelve a la
--   caja general y queda como foto en `turnos.efectivo_cierre`. Ese total lo ve solo el admin
--   (pantalla de Ventas); el cajero no ve totales.
-- * Los gastos del admin desde Gastos y las compras de certificados salen de la caja general y no se
--   cuelgan de ningún turno (antes tomaban el turno abierto de quien los cargaba).
-- * Además (revisión de la fase 5): un gasto no se carga en un rubro desactivado, y los nombres de
--   categorías de gasto se normalizan y son únicos sin distinguir mayúsculas dentro de su rubro.

do $$
begin
  if exists (select 1 from public.turnos where cerrado_en is null) then
    raise exception 'Hay turnos abiertos: cerralos antes de aplicar esta migración (cambia cómo se maneja el efectivo de los turnos)';
  end if;
end;
$$;

alter type public.tipo_mov_efectivo add value if not exists 'apertura_turno';
alter type public.tipo_mov_efectivo add value if not exists 'cierre_turno';

alter table public.turnos
  add column efectivo_inicial numeric(12,2)
    constraint turnos_efectivo_inicial_valido
      check (efectivo_inicial <> 'NaN'::numeric and efectivo_inicial > 0),
  add column efectivo_cierre numeric(12,2)
    constraint turnos_efectivo_cierre_valido
      check (efectivo_cierre <> 'NaN'::numeric and efectivo_cierre >= 0),
  add column abierto_por uuid references public.perfiles (id),
  -- Los turnos anteriores a esta migración (todos cerrados) no tienen efectivo inicial.
  add constraint turnos_abierto_con_efectivo
    check (cerrado_en is not null or efectivo_inicial is not null);

-- Efectivo que debería haber en el cajón del turno. Uso interno.
create function public._efectivo_en_caja(p_turno_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.efectivo_inicial, 0)
       + coalesce((select sum(v.precio) from public.ventas v
                   where v.turno_id = t.id and v.medio_pago = 'efectivo' and not v.anulada), 0)
       - coalesce((select sum(g.monto) from public.gastos g
                   where g.turno_id = t.id and g.fuente = 'efectivo' and not g.anulado), 0)
  from public.turnos t
  where t.id = p_turno_id
$$;

revoke execute on function public._efectivo_en_caja(bigint) from public, anon, authenticated;

-- Abrir turno: solo admin, para cualquier usuario activo (incluido él mismo). ---------------------

drop function public.abrir_turno(bigint);

create function public.abrir_turno(
  p_caja_id          bigint,
  p_usuario_id       uuid,
  p_efectivo_inicial numeric
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caja    public.cajas;
  v_usuario public.perfiles;
  v_turno   public.turnos;
begin
  perform public._exigir_admin();
  perform public._validar_monto(p_efectivo_inicial, 'El efectivo inicial');

  select * into v_caja from public.cajas where id = p_caja_id;
  if v_caja.id is null or not v_caja.activa then
    raise exception 'La caja no existe o está desactivada' using errcode = '22023';
  end if;
  select * into v_usuario from public.perfiles where id = p_usuario_id;
  if v_usuario.id is null or not v_usuario.activo then
    raise exception 'El usuario no existe o está desactivado' using errcode = '22023';
  end if;
  if exists (select 1 from public.turnos where usuario_id = p_usuario_id and cerrado_en is null) then
    raise exception '% ya tiene un turno abierto; cerralo antes de abrir otro', v_usuario.nombre_completo
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.turnos where caja_id = p_caja_id and cerrado_en is null) then
    raise exception 'La caja "%" ya tiene un turno abierto', v_caja.nombre using errcode = 'P0001';
  end if;

  begin
    insert into public.turnos (caja_id, usuario_id, efectivo_inicial, abierto_por)
    values (p_caja_id, p_usuario_id, p_efectivo_inicial, auth.uid())
    returning * into v_turno;
  exception when unique_violation then
    raise exception 'La caja "%" o el usuario acaban de recibir otro turno', v_caja.nombre
      using errcode = 'P0001';
  end;

  -- Sale de la caja general (si no alcanza, se rechaza y no se abre nada).
  perform public._mover_efectivo('apertura_turno', -p_efectivo_inicial,
    format('Efectivo inicial del turno #%s (%s, %s)', v_turno.id, v_caja.nombre, v_usuario.nombre_completo),
    v_turno.id);

  return v_turno;
end;
$$;

grant execute on function public.abrir_turno(bigint, uuid, numeric) to authenticated;

-- Cerrar turno: el efectivo del cajón vuelve a la caja general. -----------------------------------

create or replace function public.cerrar_turno(
  p_observaciones text default null,
  p_turno_id      bigint default null
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol      public.rol_usuario := public._exigir_usuario();
  v_turno    public.turnos;
  v_efectivo numeric(12,2);
begin
  if p_turno_id is null then
    select * into v_turno from public.turnos
    where usuario_id = auth.uid() and cerrado_en is null
    for update;
    if v_turno.id is null then
      raise exception 'No tenés un turno abierto' using errcode = 'P0001';
    end if;
  else
    select * into v_turno from public.turnos where id = p_turno_id for update;
    if v_turno.id is null then
      raise exception 'El turno no existe' using errcode = '22023';
    end if;
    if v_turno.usuario_id <> auth.uid() and v_rol <> 'admin' then
      raise exception 'Solo un administrador puede cerrar el turno de otro usuario' using errcode = '42501';
    end if;
    if v_turno.cerrado_en is not null then
      raise exception 'El turno ya estaba cerrado' using errcode = 'P0001';
    end if;
  end if;

  v_efectivo := public._efectivo_en_caja(v_turno.id);

  update public.turnos t
  set cerrado_en          = now(),
      observaciones       = nullif(btrim(p_observaciones), ''),
      cantidad_ventas     = r.cantidad,
      total_efectivo      = r.efectivo,
      total_transferencia = r.transferencia,
      total_tarjeta       = r.tarjeta,
      total_gastos        = r.gastos,
      efectivo_cierre     = v_efectivo
  from (
    select
      count(*) filter (where not v.anulada)                                         as cantidad,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'efectivo'), 0)      as efectivo,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'transferencia'), 0) as transferencia,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'tarjeta'), 0)       as tarjeta,
      (select coalesce(sum(g.monto), 0) from public.gastos g
        where g.turno_id = v_turno.id and not g.anulado)                            as gastos
    from public.ventas v
    where v.turno_id = v_turno.id
  ) r
  where t.id = v_turno.id
  returning t.* into v_turno;

  if v_efectivo > 0 then
    perform public._mover_efectivo('cierre_turno', v_efectivo,
      format('Cierre del turno #%s', v_turno.id), v_turno.id);
  end if;

  return v_turno;
end;
$$;

-- Ventas: el efectivo queda en el cajón del turno. -------------------------------------------------

create or replace function public.registrar_venta(
  p_servicio_id bigint,
  p_medio_pago  public.medio_pago,
  p_patente     text default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno    public.turnos;
  v_servicio public.servicios;
  v_cert     public.certificados;
  v_cert_id  bigint;
  v_venta    public.ventas;
  v_patente  text := nullif(upper(regexp_replace(coalesce(p_patente, ''), '\s', '', 'g')), '');
begin
  perform public._exigir_usuario();

  if p_medio_pago is null then
    raise exception 'Elegí un medio de pago' using errcode = '22023';
  end if;

  select * into v_turno from public.turnos
  where usuario_id = auth.uid() and cerrado_en is null
  for share;  -- serializa con cerrar_turno
  if v_turno.id is null then
    raise exception 'Necesitás un turno abierto para vender' using errcode = 'P0001';
  end if;

  select * into v_servicio from public.servicios where id = p_servicio_id;
  if v_servicio.id is null or not v_servicio.activo then
    raise exception 'El servicio no existe o está desactivado' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categorias_servicio
                 where id = v_servicio.categoria_id and activa) then
    raise exception 'La categoría de este servicio está desactivada' using errcode = '22023';
  end if;

  insert into public.ventas
    (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id,
     precio, medio_pago, patente)
  values
    (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
     v_servicio.precio, p_medio_pago, v_patente)
  returning * into v_venta;

  if v_servicio.requiere_certificado then
    v_cert_id := public.certificado_para_servicio(v_servicio.id);

    if v_cert_id is not null then
      select * into v_cert from public.certificados where id = v_cert_id for update;
    end if;

    if v_cert.id is not null and v_cert.stock_hojas > 0 then
      update public.certificados set stock_hojas = stock_hojas - 1 where id = v_cert.id;

      insert into public.movimientos_certificado
        (certificado_id, tipo, hojas, costo_unitario, costo_total,
         stock_resultante, costo_promedio_resultante, venta_id, usuario_id)
      values
        (v_cert.id, 'venta', -1, v_cert.costo_promedio, -round(v_cert.costo_promedio, 2),
         v_cert.stock_hojas - 1, v_cert.costo_promedio, v_venta.id, auth.uid());

      update public.ventas
      set certificado_id = v_cert.id, costo_certificado = v_cert.costo_promedio
      where id = v_venta.id
      returning * into v_venta;

      -- Aviso al cruzar el stock mínimo.
      if v_cert.stock_hojas > v_cert.stock_minimo and v_cert.stock_hojas - 1 <= v_cert.stock_minimo then
        insert into public.alertas (tipo, mensaje, certificado_id, venta_id)
        values ('stock_bajo',
                format('Stock bajo de "%s": quedan %s hojas (mínimo %s)',
                       v_cert.nombre, v_cert.stock_hojas - 1, v_cert.stock_minimo),
                v_cert.id, v_venta.id);
      end if;
    else
      update public.ventas
      set certificado_id = v_cert.id, sin_stock = true
      where id = v_venta.id
      returning * into v_venta;

      insert into public.alertas (tipo, mensaje, certificado_id, venta_id)
      values ('venta_sin_stock',
              case when v_cert.id is null
                then format('Venta #%s (%s) sin certificado: no hay un certificado configurado para este servicio',
                            v_venta.id, v_servicio.nombre)
                else format('Venta #%s (%s) sin certificado: no hay stock de "%s"',
                            v_venta.id, v_servicio.nombre, v_cert.nombre)
              end,
              v_cert.id, v_venta.id);
    end if;
  end if;

  -- El efectivo de la venta queda en el cajón: vuelve a la caja general al cerrar el turno.
  return v_venta;
end;
$$;

-- Anular venta: si el turno sigue abierto, sale del cajón; si ya cerró, de la caja general. -------

create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta   public.ventas;
  v_turno   public.turnos;
  v_motivo  text;
  v_factura public.comprobantes;
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'El motivo es obligatorio');

  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    raise exception 'La venta no existe' using errcode = '22023';
  end if;
  -- El turno primero (mismo orden que cerrar_turno y los gastos): serializa el cálculo del cajón.
  select * into v_turno from public.turnos where id = v_venta.turno_id for update;
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if v_venta.anulada then
    raise exception 'La venta ya estaba anulada' using errcode = 'P0001';
  end if;

  select * into v_factura from public.comprobantes
  where venta_id = p_venta_id and tipo = 'factura' for update;
  if v_factura.estado = 'procesando' or v_factura.numero_intentado is not null then
    raise exception 'La factura de esta venta se envió a ARCA y falta confirmar el resultado: reintentá la emisión y después anulá la venta'
      using errcode = 'P0001';
  end if;

  update public.ventas
  set anulada = true, anulada_motivo = v_motivo, anulada_por = auth.uid(), anulada_en = now()
  where id = p_venta_id
  returning * into v_venta;

  if v_venta.medio_pago = 'efectivo' and v_venta.precio > 0 then
    if v_turno.cerrado_en is null then
      if public._efectivo_en_caja(v_turno.id) < 0 then
        raise exception 'La caja del turno no tiene efectivo suficiente para devolver esta venta (en el cajón hay $%)',
          translate(to_char(public._efectivo_en_caja(v_turno.id) + v_venta.precio, 'FM9,999,999,990.00'), ',.', '.,')
          using errcode = 'P0001';
      end if;
    else
      perform public._mover_efectivo('anulacion_venta', -v_venta.precio,
        'Anulación de venta #' || v_venta.id || ': ' || v_motivo, null, v_venta.id, null);
    end if;
  end if;

  if v_factura.estado = 'autorizado' then
    insert into public.comprobantes (
      venta_id, tipo, asociado_id, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta,
      fecha_servicio, doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor_id,
      neto, iva, total, creado_por)
    values (
      v_venta.id, 'nota_credito', v_factura.id, v_factura.clase,
      case v_factura.clase when 'A' then 3 else 8 end, v_factura.ambiente, v_factura.cuit_emisor,
      v_factura.punto_venta, v_factura.fecha_servicio, v_factura.doc_tipo, v_factura.doc_nro,
      v_factura.receptor_nombre, v_factura.condicion_iva_receptor_id,
      v_factura.neto, v_factura.iva, v_factura.total, auth.uid());
  elsif v_factura.id is not null then
    -- Nunca llegó a ARCA: no hay nada que compensar.
    update public.comprobantes
    set estado = 'cancelado', mensaje = 'Venta anulada antes de facturarse', actualizado_en = now()
    where id = v_factura.id;
  end if;

  return v_venta;
end;
$$;

-- Gastos: del turno (cajón) o de la caja general. ----------------------------------------------------

drop function public._insertar_gasto(bigint, numeric, public.fuente_fondos, text);

-- p_turno_id: turno abierto ya bloqueado por quien llama (el gasto sale del cajón), o NULL (caja
-- general, sin turno: gastos del admin y compras de certificados).
create function public._insertar_gasto(
  p_categoria_id bigint,
  p_monto        numeric,
  p_fuente       public.fuente_fondos,
  p_nota         text,
  p_turno_id     bigint default null
)
returns public.gastos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos;
  v_gasto public.gastos;
begin
  perform public._validar_monto(p_monto, 'El monto');
  if p_fuente is null then
    raise exception 'Indicá la fuente del gasto (efectivo o transferencia)' using errcode = '22023';
  end if;

  if p_turno_id is not null then
    select * into v_turno from public.turnos where id = p_turno_id;
  end if;

  insert into public.gastos (categoria_id, monto, fuente, nota, usuario_id, turno_id, caja_id)
  values (p_categoria_id, p_monto, p_fuente, public._texto_obligatorio(p_nota, 'La nota es obligatoria'),
          auth.uid(), v_turno.id, v_turno.caja_id)
  returning * into v_gasto;

  if p_fuente = 'efectivo' then
    if v_turno.id is not null then
      if public._efectivo_en_caja(v_turno.id) < 0 then
        if public.es_admin() then
          raise exception 'No hay suficiente efectivo en la caja del turno (disponible: $%, necesario: $%)',
            translate(to_char(public._efectivo_en_caja(v_turno.id) + p_monto, 'FM9,999,999,990.00'), ',.', '.,'),
            translate(to_char(p_monto, 'FM9,999,999,990.00'), ',.', '.,')
            using errcode = 'P0001';
        end if;
        raise exception 'No hay suficiente efectivo en la caja para este gasto. Avisale al administrador'
          using errcode = 'P0001';
      end if;
    else
      perform public._mover_efectivo('gasto', -p_monto, v_gasto.nota, null, null, v_gasto.id);
    end if;
  end if;

  return v_gasto;
end;
$$;

revoke execute on function public._insertar_gasto(bigint, numeric, public.fuente_fondos, text, bigint)
  from public, anon, authenticated;

drop function public.registrar_gasto(bigint, numeric, public.fuente_fondos, text);

-- p_del_turno: el gasto se paga desde la caja del turno abierto de quien lo carga. El cajero siempre
-- carga en su turno; el admin elige (pantalla de caja = turno, pantalla de Gastos = caja general).
create function public.registrar_gasto(
  p_categoria_id bigint,
  p_monto        numeric,
  p_fuente       public.fuente_fondos,
  p_nota         text,
  p_del_turno    boolean default false
)
returns public.gastos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol   public.rol_usuario := public._exigir_usuario();
  v_cat   public.categorias_gasto;
  v_turno public.turnos;
begin
  select * into v_cat from public.categorias_gasto where id = p_categoria_id;

  if v_cat.id is null or not v_cat.activa then
    raise exception 'La categoría de gasto no existe o está inactiva' using errcode = '22023';
  end if;
  if v_cat.padre_id is null then
    raise exception 'Elegí una subcategoría, no un rubro' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categorias_gasto where id = v_cat.padre_id and activa) then
    raise exception 'El rubro de la categoría "%" está desactivado', v_cat.nombre using errcode = '22023';
  end if;
  if v_cat.sistema is not null then
    raise exception 'La categoría "%" se registra automáticamente; no se carga a mano', v_cat.nombre
      using errcode = '22023';
  end if;
  if v_rol = 'cajero' and not v_cat.habilitada_caja then
    raise exception 'La categoría "%" no está habilitada para la caja', v_cat.nombre
      using errcode = '42501';
  end if;

  if v_rol = 'cajero' or coalesce(p_del_turno, false) then
    -- for update: serializa con cerrar_turno, anulaciones y otros gastos que miran el mismo cajón.
    select * into v_turno from public.turnos
    where usuario_id = auth.uid() and cerrado_en is null
    for update;
    if v_turno.id is null then
      raise exception 'Necesitás un turno abierto para registrar gastos' using errcode = 'P0001';
    end if;
  end if;

  return public._insertar_gasto(p_categoria_id, p_monto, p_fuente, p_nota, v_turno.id);
end;
$$;

grant execute on function public.registrar_gasto(bigint, numeric, public.fuente_fondos, text, boolean)
  to authenticated;

-- Anular gasto: si su turno sigue abierto, vuelve al cajón; si no, a la caja general. -------------

create or replace function public.anular_gasto(p_gasto_id bigint, p_motivo text)
returns public.gastos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gasto  public.gastos;
  v_turno  public.turnos;
  v_motivo text;
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'El motivo es obligatorio');

  select * into v_gasto from public.gastos where id = p_gasto_id;
  if v_gasto.id is null then
    raise exception 'El gasto no existe' using errcode = '22023';
  end if;
  if v_gasto.turno_id is not null then
    select * into v_turno from public.turnos where id = v_gasto.turno_id for update;
  end if;
  select * into v_gasto from public.gastos where id = p_gasto_id for update;
  if v_gasto.anulado then
    raise exception 'El gasto ya estaba anulado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.categorias_gasto where id = v_gasto.categoria_id and sistema is not null) then
    raise exception 'Este gasto lo generó el sistema (compra de certificados) y no se puede anular'
      using errcode = 'P0001';
  end if;

  update public.gastos
  set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_en = now()
  where id = p_gasto_id
  returning * into v_gasto;

  -- Con el turno abierto el dinero vuelve al cajón (se recalcula solo); si no, a la caja general.
  if v_gasto.fuente = 'efectivo' and (v_turno.id is null or v_turno.cerrado_en is not null) then
    perform public._mover_efectivo('anulacion_gasto', v_gasto.monto,
      'Anulación de gasto #' || v_gasto.id || ': ' || v_motivo, null, null, v_gasto.id);
  end if;

  return v_gasto;
end;
$$;

-- Vista de turnos: efectivo inicial, gastos en efectivo y efectivo de la caja (solo admin en pantalla).

create or replace view public.v_turnos
with (security_invoker = true) as
select
  t.id,
  t.caja_id,
  t.usuario_id,
  t.abierto_en,
  t.cerrado_en,
  t.observaciones,
  t.cantidad_ventas,
  t.total_efectivo,
  t.total_transferencia,
  t.total_tarjeta,
  t.total_gastos,
  c.nombre as caja_nombre,
  p.nombre_completo as usuario_nombre,
  t.cerrado_en is null as abierto,
  coalesce(v.cantidad, 0::bigint) as ventas_cantidad,
  coalesce(v.efectivo, 0::numeric)::numeric(14,2) as ventas_efectivo,
  coalesce(v.transferencia, 0::numeric)::numeric(14,2) as ventas_transferencia,
  coalesce(v.tarjeta, 0::numeric)::numeric(14,2) as ventas_tarjeta,
  coalesce(v.total, 0::numeric)::numeric(14,2) as ventas_total,
  coalesce(g.total, 0::numeric)::numeric(14,2) as gastos_total,
  (coalesce(v.total, 0::numeric) - coalesce(g.total, 0::numeric))::numeric(14,2) as neto,
  t.efectivo_inicial,
  coalesce(g.efectivo, 0::numeric)::numeric(14,2) as gastos_efectivo,
  (coalesce(t.efectivo_inicial, 0) + coalesce(v.efectivo, 0) - coalesce(g.efectivo, 0))::numeric(14,2)
    as efectivo_en_caja
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles p on p.id = t.usuario_id
left join lateral (
  select count(*) as cantidad,
         sum(ventas.precio) as total,
         sum(ventas.precio) filter (where ventas.medio_pago = 'efectivo') as efectivo,
         sum(ventas.precio) filter (where ventas.medio_pago = 'transferencia') as transferencia,
         sum(ventas.precio) filter (where ventas.medio_pago = 'tarjeta') as tarjeta
  from public.ventas
  where ventas.turno_id = t.id and not ventas.anulada
) v on true
left join lateral (
  select sum(gastos.monto) as total,
         sum(gastos.monto) filter (where gastos.fuente = 'efectivo') as efectivo
  from public.gastos
  where gastos.turno_id = t.id and not gastos.anulado
) g on true;

-- Categorías de gasto: nombres prolijos y únicos sin mayúsculas dentro del rubro. -----------------

create trigger categorias_gasto_normalizar_nombre
  before insert or update of nombre on public.categorias_gasto
  for each row execute function public.tg_normalizar_nombre();

update public.categorias_gasto set nombre = nombre
  where nombre is distinct from regexp_replace(btrim(nombre), '\s+', ' ', 'g');

alter table public.categorias_gasto drop constraint categorias_gasto_nombre_unico;
create unique index categorias_gasto_nombre_unico
  on public.categorias_gasto (padre_id, lower(nombre)) nulls not distinct;
