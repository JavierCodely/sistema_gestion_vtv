-- Fase 2 (catálogo del admin):
--   1. Nombres prolijos y únicos sin distinguir mayúsculas.
--   2. Una categoría desactivada saca de la venta a todos sus servicios.
-- El admin escribe directo en estas tablas (grants por columna), así que la regla vive en la BD:
--   "  Caja   1 " se guarda como "Caja 1", y "caja 1" choca con "Caja 1".

create function public.tg_normalizar_nombre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := regexp_replace(btrim(new.nombre), '\s+', ' ', 'g');
  return new;
end;
$$;

create trigger cajas_normalizar_nombre
  before insert or update of nombre on public.cajas
  for each row execute function public.tg_normalizar_nombre();
create trigger categorias_servicio_normalizar_nombre
  before insert or update of nombre on public.categorias_servicio
  for each row execute function public.tg_normalizar_nombre();
create trigger servicios_normalizar_nombre
  before insert or update of nombre on public.servicios
  for each row execute function public.tg_normalizar_nombre();

-- Normaliza solo los nombres que lo necesitan (no toca actualizado_en del resto).
update public.cajas set nombre = nombre
  where nombre is distinct from regexp_replace(btrim(nombre), '\s+', ' ', 'g');
update public.categorias_servicio set nombre = nombre
  where nombre is distinct from regexp_replace(btrim(nombre), '\s+', ' ', 'g');
update public.servicios set nombre = nombre
  where nombre is distinct from regexp_replace(btrim(nombre), '\s+', ' ', 'g');

-- La unicidad sin mayúsculas reemplaza a la única exacta original (que queda redundante).
alter table public.cajas drop constraint cajas_nombre_key;
alter table public.categorias_servicio drop constraint categorias_servicio_nombre_key;
alter table public.servicios drop constraint servicios_nombre_key;

create unique index cajas_nombre_unico on public.cajas (lower(nombre));
create unique index categorias_servicio_nombre_unico on public.categorias_servicio (lower(nombre));
create unique index servicios_nombre_unico on public.servicios (lower(nombre));

-- 2. registrar_venta: igual que en la migración 014, más el control de la categoría activa.
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

  if p_medio_pago = 'efectivo' and v_venta.precio > 0 then
    perform public._mover_efectivo('venta', v_venta.precio, 'Venta #' || v_venta.id,
                                   v_turno.id, v_venta.id, null);
  end if;

  return v_venta;
end;
$$;
