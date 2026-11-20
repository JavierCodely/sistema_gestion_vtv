-- Fase 3 (certificados del admin).
--   1. Nombres de certificado normalizados y únicos sin distinguir mayúsculas (como el catálogo, 015).
--   2. Límites que evitan desbordes: hojas por unidad ≤ 10.000 y stock mínimo ≤ 1.000.000
--      (100.000 unidades × 10.000 hojas entra en integer).
--   3. registrar_compra_certificado: rechaza certificados desactivados y valida el total de la compra
--      antes de asignarlo (antes un total enorme cortaba con "numeric field overflow").

-- 1) Nombres
create trigger certificados_normalizar_nombre
  before insert or update of nombre on public.certificados
  for each row execute function public.tg_normalizar_nombre();

update public.certificados set nombre = nombre
  where nombre is distinct from regexp_replace(btrim(nombre), '\s+', ' ', 'g');

alter table public.certificados drop constraint certificados_nombre_key;
create unique index certificados_nombre_unico on public.certificados (lower(nombre));

-- 2) Límites
alter table public.certificados
  add constraint certificados_hojas_por_unidad_max check (hojas_por_unidad <= 10000),
  add constraint certificados_stock_minimo_max check (stock_minimo <= 1000000);

-- 3) Compra: igual que en la migración 014, más los dos controles nuevos.
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
  -- El total también tiene que entrar en numeric(12,2): se valida antes de asignarlo.
  perform public._validar_monto(p_unidades * p_costo_unidad, 'El total de la compra');

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if v_cert.id is null then
    raise exception 'El certificado no existe' using errcode = '22023';
  end if;
  if not v_cert.activo then
    raise exception 'El certificado está desactivado: activalo para registrar compras' using errcode = 'P0001';
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
