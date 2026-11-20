-- Corrección de compras de certificados (decisión del negocio, 2026-11-20).
--
-- "Editar" una compra = anularla y registrar la corregida en UNA operación:
--   · se revierte todo lo que hizo la original (hojas, costo promedio, gasto y efectivo);
--   · la original queda anulada (motivo, quién, cuándo) y enlazada a la que la reemplaza;
--   · solo se puede si la compra es el ÚLTIMO movimiento de su certificado (sin ventas, ajustes
--     ni compras posteriores), así el costo de ventas ya hechas nunca cambia.
-- Si ya hubo movimientos posteriores, la diferencia se corrige con un ajuste de stock.

-- Tipo de movimiento para la reversión en el kardex. La función que lo usa es plpgsql
-- (se resuelve al ejecutar), así que el valor nuevo puede agregarse en la misma transacción.
alter type public.tipo_mov_certificado add value 'anulacion_compra';

alter table public.compras_certificado
  add column anulada         boolean not null default false,
  add column anulada_motivo  text check (char_length(anulada_motivo) <= 500),
  add column anulada_por     uuid references public.perfiles (id),
  add column anulada_en      timestamptz,
  add column reemplazada_por bigint references public.compras_certificado (id),
  add constraint compras_certificado_anulada_completa
    check (not anulada or (anulada_motivo is not null and anulada_en is not null));

-- ---------------------------------------------------------------------------------------------
-- Interna: registra una compra sobre un certificado YA bloqueado y validado.
-- La usan registrar_compra_certificado y corregir_compra_certificado (una sola lógica).
create function public._registrar_compra(
  p_cert            public.certificados,
  p_unidades        integer,
  p_hojas_por_unidad integer,
  p_costo_unidad    numeric,
  p_fuente          public.fuente_fondos,
  p_proveedor       text
)
returns public.compras_certificado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hojas     integer;
  v_total     numeric(12,2);
  v_costo_h   numeric(14,4);
  v_promedio  numeric(14,4);
  v_gasto     public.gastos;
  v_compra    public.compras_certificado;
  v_cat_id    bigint;
  v_proveedor text := nullif(btrim(p_proveedor), '');
begin
  if p_unidades is null or p_unidades <= 0 or p_unidades > 100000 then
    raise exception 'La cantidad debe ser entre 1 y 100.000' using errcode = '22023';
  end if;
  perform public._validar_monto(p_costo_unidad, 'El costo por unidad');
  -- El total también tiene que entrar en numeric(12,2): se valida antes de asignarlo.
  perform public._validar_monto(p_unidades * p_costo_unidad, 'El total de la compra');
  if p_fuente is null then
    raise exception 'Indicá con qué se pagó (efectivo o transferencia)' using errcode = '22023';
  end if;

  v_hojas := p_unidades * p_hojas_por_unidad;
  if p_cert.stock_hojas::bigint + v_hojas > 1000000000 then
    raise exception 'El stock no puede superar las 1.000.000.000 hojas (stock actual: % hojas)', p_cert.stock_hojas
      using errcode = 'P0001';
  end if;
  v_total    := p_unidades * p_costo_unidad;
  v_costo_h  := v_total / v_hojas;
  v_promedio := (p_cert.stock_hojas * p_cert.costo_promedio + v_total) / (p_cert.stock_hojas + v_hojas);

  select id into v_cat_id from public.categorias_gasto where sistema = 'compra_certificados';

  v_gasto := public._insertar_gasto(
    v_cat_id, v_total, p_fuente,
    format('Compra de %s %s de %s (%s hojas)%s',
      p_unidades,
      p_cert.unidad_compra::text || case
        when p_unidades = 1 then ''
        when p_cert.unidad_compra = 'unidad' then 'es'
        else 's' end,
      p_cert.nombre, v_hojas,
      coalesce(' — ' || v_proveedor, ''))
  );

  insert into public.compras_certificado
    (certificado_id, unidades, costo_unidad, hojas, costo_total, costo_hoja,
     fuente, proveedor, gasto_id, usuario_id)
  values
    (p_cert.id, p_unidades, p_costo_unidad, v_hojas, v_total, v_costo_h,
     p_fuente, v_proveedor, v_gasto.id, auth.uid())
  returning * into v_compra;

  update public.certificados
  set stock_hojas = stock_hojas + v_hojas, costo_promedio = v_promedio
  where id = p_cert.id;

  insert into public.movimientos_certificado
    (certificado_id, tipo, hojas, costo_unitario, costo_total,
     stock_resultante, costo_promedio_resultante, compra_id, nota, usuario_id)
  values
    (p_cert.id, 'compra', v_hojas, v_costo_h, v_total,
     p_cert.stock_hojas + v_hojas, v_promedio, v_compra.id, v_proveedor, auth.uid());

  return v_compra;
end;
$$;

revoke all on function public._registrar_compra(public.certificados, integer, integer, numeric, public.fuente_fondos, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Compra: mismas reglas que en la 020, ahora a través de _registrar_compra.
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
  v_cert public.certificados;
begin
  perform public._exigir_admin();

  select * into v_cert from public.certificados where id = p_certificado_id for update;
  if v_cert.id is null then
    raise exception 'El certificado no existe' using errcode = '22023';
  end if;
  if not v_cert.activo then
    raise exception 'El certificado está desactivado: activalo para registrar compras' using errcode = 'P0001';
  end if;

  return public._registrar_compra(v_cert, p_unidades, v_cert.hojas_por_unidad,
                                  p_costo_unidad, p_fuente, p_proveedor);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Corrige una compra: la anula (revirtiendo todo) y registra la corregida. Devuelve la nueva.
-- La corregida usa la misma presentación que la original (hojas por unidad de esa compra).
create function public.corregir_compra_certificado(
  p_compra_id    bigint,
  p_unidades     integer,
  p_costo_unidad numeric,
  p_fuente       public.fuente_fondos,
  p_proveedor    text,
  p_motivo       text
)
returns public.compras_certificado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.compras_certificado;
  v_cert     public.certificados;
  v_mov_id   bigint;
  v_ultimo   bigint;
  v_promedio numeric(14,4);
  v_gasto    public.gastos;
  v_nueva    public.compras_certificado;
  v_motivo   text;
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'Escribí el motivo de la corrección');
  if char_length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres' using errcode = '22023';
  end if;

  select * into v_original from public.compras_certificado where id = p_compra_id;
  if v_original.id is null then
    raise exception 'La compra no existe' using errcode = '22023';
  end if;

  -- Mismo orden de bloqueo que las ventas, compras y ajustes: primero el certificado.
  select * into v_cert from public.certificados where id = v_original.certificado_id for update;
  select * into v_original from public.compras_certificado where id = p_compra_id for update;

  if v_original.anulada then
    raise exception 'Esta compra ya fue corregida o anulada' using errcode = 'P0001';
  end if;
  if not v_cert.activo then
    raise exception 'El certificado está desactivado: activalo para corregir sus compras' using errcode = 'P0001';
  end if;

  select id into v_mov_id from public.movimientos_certificado
  where compra_id = v_original.id and tipo = 'compra';
  select max(id) into v_ultimo from public.movimientos_certificado
  where certificado_id = v_cert.id;
  if v_mov_id is distinct from v_ultimo then
    raise exception 'Solo se puede editar la última compra de un certificado, sin ventas ni ajustes posteriores. Corregí la diferencia con un ajuste de stock.'
      using errcode = 'P0001';
  end if;

  -- Estado exacto antes de la compra: el promedio que dejó el movimiento anterior (0 si no hubo).
  select costo_promedio_resultante into v_promedio from public.movimientos_certificado
  where certificado_id = v_cert.id and id < v_mov_id
  order by id desc limit 1;
  v_promedio := coalesce(v_promedio, 0);

  -- 1) Revertir la original: gasto (y efectivo), stock, costo promedio y kardex.
  update public.gastos
  set anulado = true,
      anulado_motivo = format('Corrección de compra #%s: %s', v_original.id, v_motivo),
      anulado_por = auth.uid(),
      anulado_en = now()
  where id = v_original.gasto_id
  returning * into v_gasto;
  if v_gasto.fuente = 'efectivo' then
    perform public._mover_efectivo('anulacion_gasto', v_gasto.monto,
      format('Corrección de compra #%s: %s', v_original.id, v_motivo), null, null, v_gasto.id);
  end if;

  update public.certificados
  set stock_hojas = stock_hojas - v_original.hojas, costo_promedio = v_promedio
  where id = v_cert.id
  returning * into v_cert;

  insert into public.movimientos_certificado
    (certificado_id, tipo, hojas, costo_unitario, costo_total,
     stock_resultante, costo_promedio_resultante, compra_id, nota, usuario_id)
  values
    (v_cert.id, 'anulacion_compra', -v_original.hojas, v_original.costo_hoja, -v_original.costo_total,
     v_cert.stock_hojas, v_promedio, v_original.id, v_motivo, auth.uid());

  -- 2) Registrar la corregida con la presentación de la original.
  v_nueva := public._registrar_compra(v_cert, p_unidades, v_original.hojas / v_original.unidades,
                                      p_costo_unidad, p_fuente, p_proveedor);

  update public.compras_certificado
  set anulada = true, anulada_motivo = v_motivo, anulada_por = auth.uid(), anulada_en = now(),
      reemplazada_por = v_nueva.id
  where id = v_original.id;

  return v_nueva;
end;
$$;

revoke all on function public.corregir_compra_certificado(bigint, integer, numeric, public.fuente_fondos, text, text)
  from public, anon;
grant execute on function public.corregir_compra_certificado(bigint, integer, numeric, public.fuente_fondos, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lectura de compras para el admin (RLS de compras_certificado: solo admin). `editable` aplica la
-- misma regla que corregir_compra_certificado, así la UI no la reimplementa.
create index movimientos_certificado_cert_id on public.movimientos_certificado (certificado_id, id desc);
create index movimientos_certificado_compra on public.movimientos_certificado (compra_id);

create view public.v_compras_certificado
with (security_invoker = true) as
select
  c.id,
  c.creado_en,
  c.certificado_id,
  cert.nombre                 as certificado,
  cert.unidad_compra,
  c.hojas / c.unidades        as hojas_por_unidad,
  c.unidades,
  c.costo_unidad,
  c.hojas,
  c.costo_total,
  c.fuente,
  c.proveedor,
  u.nombre                    as usuario,
  c.anulada,
  c.anulada_motivo,
  c.anulada_en,
  a.nombre                    as anulada_por,
  c.reemplazada_por,
  coalesce(
    not c.anulada
    and cert.activo
    and m.id = (select max(m2.id) from public.movimientos_certificado m2
                where m2.certificado_id = c.certificado_id),
    false)                    as editable
from public.compras_certificado c
join public.certificados cert on cert.id = c.certificado_id
join public.perfiles u on u.id = c.usuario_id
left join public.perfiles a on a.id = c.anulada_por
left join public.movimientos_certificado m on m.compra_id = c.id and m.tipo = 'compra';

grant select on public.v_compras_certificado to authenticated;
