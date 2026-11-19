-- Compras y ajustes de stock de certificados.
-- Costo promedio ponderado: (stock * promedio + total_compra) / (stock + hojas_compradas).
-- Ejemplo: 4 cajas × 25 hojas a $50.000 la caja = 100 hojas a $2.000 c/u.

create table public.compras_certificado (
  id             bigint generated always as identity primary key,
  certificado_id bigint not null references public.certificados (id),
  unidades       integer not null check (unidades > 0),
  costo_unidad   numeric(12,2) not null check (costo_unidad > 0),
  hojas          integer not null check (hojas > 0),
  costo_total    numeric(12,2) not null check (costo_total > 0),
  costo_hoja     numeric(14,4) not null check (costo_hoja > 0),
  fuente         public.fuente_fondos not null,
  proveedor      text,
  gasto_id       bigint not null references public.gastos (id),
  usuario_id     uuid not null references public.perfiles (id),
  creado_en      timestamptz not null default now()
);

create index compras_certificado_cert on public.compras_certificado (certificado_id, creado_en desc);

alter table public.movimientos_certificado
  add constraint movimientos_certificado_compra_fk
  foreign key (compra_id) references public.compras_certificado (id);

create function public.registrar_compra_certificado(
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

  if p_unidades is null or p_unidades <= 0 then
    raise exception 'La cantidad debe ser mayor a cero' using errcode = '22023';
  end if;
  if p_costo_unidad is null or p_costo_unidad <= 0 then
    raise exception 'El costo por unidad debe ser mayor a cero' using errcode = '22023';
  end if;

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

-- Ajuste manual (rotura, conteo físico, etc.). p_hojas con signo.
-- Se valora al costo promedio vigente y no lo modifica. No genera gasto.
create function public.ajustar_stock_certificado(
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
