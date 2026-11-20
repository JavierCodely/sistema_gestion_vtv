-- Endurecimiento de seguridad (auditoría 2026-11-20).
-- 1. Montos: rechazar NaN, ceros/negativos, más de 2 decimales y valores fuera de rango
--    en todas las RPC con dinero, y CHECK <> 'NaN' en todas las columnas de dinero.
--    (Postgres acepta 'NaN' en numeric y lo considera mayor que cualquier número.)
-- 2. Último admin: serializar el chequeo con un advisory lock (carrera entre transacciones).
-- 3. Ventas/gastos: bloquear el turno (for share) para no registrar en un turno que se está cerrando.
-- 4. certificado_para_servicio exige usuario activo.
-- 5. Largo máximo de textos libres.

-- Valida un monto positivo en pesos. Uso interno.
create function public._validar_monto(p_monto numeric, p_campo text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_monto is null or p_monto = 'NaN'::numeric then
    raise exception '% no es válido', p_campo using errcode = '22023';
  end if;
  if p_monto <= 0 then
    raise exception '% debe ser mayor a cero', p_campo using errcode = '22023';
  end if;
  if p_monto <> round(p_monto, 2) then
    raise exception '% no puede tener más de 2 decimales', p_campo using errcode = '22023';
  end if;
  if p_monto > 9999999999.99 then
    raise exception '% es demasiado grande', p_campo using errcode = '22023';
  end if;
end;
$$;

create or replace function public._mover_efectivo(
  p_tipo     public.tipo_mov_efectivo,
  p_monto    numeric,
  p_nota     text default null,
  p_turno_id bigint default null,
  p_venta_id bigint default null,
  p_gasto_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo numeric(12,2);
  v_id    bigint;
begin
  perform public._validar_monto(abs(p_monto), 'El monto');

  select saldo into v_saldo from public.caja_efectivo where id = 1 for update;

  if v_saldo + p_monto < 0 then
    raise exception 'No hay suficiente efectivo en la caja de cambio (disponible: $%, necesario: $%)',
      to_char(v_saldo, 'FM999G999G990D00'), to_char(-p_monto, 'FM999G999G990D00')
      using errcode = 'P0001';
  end if;

  v_saldo := v_saldo + p_monto;
  update public.caja_efectivo set saldo = v_saldo, actualizado_en = now() where id = 1;

  insert into public.movimientos_efectivo
    (tipo, monto, saldo_resultante, nota, usuario_id, turno_id, venta_id, gasto_id)
  values
    (p_tipo, p_monto, v_saldo, p_nota, auth.uid(), p_turno_id, p_venta_id, p_gasto_id)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.movimiento_efectivo(
  p_tipo  public.tipo_mov_efectivo,
  p_monto numeric,
  p_nota  text
)
returns public.movimientos_efectivo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  bigint;
  v_mov public.movimientos_efectivo;
begin
  perform public._exigir_admin();

  if p_tipo not in ('fondo_inicial', 'ingreso', 'retiro') then
    raise exception 'Tipo de movimiento no permitido: %', p_tipo using errcode = '22023';
  end if;
  perform public._validar_monto(p_monto, 'El monto');

  v_id := public._mover_efectivo(
    p_tipo,
    case when p_tipo = 'retiro' then -p_monto else p_monto end,
    public._texto_obligatorio(p_nota, 'La nota es obligatoria')
  );

  select * into v_mov from public.movimientos_efectivo where id = v_id;
  return v_mov;
end;
$$;

create or replace function public._insertar_gasto(
  p_categoria_id bigint,
  p_monto        numeric,
  p_fuente       public.fuente_fondos,
  p_nota         text
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

  select * into v_turno
  from public.turnos
  where usuario_id = auth.uid() and cerrado_en is null
  for share;  -- serializa con cerrar_turno

  insert into public.gastos (categoria_id, monto, fuente, nota, usuario_id, turno_id, caja_id)
  values (p_categoria_id, p_monto, p_fuente, public._texto_obligatorio(p_nota, 'La nota es obligatoria'),
          auth.uid(), v_turno.id, v_turno.caja_id)
  returning * into v_gasto;

  if p_fuente = 'efectivo' then
    perform public._mover_efectivo('gasto', -p_monto, v_gasto.nota, v_turno.id, null, v_gasto.id);
  end if;

  return v_gasto;
end;
$$;

create or replace function public.registrar_compra_certificado(
  p_certificado_id bigint,
  p_unidades       integer,
  p_costo_unidad   numeric,
  p_fuente         public.fuente_fondos,
  p_proveedor      text default null
)
returns public.compras_certificado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cert      public.certificados;
  v_hojas     integer;
  v_total     numeric(12,2);
  v_costo_h   numeric(14,4);
  v_promedio  numeric(14,4);
  v_gasto     public.gastos;
  v_compra    public.compras_certificado;
  v_cat_id    bigint;
  v_proveedor text := nullif(btrim(p_proveedor), '');
begin
  perform public._exigir_admin();

  if p_unidades is null or p_unidades <= 0 or p_unidades > 100000 then
    raise exception 'La cantidad debe ser entre 1 y 100.000' using errcode = '22023';
  end if;
  perform public._validar_monto(p_costo_unidad, 'El costo por unidad');

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if v_cert.id is null then
    raise exception 'El certificado no existe' using errcode = '22023';
  end if;

  v_hojas    := p_unidades * v_cert.hojas_por_unidad;
  v_total    := p_unidades * p_costo_unidad;
  v_costo_h  := v_total / v_hojas;
  v_promedio := (v_cert.stock_hojas * v_cert.costo_promedio + v_total) / (v_cert.stock_hojas + v_hojas);

  select id into v_cat_id from public.categorias_gasto where sistema = 'compra_certificados';

  v_gasto := public._insertar_gasto(
    v_cat_id, v_total, p_fuente,
    format('Compra de %s %s de %s (%s hojas)%s',
      p_unidades,
      v_cert.unidad_compra::text || case
        when p_unidades = 1 then ''
        when v_cert.unidad_compra = 'unidad' then 'es'
        else 's' end,
      v_cert.nombre, v_hojas,
      coalesce(' — ' || v_proveedor, ''))
  );

  insert into public.compras_certificado
    (certificado_id, unidades, costo_unidad, hojas, costo_total, costo_hoja,
     fuente, proveedor, gasto_id, usuario_id)
  values
    (v_cert.id, p_unidades, p_costo_unidad, v_hojas, v_total, v_costo_h,
     p_fuente, v_proveedor, v_gasto.id, auth.uid())
  returning * into v_compra;

  update public.certificados
  set stock_hojas = stock_hojas + v_hojas, costo_promedio = v_promedio
  where id = v_cert.id;

  insert into public.movimientos_certificado
    (certificado_id, tipo, hojas, costo_unitario, costo_total,
     stock_resultante, costo_promedio_resultante, compra_id, nota, usuario_id)
  values
    (v_cert.id, 'compra', v_hojas, v_costo_h, v_total,
     v_cert.stock_hojas + v_hojas, v_promedio, v_compra.id, v_proveedor, auth.uid());

  return v_compra;
end;
$$;

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

  if p_medio_pago = 'efectivo' and v_venta.precio > 0 then
    perform public._mover_efectivo('venta', v_venta.precio, 'Venta #' || v_venta.id,
                                   v_turno.id, v_venta.id, null);
  end if;

  return v_venta;
end;
$$;

create or replace function public.tg_proteger_ultimo_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serializa los cambios sobre admins: sin esto, dos transacciones concurrentes
  -- podrían desactivar a los dos últimos admins a la vez.
  if old.rol = 'admin' and old.activo then
    perform pg_advisory_xact_lock(hashtext('public.perfiles:admins'));
  end if;

  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and not exists (
       select 1 from public.perfiles p
       where p.rol = 'admin' and p.activo and p.id <> old.id
     )
  then
    raise exception 'Debe quedar al menos un administrador activo' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.certificado_para_servicio(p_servicio_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform public._exigir_usuario();

  select c.id into v_id
  from public.servicios s
  join public.certificados c
    on c.activo
   and (   (c.alcance = 'servicio'  and c.servicio_id  = s.id)
        or (c.alcance = 'categoria' and c.categoria_id = s.categoria_id)
        or  c.alcance = 'global')
  where s.id = p_servicio_id
    and s.requiere_certificado
  order by case c.alcance when 'servicio' then 1 when 'categoria' then 2 else 3 end
  limit 1;

  return v_id;
end;
$$;

-- Ninguna columna de dinero puede valer NaN.
alter table public.caja_efectivo add constraint caja_efectivo_saldo_no_nan check (saldo <> 'NaN'::numeric);
alter table public.movimientos_efectivo add constraint movimientos_efectivo_monto_no_nan check (monto <> 'NaN'::numeric);
alter table public.movimientos_efectivo add constraint movimientos_efectivo_saldo_resultante_no_nan check (saldo_resultante <> 'NaN'::numeric);
alter table public.gastos add constraint gastos_monto_no_nan check (monto <> 'NaN'::numeric);
alter table public.servicios add constraint servicios_precio_no_nan check (precio <> 'NaN'::numeric);
alter table public.ventas add constraint ventas_precio_no_nan check (precio <> 'NaN'::numeric);
alter table public.ventas add constraint ventas_costo_certificado_no_nan check (costo_certificado <> 'NaN'::numeric);
alter table public.compras_certificado add constraint compras_certificado_costo_unidad_no_nan check (costo_unidad <> 'NaN'::numeric);
alter table public.compras_certificado add constraint compras_certificado_costo_total_no_nan check (costo_total <> 'NaN'::numeric);
alter table public.compras_certificado add constraint compras_certificado_costo_hoja_no_nan check (costo_hoja <> 'NaN'::numeric);
alter table public.certificados add constraint certificados_costo_promedio_no_nan check (costo_promedio <> 'NaN'::numeric);
alter table public.movimientos_certificado add constraint movimientos_certificado_costo_unitario_no_nan check (costo_unitario <> 'NaN'::numeric);
alter table public.movimientos_certificado add constraint movimientos_certificado_costo_total_no_nan check (costo_total <> 'NaN'::numeric);
alter table public.movimientos_certificado add constraint movimientos_certificado_costo_promedio_resultante_no_nan check (costo_promedio_resultante <> 'NaN'::numeric);
alter table public.turnos add constraint turnos_total_efectivo_no_nan check (total_efectivo <> 'NaN'::numeric);
alter table public.turnos add constraint turnos_total_transferencia_no_nan check (total_transferencia <> 'NaN'::numeric);
alter table public.turnos add constraint turnos_total_tarjeta_no_nan check (total_tarjeta <> 'NaN'::numeric);
alter table public.turnos add constraint turnos_total_gastos_no_nan check (total_gastos <> 'NaN'::numeric);

-- Largo máximo de textos libres (la UI usa los mismos límites en maxLength).
alter table public.perfiles add constraint perfiles_nombre_largo check (char_length(nombre) <= 100);
alter table public.perfiles add constraint perfiles_email_largo check (char_length(email) <= 254);
alter table public.cajas add constraint cajas_nombre_largo check (char_length(nombre) <= 100);
alter table public.categorias_servicio add constraint categorias_servicio_nombre_largo check (char_length(nombre) <= 100);
alter table public.servicios add constraint servicios_nombre_largo check (char_length(nombre) <= 100);
alter table public.certificados add constraint certificados_nombre_largo check (char_length(nombre) <= 100);
alter table public.categorias_gasto add constraint categorias_gasto_nombre_largo check (char_length(nombre) <= 100);
alter table public.turnos add constraint turnos_observaciones_largo check (char_length(observaciones) <= 1000);
alter table public.ventas add constraint ventas_patente_largo check (char_length(patente) <= 10);
alter table public.ventas add constraint ventas_servicio_nombre_largo check (char_length(servicio_nombre) <= 100);
alter table public.ventas add constraint ventas_anulada_motivo_largo check (char_length(anulada_motivo) <= 500);
alter table public.gastos add constraint gastos_nota_largo check (char_length(nota) <= 500);
alter table public.gastos add constraint gastos_anulado_motivo_largo check (char_length(anulado_motivo) <= 500);
alter table public.compras_certificado add constraint compras_certificado_proveedor_largo check (char_length(proveedor) <= 200);
alter table public.movimientos_certificado add constraint movimientos_certificado_nota_largo check (char_length(nota) <= 500);
alter table public.movimientos_efectivo add constraint movimientos_efectivo_nota_largo check (char_length(nota) <= 600);
