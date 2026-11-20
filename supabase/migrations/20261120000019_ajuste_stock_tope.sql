-- Ajuste de stock: tope de 100.000 hojas por movimiento (igual que la cantidad de una compra),
-- para que un número enorme no termine en un desborde de integer.
-- Igual que en la migración 008, más el tope.
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
