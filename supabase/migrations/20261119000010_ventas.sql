-- Ventas. Cada venta de un servicio que requiere certificado consume 1 hoja
-- del certificado más específico, valuada al costo promedio vigente.
-- Si no hay stock (o no hay certificado configurado) la venta se registra igual,
-- con sin_stock = true, y se genera una alerta para el administrador.

create table public.ventas (
  id                bigint generated always as identity primary key, -- = número de venta
  turno_id          bigint not null references public.turnos (id),
  caja_id           bigint not null references public.cajas (id),
  usuario_id        uuid not null references public.perfiles (id),
  servicio_id       bigint not null references public.servicios (id),
  servicio_nombre   text not null,
  categoria_id      bigint not null references public.categorias_servicio (id),
  precio            numeric(12,2) not null check (precio >= 0),
  medio_pago        public.medio_pago not null,
  patente           text,
  certificado_id    bigint references public.certificados (id),
  costo_certificado numeric(14,4) not null default 0 check (costo_certificado >= 0),
  sin_stock         boolean not null default false,
  anulada           boolean not null default false,
  anulada_motivo    text,
  anulada_por       uuid references public.perfiles (id),
  anulada_en        timestamptz,
  creado_en         timestamptz not null default now(),
  check (not anulada or (anulada_motivo is not null and anulada_en is not null))
);

create index ventas_creado on public.ventas (creado_en desc);
create index ventas_turno on public.ventas (turno_id);
create index ventas_sin_stock on public.ventas (creado_en desc) where sin_stock;

alter table public.movimientos_certificado
  add constraint movimientos_certificado_venta_fk foreign key (venta_id) references public.ventas (id);
alter table public.movimientos_efectivo
  add constraint movimientos_efectivo_venta_fk foreign key (venta_id) references public.ventas (id);
alter table public.alertas
  add constraint alertas_venta_fk foreign key (venta_id) references public.ventas (id);

create function public.registrar_venta(
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

  select * into v_turno from public.turnos where usuario_id = auth.uid() and cerrado_en is null;
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

-- Anulación (solo admin). La hoja de certificado NO vuelve al stock (ya se entregó).
-- Si la venta fue en efectivo, el monto sale de la caja de cambio; si no alcanza, se rechaza.
create function public.anular_venta(p_venta_id bigint, p_motivo text)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta  public.ventas;
  v_motivo text;
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'El motivo es obligatorio');

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe' using errcode = '22023';
  end if;
  if v_venta.anulada then
    raise exception 'La venta ya estaba anulada' using errcode = 'P0001';
  end if;

  update public.ventas
  set anulada = true, anulada_motivo = v_motivo, anulada_por = auth.uid(), anulada_en = now()
  where id = p_venta_id
  returning * into v_venta;

  if v_venta.medio_pago = 'efectivo' and v_venta.precio > 0 then
    perform public._mover_efectivo('anulacion_venta', -v_venta.precio,
      'Anulación de venta #' || v_venta.id || ': ' || v_motivo, null, v_venta.id, null);
  end if;

  return v_venta;
end;
$$;
