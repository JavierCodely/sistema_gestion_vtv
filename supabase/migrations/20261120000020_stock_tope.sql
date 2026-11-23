-- Tope del stock ACUMULADO de un certificado: 1.000.000.000 hojas.
-- Los topes por movimiento (018/019) no alcanzan: varias compras grandes desbordaban el integer
-- de stock_hojas con un error genérico. Ahora la BD lo impide con un mensaje claro.

alter table public.certificados
  add constraint certificados_stock_maximo check (stock_hojas <= 1000000000);

-- Compra: igual que en la migración 018, más el tope del stock resultante.
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
  if v_cert.stock_hojas::bigint + v_hojas > 1000000000 then
    raise exception 'El stock no puede superar las 1.000.000.000 hojas (stock actual: % hojas)', v_cert.stock_hojas
      using errcode = 'P0001';
  end if;
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

-- Ajuste: igual que en la migración 019, más el tope del stock resultante.
create or replace function public.ajustar_stock_certificado(
  p_certificado_id bigint,
  p_hojas          integer,
  p_nota           text
)
returns public.movimientos_certificado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cert public.certificados;
  v_mov  public.movimientos_certificado;
  v_nota text;
begin
  perform public._exigir_admin();
  v_nota := public._texto_obligatorio(p_nota, 'La nota es obligatoria');

  if p_hojas is null or p_hojas = 0 then
    raise exception 'El ajuste debe ser distinto de cero' using errcode = '22023';
  end if;
  if abs(p_hojas) > 100000 then
    raise exception 'El ajuste no puede superar las 100.000 hojas' using errcode = '22023';
  end if;

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if v_cert.id is null then
    raise exception 'El certificado no existe' using errcode = '22023';
  end if;
  if v_cert.stock_hojas::bigint + p_hojas > 1000000000 then
    raise exception 'El stock no puede superar las 1.000.000.000 hojas (stock actual: % hojas)', v_cert.stock_hojas
      using errcode = 'P0001';
  end if;
  if v_cert.stock_hojas + p_hojas < 0 then
    raise exception 'El ajuste deja el stock en negativo (stock actual: % hojas)', v_cert.stock_hojas
      using errcode = 'P0001';
  end if;

  update public.certificados set stock_hojas = stock_hojas + p_hojas where id = v_cert.id;

  insert into public.movimientos_certificado
    (certificado_id, tipo, hojas, costo_unitario, costo_total,
     stock_resultante, costo_promedio_resultante, nota, usuario_id)
  values
    (v_cert.id, 'ajuste', p_hojas, v_cert.costo_promedio, round(p_hojas * v_cert.costo_promedio, 2),
     v_cert.stock_hojas + p_hojas, v_cert.costo_promedio, v_nota, auth.uid())
  returning * into v_mov;

  return v_mov;
end;
$$;
