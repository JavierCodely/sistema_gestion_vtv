-- Turnos de caja compartida (decisión del negocio, 2026-11-22):
-- "al iniciar turno no debería colocar quién atiende, ya que cuando abro una caja todos los cajeros
-- con rol cajero deberían poder atender" / "todos pueden trabajar en una caja abierta".
--
-- * El turno es de la CAJA, no de una persona. `abrir_turno(p_caja_id, p_efectivo_inicial)` (solo
--   admin) abre la caja con el efectivo inicial, que sale de la caja de cambio como hasta ahora.
--   Sigue habiendo un solo turno abierto por caja; desaparece "un turno abierto por usuario".
--   `turnos.abierto_por` registra al admin que la abrió.
-- * `turnos.usuario_id` queda como historia: los turnos anteriores a esta migración guardan al
--   cajero asignado; los nuevos lo dejan en NULL. Nada lo usa para permisos.
-- * Cualquier usuario activo (cajero o admin) trabaja en cualquier caja con turno abierto, y varios a
--   la vez comparten el mismo cajón. Cada venta y cada gasto ya guardaban quién los hizo
--   (`ventas.usuario_id`, `gastos.usuario_id`, NOT NULL desde las migraciones 07 y 10).
-- * Elegir la caja: `registrar_venta(p_turno_id, ...)` y `registrar_gasto(..., p_turno_id)` reciben el
--   turno explícito (nunca se adivina). Se elige el turno y no la caja: si el turno se cerró y la caja
--   se volvió a abrir, la venta se rechaza en vez de caer en otro turno sin que nadie lo note.
-- * Cerrar: solo el admin, `cerrar_turno(p_turno_id, p_observaciones)`. El efectivo del cajón vuelve a
--   la caja de cambio, como hasta ahora.
-- * Qué lee el cajero (RLS): las ventas (con sus pagos), gastos y comprobantes de los turnos ABIERTOS
--   de todas las cajas; de los turnos cerrados no lee nada (ni lo propio): su pantalla solo muestra el
--   turno donde trabaja. `turnos` y `v_turnos` pasan a ser solo del admin (auditoría 2026-11-22): el
--   cajero ya no lee el efectivo inicial, el efectivo del cajón, las observaciones ni los totales de
--   ningún turno. Para elegir la caja usa `v_turnos_abiertos` (id, caja y desde cuándo, sin dinero),
--   que lee de `turnos_abiertos()`; las políticas preguntan por `turno_abierto(id)`. La caja de cambio
--   sigue siendo solo del admin (migración 26).
-- * Facturación: el cajero factura cualquier venta de un turno abierto, sea de quien sea; el admin,
--   cualquier venta. `comprobantes.actualizado_por` registra quién corrigió por última vez los datos
--   del cliente de una factura (`preparar_factura`), para que una corrección ajena deje rastro.
--
-- Producción: funciona con o sin turnos abiertos. Un turno abierto al aplicarla conserva su
-- `usuario_id` (historia) y pasa a ser de la caja: desde ese momento cualquiera vende en él y solo el
-- admin lo cierra. No hay `alter type ... add value` (01_esquema_completo.sql corre todo en una
-- transacción).

-- Turnos ------------------------------------------------------------------------------------------

drop index public.turnos_un_abierto_por_usuario;

alter table public.turnos alter column usuario_id drop not null;

comment on column public.turnos.usuario_id is
  'Cajero asignado en los turnos anteriores a la migración 33 (historia). NULL en los turnos de caja compartida: quién vendió o gastó está en ventas.usuario_id / gastos.usuario_id.';
comment on column public.turnos.abierto_por is 'Administrador que abrió el turno.';

-- Abrir turno: solo admin, sin usuario asignado. ------------------------------------------------------

drop function public.abrir_turno(bigint, uuid, numeric);

create function public.abrir_turno(
  p_caja_id          bigint,
  p_efectivo_inicial numeric
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caja  public.cajas;
  v_turno public.turnos;
begin
  perform public._exigir_admin();
  perform public._validar_monto(p_efectivo_inicial, 'El efectivo inicial');

  if p_caja_id is null then
    raise exception 'Elegí la caja que vas a abrir' using errcode = '22023';
  end if;
  select * into v_caja from public.cajas where id = p_caja_id;
  if v_caja.id is null or not v_caja.activa then
    raise exception 'La caja no existe o está desactivada' using errcode = '22023';
  end if;
  if exists (select 1 from public.turnos where caja_id = p_caja_id and cerrado_en is null) then
    raise exception 'La caja "%" ya tiene un turno abierto', v_caja.nombre using errcode = 'P0001';
  end if;

  begin
    insert into public.turnos (caja_id, efectivo_inicial, abierto_por)
    values (p_caja_id, p_efectivo_inicial, auth.uid())
    returning * into v_turno;
  exception when unique_violation then
    raise exception 'La caja "%" se acaba de abrir en otro turno', v_caja.nombre using errcode = 'P0001';
  end;

  -- Sale de la caja de cambio (si no alcanza, se rechaza y no se abre nada).
  perform public._mover_efectivo('apertura_turno', -p_efectivo_inicial,
    format('Efectivo inicial del turno #%s (%s)', v_turno.id, v_caja.nombre), v_turno.id);

  return v_turno;
end;
$$;

grant execute on function public.abrir_turno(bigint, numeric) to authenticated;

-- Cerrar turno: solo admin, turno explícito. --------------------------------------------------------

drop function public.cerrar_turno(text, bigint);

create function public.cerrar_turno(
  p_turno_id      bigint,
  p_observaciones text default null
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno    public.turnos;
  v_efectivo numeric(12,2);
begin
  perform public._exigir_admin();

  if p_turno_id is null then
    raise exception 'Elegí el turno que vas a cerrar' using errcode = '22023';
  end if;
  -- for update: espera a las ventas y gastos en curso (toman el turno con for share / for update).
  select * into v_turno from public.turnos where id = p_turno_id for update;
  if v_turno.id is null then
    raise exception 'El turno no existe' using errcode = '22023';
  end if;
  if v_turno.cerrado_en is not null then
    raise exception 'El turno ya estaba cerrado' using errcode = 'P0001';
  end if;

  v_efectivo := public._efectivo_en_caja(v_turno.id);

  update public.turnos t
  -- clock_timestamp(): la hora real del cierre, posterior a toda venta o gasto que se esperó con el
  -- for update (now() es el inicio de la transacción y podría quedar antes de la última venta).
  set cerrado_en          = clock_timestamp(),
      observaciones       = nullif(btrim(p_observaciones), ''),
      cantidad_ventas     = r.cantidad,
      total_efectivo      = r.efectivo,
      total_transferencia = r.transferencia,
      total_tarjeta       = r.tarjeta,
      total_gastos        = r.gastos,
      efectivo_cierre     = v_efectivo
  from (
    select
      (select count(*) from public.ventas v
        where v.turno_id = v_turno.id and not v.anulada)                         as cantidad,
      coalesce(sum(p.monto) filter (where p.medio = 'efectivo'), 0)               as efectivo,
      coalesce(sum(p.monto) filter (where p.medio = 'transferencia'), 0)          as transferencia,
      coalesce(sum(p.monto) filter (where p.medio = 'tarjeta'), 0)                as tarjeta,
      (select coalesce(sum(g.monto), 0) from public.gastos g
        where g.turno_id = v_turno.id and not g.anulado)                         as gastos
    from public.ventas v
    join public.venta_pagos p on p.venta_id = v.id
    where v.turno_id = v_turno.id and not v.anulada
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

grant execute on function public.cerrar_turno(bigint, text) to authenticated;

-- Turno donde se trabaja: abierto, bloqueado para que no se cierre en el medio. Uso interno. ---------
-- p_para_actualizar: for update (gastos: serializa el cálculo del cajón) o for share (ventas).

create function public._turno_para_trabajar(p_turno_id bigint, p_para_actualizar boolean)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos;
begin
  if p_turno_id is null then
    raise exception 'Elegí la caja en la que estás trabajando' using errcode = '22023';
  end if;
  if p_para_actualizar then
    select * into v_turno from public.turnos where id = p_turno_id for update;
  else
    select * into v_turno from public.turnos where id = p_turno_id for share;
  end if;
  if v_turno.id is null then
    raise exception 'El turno elegido no existe' using errcode = '22023';
  end if;
  -- Se mira después del bloqueo: si un cierre terminó mientras se esperaba, ya se ve cerrado.
  if v_turno.cerrado_en is not null then
    raise exception 'El turno de la caja "%" ya se cerró: elegí una caja abierta',
      (select c.nombre from public.cajas c where c.id = v_turno.caja_id)
      using errcode = 'P0001';
  end if;
  return v_turno;
end;
$$;

revoke execute on function public._turno_para_trabajar(bigint, boolean) from public, anon, authenticated;

-- ¿El turno está abierto? -----------------------------------------------------------------------------
-- La RLS de `turnos` es solo del admin, así que las políticas del cajero (ventas, gastos, comprobantes)
-- no pueden preguntarlo con un `exists` sobre `turnos`: lo preguntan acá. Devuelve solo sí/no (que el
-- turno exista y siga abierto; false si es NULL, como las ventas pasadas o los gastos del admin sin
-- turno), nada de su dinero. No llama a `_exigir_usuario()` porque se evalúa dentro de las políticas:
-- un usuario desactivado tiene que leer 0 filas, no un error; las políticas ya piden `rol_actual()`.

create function public.turno_abierto(p_turno_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.turnos t where t.id = p_turno_id and t.cerrado_en is null);
$$;

revoke execute on function public.turno_abierto(bigint) from public, anon;
grant execute on function public.turno_abierto(bigint) to authenticated;

-- Registrar venta: + turno explícito (primer parámetro, obligatorio). Una sola sobrecarga. ---------

drop function public.registrar_venta(bigint, public.medio_pago, text, jsonb, bigint, numeric);

create function public.registrar_venta(
  p_turno_id        bigint,
  p_servicio_id     bigint,
  p_medio_pago      public.medio_pago default null,
  p_patente         text default null,
  p_pagos           jsonb default null,
  p_descuento_id    bigint default null,
  p_precio_esperado numeric default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno      public.turnos;
  v_servicio   public.servicios;
  v_descuento  public.descuentos;
  v_monto_desc numeric(12,2) := 0;
  v_precio     numeric(12,2);
  v_cert       public.certificados;
  v_cert_id    bigint;
  v_venta      public.ventas;
  v_pagos      jsonb;
  v_suma       numeric;
  v_patente    text := nullif(upper(regexp_replace(coalesce(p_patente, ''), '\s', '', 'g')), '');
begin
  perform public._exigir_usuario();

  if p_medio_pago is not null and p_pagos is not null then
    raise exception 'Elegí un medio de pago o un pago mixto, no los dos' using errcode = '22023';
  end if;
  if p_medio_pago is null and p_pagos is null then
    raise exception 'Elegí un medio de pago' using errcode = '22023';
  end if;
  if p_pagos is not null then
    v_pagos := public._validar_pagos_mixtos(p_pagos);
  end if;
  -- $ 0 exacto se acepta (servicio sin cargo); cualquier otro valor tiene que ser un monto válido.
  if p_precio_esperado is not null and p_precio_esperado <> 0 then
    perform public._validar_monto(p_precio_esperado, 'El precio esperado');
  end if;

  -- for share: varias ventas a la vez en la misma caja; serializa con cerrar_turno.
  v_turno := public._turno_para_trabajar(p_turno_id, false);

  select * into v_servicio from public.servicios where id = p_servicio_id;
  if v_servicio.id is null or not v_servicio.activo then
    raise exception 'El servicio no existe o está desactivado' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categorias_servicio
                 where id = v_servicio.categoria_id and activa) then
    raise exception 'La categoría de este servicio está desactivada' using errcode = '22023';
  end if;

  v_precio := v_servicio.precio;

  if p_descuento_id is not null then
    -- for share: la foto no se mezcla con una edición simultánea del descuento.
    select * into v_descuento from public.descuentos where id = p_descuento_id for share;
    if v_descuento.id is null or not v_descuento.activo then
      raise exception 'El descuento no existe o está desactivado' using errcode = '22023';
    end if;
    if not exists (select 1 from public.descuento_servicios
                   where descuento_id = v_descuento.id and servicio_id = v_servicio.id) then
      raise exception 'El descuento "%" no está habilitado para "%"', v_descuento.nombre, v_servicio.nombre
        using errcode = '22023';
    end if;
    v_monto_desc := public._monto_descuento(v_descuento.tipo, v_descuento.valor, v_servicio.precio);
    v_precio := v_servicio.precio - v_monto_desc;
    if v_monto_desc <= 0 then
      raise exception 'El descuento "%" no descuenta nada sobre el precio de "%"', v_descuento.nombre, v_servicio.nombre
        using errcode = 'P0001';
    end if;
    if v_precio <= 0 then
      raise exception 'Con el descuento "%" el precio de "%" queda en $ %: tiene que ser mayor a cero',
        v_descuento.nombre, v_servicio.nombre, public._pesos(greatest(v_precio, 0))
        using errcode = 'P0001';
    end if;
  end if;

  if p_precio_esperado is not null and p_precio_esperado <> v_precio then
    raise exception 'El precio cambió: ahora es $ %. Revisá la venta.', public._pesos(v_precio)
      using errcode = 'P0001';
  end if;

  if v_pagos is not null then
    select sum((x ->> 'monto')::numeric) into v_suma from jsonb_array_elements(v_pagos) x;
    if v_suma <> v_precio then
      raise exception 'Las partes del pago suman $ % y el precio es $ %: tienen que coincidir',
        public._pesos(v_suma), public._pesos(v_precio)
        using errcode = '22023';
    end if;
  end if;

  -- usuario_id = quien vende (no el turno: el turno es de la caja).
  insert into public.ventas
    (turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id,
     precio, medio_pago, patente,
     precio_lista, monto_descuento, descuento_id, descuento_nombre, descuento_tipo, descuento_valor)
  values
    (v_turno.id, v_turno.caja_id, auth.uid(), v_servicio.id, v_servicio.nombre, v_servicio.categoria_id,
     v_precio, p_medio_pago, v_patente,
     v_servicio.precio, v_monto_desc, v_descuento.id, v_descuento.nombre, v_descuento.tipo, v_descuento.valor)
  returning * into v_venta;

  if v_pagos is null then
    insert into public.venta_pagos (venta_id, medio, monto)
    values (v_venta.id, p_medio_pago, v_venta.precio);
  else
    insert into public.venta_pagos (venta_id, medio, monto)
    select v_venta.id, (x ->> 'medio')::public.medio_pago, (x ->> 'monto')::numeric
    from jsonb_array_elements(v_pagos) x;
  end if;

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

  -- La parte en efectivo queda en el cajón de la caja hasta el cierre del turno.
  return v_venta;
end;
$$;

grant execute on function public.registrar_venta(bigint, bigint, public.medio_pago, text, jsonb, bigint, numeric)
  to authenticated;

-- Registrar gasto: el turno reemplaza a p_del_turno. ------------------------------------------------
-- p_turno_id: turno abierto de la caja donde se trabaja; el gasto se paga con ese cajón. Obligatorio
-- para el cajero. El admin sin turno paga con la caja de cambio y el gasto no queda en ningún turno.

drop function public.registrar_gasto(bigint, numeric, public.fuente_fondos, text, boolean);

create function public.registrar_gasto(
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

  if v_rol = 'cajero' or p_turno_id is not null then
    -- for update: serializa con cerrar_turno, anulaciones, ventas y otros gastos del mismo cajón.
    v_turno := public._turno_para_trabajar(p_turno_id, true);
  end if;

  return public._insertar_gasto(p_categoria_id, p_monto, p_fuente, p_nota, v_turno.id);
end;
$$;

grant execute on function public.registrar_gasto(bigint, numeric, public.fuente_fondos, text, bigint)
  to authenticated;

-- Facturación: el cajero, cualquier venta de un turno abierto. --------------------------------------
-- Como cualquier cajero puede corregir la factura pendiente de una venta ajena, la corrección deja
-- rastro: `actualizado_por` = quién cambió por última vez los datos del cliente (NULL si nadie los
-- corrigió desde que se creó; `creado_por` es quien la preparó). `actualizado_en` (migración 23) es el
-- último cambio de cualquier tipo, también los de la emisión. `authenticated` y `service_role` leen
-- la tabla entera (migraciones 23 y 28): la columna nueva queda legible sin otro grant.

alter table public.comprobantes
  add column actualizado_por uuid references public.perfiles (id);

comment on column public.comprobantes.actualizado_por is
  'Último usuario que corrigió los datos del cliente con preparar_factura (NULL: nadie desde que se creó).';

create or replace function public.preparar_factura(
  p_venta_id bigint,
  p_condicion_iva_id integer,
  p_doc_tipo smallint,
  p_doc_nro bigint,
  p_receptor_nombre text default null
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := public._exigir_usuario();
  v_config    public.arca_configuracion := public._arca_config_lista();
  v_venta     public.ventas;
  v_condicion public.arca_condiciones_iva;
  v_actual    public.comprobantes;
  v_clase     text;
  v_nombre    text := nullif(regexp_replace(btrim(p_receptor_nombre), '\s+', ' ', 'g'), '');
  v_importes  record;
  v_resultado public.comprobantes;
begin
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe' using errcode = '22023';
  end if;
  if v_rol <> 'admin' and not public.turno_abierto(v_venta.turno_id) then
    raise exception 'Solo podés facturar ventas de una caja con el turno abierto' using errcode = '42501';
  end if;
  if v_venta.anulada then
    raise exception 'La venta está anulada: no se puede facturar' using errcode = 'P0001';
  end if;
  if v_venta.precio <= 0 then
    raise exception 'Una venta de $ 0 no se factura' using errcode = 'P0001';
  end if;

  select * into v_condicion from public.arca_condiciones_iva where id = p_condicion_iva_id;
  if v_condicion.id is null then
    raise exception 'Elegí una condición frente al IVA válida' using errcode = '22023';
  end if;
  -- Clase según ARCA: B si la condición la admite (consumidor final, exento…); si no, A.
  v_clase := case
    when 'B' = any (v_condicion.clases) then 'B'
    when 'A' = any (v_condicion.clases) then 'A'
  end;
  if v_clase is null then
    raise exception 'A un receptor "%" no se le puede emitir Factura A ni B', v_condicion.descripcion
      using errcode = 'P0001';
  end if;

  -- Documento del receptor.
  if p_doc_tipo is null or p_doc_tipo not in (80, 96, 99) then
    raise exception 'Elegí el tipo de documento del cliente' using errcode = '22023';
  end if;
  if v_clase = 'A' and p_doc_tipo <> 80 then
    raise exception 'La Factura A requiere el CUIT del cliente' using errcode = 'P0001';
  end if;
  if p_doc_tipo = 99 then
    -- Sin identificar (DocTipo 99) solo el consumidor final: condición 5 según la tabla de
    -- "Condición frente al IVA del receptor" del manual WSFEv1.
    if v_condicion.id <> 5 then
      raise exception 'Para un cliente "%" ingresá su CUIT o DNI', v_condicion.descripcion
        using errcode = 'P0001';
    end if;
    if v_venta.precio >= v_config.tope_identificacion then
      raise exception 'Desde $ % hay que identificar al consumidor final con CUIT o DNI',
        translate(to_char(v_config.tope_identificacion, 'FM999,999,999,990.00'), ',.', '.,') using errcode = 'P0001';
    end if;
    p_doc_nro := 0;
    v_nombre := null;
  else
    if p_doc_tipo = 80 and (p_doc_nro is null or not public.cuit_valido(lpad(p_doc_nro::text, 11, '0'))) then
      raise exception 'El CUIT del cliente no es válido' using errcode = '22023';
    end if;
    if p_doc_tipo = 96 and (p_doc_nro is null or p_doc_nro not between 1000000 and 99999999) then
      raise exception 'El DNI del cliente no es válido' using errcode = '22023';
    end if;
    if v_nombre is null then
      raise exception 'Ingresá el nombre o la razón social del cliente' using errcode = '22023';
    end if;
    if char_length(v_nombre) > 200 then
      raise exception 'El nombre del cliente no puede superar los 200 caracteres' using errcode = '22023';
    end if;
  end if;

  select * into v_actual from public.comprobantes
  where venta_id = p_venta_id and tipo = 'factura' for update;
  if v_actual.estado = 'autorizado' then
    raise exception 'La venta ya está facturada (Factura % %-%)', v_actual.clase,
      lpad(v_actual.punto_venta::text, 5, '0'), lpad(v_actual.numero::text, 8, '0')
      using errcode = 'P0001';
  end if;
  if v_actual.estado = 'procesando' or v_actual.numero_intentado is not null then
    raise exception 'La factura de esta venta ya se envió a ARCA y falta confirmar el resultado: reintentá la emisión'
      using errcode = 'P0001';
  end if;

  select * into v_importes from public._neto_iva(v_venta.precio);

  if v_actual.id is null then
    insert into public.comprobantes (
      venta_id, tipo, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta, fecha_servicio,
      doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor_id, neto, iva, total, creado_por)
    values (
      v_venta.id, 'factura', v_clase, case v_clase when 'A' then 1 else 6 end,
      v_config.ambiente, v_config.cuit, v_config.punto_venta, public.fecha_local(v_venta.creado_en),
      p_doc_tipo, p_doc_nro, v_nombre, v_condicion.id, v_importes.neto, v_importes.iva,
      v_venta.precio, auth.uid())
    returning * into v_resultado;
  else
    -- Pendiente o rechazada y nunca enviada: se corrigen los datos del cliente.
    update public.comprobantes set
      clase = v_clase, cbte_tipo = case v_clase when 'A' then 1 else 6 end,
      ambiente = v_config.ambiente, cuit_emisor = v_config.cuit, punto_venta = v_config.punto_venta,
      doc_tipo = p_doc_tipo, doc_nro = p_doc_nro, receptor_nombre = v_nombre,
      condicion_iva_receptor_id = v_condicion.id, estado = 'pendiente', mensaje = null,
      actualizado_en = now(), actualizado_por = auth.uid()
    where id = v_actual.id
    returning * into v_resultado;
  end if;
  return v_resultado;
end;
$$;

create or replace function public.puede_emitir_comprobante(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol  public.rol_usuario := public._exigir_usuario();
  v_comp public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_rol <> 'admin' then
    if v_comp.tipo = 'nota_credito' then
      raise exception 'Solo un administrador puede emitir notas de crédito' using errcode = '42501';
    end if;
    if not public.turno_abierto((select v.turno_id from public.ventas v where v.id = v_comp.venta_id)) then
      raise exception 'Solo podés facturar ventas de una caja con el turno abierto' using errcode = '42501';
    end if;
  end if;
  if v_comp.estado = 'autorizado' then
    raise exception 'El comprobante ya está autorizado' using errcode = 'P0001';
  end if;
  if v_comp.estado = 'cancelado' then
    raise exception 'El comprobante está cancelado (la venta se anuló)' using errcode = 'P0001';
  end if;
  -- El cajero no reintenta en ráfaga.
  if v_rol <> 'admin' and v_comp.tomado_en > now() - interval '5 seconds' then
    raise exception 'Esperá unos segundos antes de volver a intentar' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- RLS: turnos solo admin; el cajero lee lo que pasó en los turnos abiertos. --------------------------
-- El cajero no lee filas de `turnos` (efectivo inicial, efectivo del cierre, observaciones, totales,
-- quién abrió) ni, por lo tanto, de `v_turnos`. Para elegir la caja usa `v_turnos_abiertos`.

drop policy "turnos propios o admin" on public.turnos;
create policy "admin lee los turnos" on public.turnos
  for select to authenticated
  using ((select public.es_admin()));

drop policy "ventas propias o admin" on public.ventas;
create policy "ventas de turnos abiertos o admin" on public.ventas
  for select to authenticated
  using ((select public.es_admin())
         or ((select public.rol_actual()) is not null and public.turno_abierto(ventas.turno_id)));

-- Reemplaza a la de la migración 30 (que delegaba en la RLS de ventas): misma visibilidad, explícita.
drop policy "pagos de ventas visibles" on public.venta_pagos;
create policy "pagos de ventas de turnos abiertos o admin" on public.venta_pagos
  for select to authenticated
  using ((select public.es_admin())
         or ((select public.rol_actual()) is not null
             and public.turno_abierto((select v.turno_id from public.ventas v
                                       where v.id = venta_pagos.venta_id))));

drop policy "gastos propios o admin" on public.gastos;
create policy "gastos de turnos abiertos o admin" on public.gastos
  for select to authenticated
  using ((select public.es_admin())
         or ((select public.rol_actual()) is not null and public.turno_abierto(gastos.turno_id)));

drop policy "comprobantes de ventas propias o admin" on public.comprobantes;
create policy "comprobantes de turnos abiertos o admin" on public.comprobantes
  for select to authenticated
  using ((select public.es_admin())
         or ((select public.rol_actual()) is not null
             and public.turno_abierto((select v.turno_id from public.ventas v
                                       where v.id = comprobantes.venta_id))));

-- Nombre de quien hizo un movimiento ----------------------------------------------------------------
-- El cajero solo lee su propio perfil (y no debe leer el email ni el rol de los demás), pero en el
-- historial de la caja tiene que ver quién hizo cada venta o gasto. Devuelve solo el nombre completo:
-- el admin, de cualquiera; los demás, el propio y el de quien vendió o gastó en un turno abierto.

create function public.nombre_usuario(p_usuario_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return (
    select p.nombre_completo
    from public.perfiles p
    where p.id = p_usuario_id
      and (public.es_admin()
           or p.id = auth.uid()
           or exists (select 1 from public.turnos t join public.ventas v on v.turno_id = t.id
                      where t.cerrado_en is null and v.usuario_id = p.id)
           or exists (select 1 from public.turnos t join public.gastos g on g.turno_id = t.id
                      where t.cerrado_en is null and g.usuario_id = p.id))
  -- security definer: lee `turnos` sin su RLS (solo admin); devuelve un nombre, nunca datos del turno.
  );
end;
$$;

grant execute on function public.nombre_usuario(uuid) to authenticated;

-- Vistas -------------------------------------------------------------------------------------------

-- v_movimientos_caja: mismas columnas; `usuario_nombre` = quién hizo el movimiento, también para el
-- cajero cuando lo hizo un compañero (el join a perfiles solo le devuelve su propio perfil).
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
  v.precio_lista
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
  null::numeric(12,2) as precio_lista
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

-- v_turnos: sin "cajero del turno": `atendido_por` = quienes
-- vendieron o gastaron en el turno (más el cajero asignado de los turnos anteriores a esta
-- migración), y `abierto_por` / `abierto_por_nombre` = el admin que lo abrió. Solo admin: la RLS de
-- `turnos` le devuelve 0 filas a cualquier otro.
drop view public.v_turnos;

create view public.v_turnos
with (security_invoker = true) as
select
  t.id,
  t.caja_id,
  t.abierto_en,
  t.cerrado_en,
  t.observaciones,
  t.cantidad_ventas,
  t.total_efectivo,
  t.total_transferencia,
  t.total_tarjeta,
  t.total_gastos,
  c.nombre as caja_nombre,
  t.cerrado_en is null as abierto,
  coalesce(v.cantidad, 0::bigint) as ventas_cantidad,
  coalesce(vp.efectivo, 0::numeric)::numeric(14,2) as ventas_efectivo,
  coalesce(vp.transferencia, 0::numeric)::numeric(14,2) as ventas_transferencia,
  coalesce(vp.tarjeta, 0::numeric)::numeric(14,2) as ventas_tarjeta,
  coalesce(v.total, 0::numeric)::numeric(14,2) as ventas_total,
  coalesce(g.total, 0::numeric)::numeric(14,2) as gastos_total,
  (coalesce(v.total, 0::numeric) - coalesce(g.total, 0::numeric))::numeric(14,2) as neto,
  t.efectivo_inicial,
  coalesce(g.efectivo, 0::numeric)::numeric(14,2) as gastos_efectivo,
  (case
     when t.cerrado_en is null
       then coalesce(t.efectivo_inicial, 0) + coalesce(vp.efectivo, 0) - coalesce(g.efectivo, 0)
     else t.efectivo_cierre
   end)::numeric(14,2) as efectivo_en_caja,
  t.efectivo_cierre,
  t.abierto_por,
  ap.nombre_completo as abierto_por_nombre,
  coalesce(a.nombres, '{}'::text[]) as atendido_por
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles ap on ap.id = t.abierto_por
left join lateral (
  select count(*) as cantidad,
         sum(ventas.precio) as total
  from public.ventas
  where ventas.turno_id = t.id and not ventas.anulada
) v on true
left join lateral (
  select sum(pg.monto) filter (where pg.medio = 'efectivo') as efectivo,
         sum(pg.monto) filter (where pg.medio = 'transferencia') as transferencia,
         sum(pg.monto) filter (where pg.medio = 'tarjeta') as tarjeta
  from public.ventas
  join public.venta_pagos pg on pg.venta_id = ventas.id
  where ventas.turno_id = t.id and not ventas.anulada
) vp on true
left join lateral (
  select sum(gastos.monto) as total,
         sum(gastos.monto) filter (where gastos.fuente = 'efectivo') as efectivo
  from public.gastos
  where gastos.turno_id = t.id and not gastos.anulado
) g on true
left join lateral (
  select array_agg(pp.nombre_completo order by pp.nombre_completo) as nombres
  from public.perfiles pp
  where pp.id = t.usuario_id
     or exists (select 1 from public.ventas vv where vv.turno_id = t.id and vv.usuario_id = pp.id)
     or exists (select 1 from public.gastos gg where gg.turno_id = t.id and gg.usuario_id = pp.id)
) a on true;

grant select on public.v_turnos to authenticated;

-- Turnos abiertos para elegir la caja donde trabajar: sin dinero. Como la RLS de `turnos` es solo del
-- admin, la lectura pasa por una función security definer que devuelve únicamente estas cuatro
-- columnas; la vista (security_invoker, como todas) la envuelve para que el cliente siga consultando
-- `v_turnos_abiertos`. Un usuario desactivado recibe el error de `_exigir_usuario()`.
create function public.turnos_abiertos()
returns table (id bigint, caja_id bigint, caja_nombre text, abierto_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return query
  select t.id, t.caja_id, c.nombre, t.abierto_en
  from public.turnos t
  join public.cajas c on c.id = t.caja_id
  where t.cerrado_en is null
  order by c.nombre;
end;
$$;

revoke execute on function public.turnos_abiertos() from public, anon;
grant execute on function public.turnos_abiertos() to authenticated;

create view public.v_turnos_abiertos
with (security_invoker = true) as
select ta.id, ta.caja_id, ta.caja_nombre, ta.abierto_en
from public.turnos_abiertos() ta;

grant select on public.v_turnos_abiertos to authenticated;

-- v_comprobantes: + quién corrigió por última vez los datos del cliente y cuándo cambió (al final:
-- create or replace solo permite agregar columnas al final). `arca` (service_role) la lee entera.
create or replace view public.v_comprobantes
with (security_invoker = true)
as
select
  c.id, c.venta_id, v.turno_id, c.tipo, c.asociado_id, c.clase, c.cbte_tipo, c.ambiente,
  c.cuit_emisor, c.punto_venta, c.numero, c.estado, c.fecha, c.fecha_servicio, c.doc_tipo,
  c.doc_nro, c.receptor_nombre, c.condicion_iva_receptor_id, ci.descripcion as condicion_iva_receptor,
  c.neto, c.iva, c.total, c.cae, c.cae_vencimiento, c.mensaje, c.intentos,
  (c.numero_intentado is not null) as a_reconciliar, c.creado_en, c.autorizado_en,
  v.servicio_nombre, v.patente,
  a.cbte_tipo as asociado_cbte_tipo, a.punto_venta as asociado_punto_venta,
  a.numero as asociado_numero, a.fecha as asociado_fecha,
  case when c.estado = 'autorizado' then
    'https://www.arca.gob.ar/fe/qr/?p=' || replace(encode(convert_to(jsonb_build_object(
      'ver', 1,
      'fecha', to_char(c.fecha, 'YYYY-MM-DD'),
      'cuit', c.cuit_emisor::bigint,
      'ptoVta', c.punto_venta,
      'tipoCmp', c.cbte_tipo,
      'nroCmp', c.numero,
      'importe', c.total,
      'moneda', 'PES',
      'ctz', 1,
      'tipoDocRec', c.doc_tipo,
      'nroDocRec', c.doc_nro,
      'tipoCodAut', 'E',
      'codAut', c.cae::bigint
    )::text, 'UTF8'), 'base64'), E'\n', '')
  end as qr_url,
  c.emisor_razon_social, c.emisor_domicilio, c.emisor_iibb, c.emisor_inicio_actividades,
  c.creado_por, c.actualizado_por, c.actualizado_en
from public.comprobantes c
join public.ventas v on v.id = c.venta_id
join public.arca_condiciones_iva ci on ci.id = c.condicion_iva_receptor_id
left join public.comprobantes a on a.id = c.asociado_id;

-- Cajas para abrir turno (admin): libre u ocupada, sin persona. ------------------------------------

drop function public.cajas_para_turno();

create function public.cajas_para_turno()
returns table (id bigint, nombre text, ocupada boolean, turno_id bigint, abierto_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();

  return query
  select c.id, c.nombre, t.id is not null, t.id, t.abierto_en
  from public.cajas c
  left join public.turnos t on t.caja_id = c.id and t.cerrado_en is null
  where c.activa
  order by c.nombre;
end;
$$;

grant execute on function public.cajas_para_turno() to authenticated;
