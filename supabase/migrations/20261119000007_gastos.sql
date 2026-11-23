-- Gastos con categorías en dos niveles: rubro › subcategoría.
-- Los gastos se imputan siempre a una subcategoría.
-- habilitada_caja solo aplica a subcategorías: decide si el cajero puede usarla.
-- "sistema" identifica categorías que usa la BD internamente (no se borran ni se usan a mano).

create table public.categorias_gasto (
  id              bigint generated always as identity primary key,
  nombre          text not null check (btrim(nombre) <> ''),
  padre_id        bigint references public.categorias_gasto (id),
  habilitada_caja boolean not null default false,
  activa          boolean not null default true,
  sistema         text unique,
  creado_en       timestamptz not null default now(),
  constraint categorias_gasto_nombre_unico unique nulls not distinct (padre_id, nombre),
  constraint categorias_gasto_habilitada_solo_sub
    check (not habilitada_caja or padre_id is not null),
  constraint categorias_gasto_sistema_no_caja
    check (sistema is null or not habilitada_caja)
);

-- Máximo dos niveles.
create function public.tg_categorias_gasto_niveles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.padre_id is not null then
    if new.padre_id = new.id then
      raise exception 'Una categoría no puede ser su propio rubro' using errcode = '22023';
    end if;
    if exists (select 1 from public.categorias_gasto where id = new.padre_id and padre_id is not null) then
      raise exception 'Solo se permiten dos niveles: el rubro elegido ya es una subcategoría'
        using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.categorias_gasto where padre_id = new.id) then
      raise exception 'Un rubro con subcategorías no puede pasar a ser subcategoría'
        using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.sistema is not null
     and (new.sistema is distinct from old.sistema or new.padre_id is distinct from old.padre_id
          or not new.activa) then
    raise exception 'La categoría "%" la usa el sistema: solo se puede renombrar', old.nombre
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger categorias_gasto_niveles
  before insert or update on public.categorias_gasto
  for each row execute function public.tg_categorias_gasto_niveles();

create function public.tg_categorias_gasto_no_borrar_sistema()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.sistema is not null then
    raise exception 'La categoría "%" la usa el sistema y no se puede borrar', old.nombre
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger categorias_gasto_no_borrar_sistema
  before delete on public.categorias_gasto
  for each row execute function public.tg_categorias_gasto_no_borrar_sistema();

-- Precarga de rubros y subcategorías.
do $$
declare
  v_rubro record;
  v_padre bigint;
  v_sub   text;
begin
  for v_rubro in
    select * from (values
      (1, 'Insumos',              array['Compra de certificados', 'Papelería', 'Tóner y tinta']),
      (2, 'Limpieza',             array['Productos de limpieza', 'Servicio de limpieza']),
      (3, 'Personal',             array['Sueldos', 'Adelantos', 'Horas extra']),
      (4, 'Comida y refrigerio',  array['Comida', 'Café y bebidas']),
      (5, 'Servicios',            array['Luz', 'Agua', 'Gas', 'Internet y telefonía', 'Alquiler']),
      (6, 'Mantenimiento',        array['Edificio', 'Equipos de inspección', 'Informática']),
      (7, 'Impuestos y tasas',    array['Impuestos', 'Tasas municipales']),
      (8, 'Administración',       array['Honorarios', 'Bancos y comisiones', 'Seguros']),
      (9, 'Varios',               array['Otros'])
    ) as t(orden, nombre, subs)
    order by orden
  loop
    insert into public.categorias_gasto (nombre) values (v_rubro.nombre) returning id into v_padre;
    foreach v_sub in array v_rubro.subs loop
      insert into public.categorias_gasto (nombre, padre_id, habilitada_caja, sistema)
      values (
        v_sub,
        v_padre,
        v_sub in ('Papelería', 'Productos de limpieza', 'Comida', 'Café y bebidas', 'Otros'),
        case when v_sub = 'Compra de certificados' then 'compra_certificados' end
      );
    end loop;
  end loop;
end;
$$;

create table public.gastos (
  id             bigint generated always as identity primary key,
  categoria_id   bigint not null references public.categorias_gasto (id),
  monto          numeric(12,2) not null check (monto > 0),
  fuente         public.fuente_fondos not null,
  nota           text not null check (btrim(nota) <> ''),
  usuario_id     uuid not null references public.perfiles (id),
  turno_id       bigint references public.turnos (id),
  caja_id        bigint references public.cajas (id),
  anulado        boolean not null default false,
  anulado_motivo text,
  anulado_por    uuid references public.perfiles (id),
  anulado_en     timestamptz,
  creado_en      timestamptz not null default now(),
  check (not anulado or (anulado_motivo is not null and anulado_en is not null))
);

create index gastos_creado on public.gastos (creado_en desc);
create index gastos_turno on public.gastos (turno_id);

alter table public.movimientos_efectivo
  add constraint movimientos_efectivo_gasto_fk foreign key (gasto_id) references public.gastos (id);

-- Inserta el gasto y mueve el efectivo si corresponde. Sin validar permisos (uso interno).
create function public._insertar_gasto(
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
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero' using errcode = '22023';
  end if;
  if p_fuente is null then
    raise exception 'Indicá la fuente del gasto (efectivo o transferencia)' using errcode = '22023';
  end if;

  select * into v_turno
  from public.turnos
  where usuario_id = auth.uid() and cerrado_en is null;

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

-- Registrar un gasto. El cajero necesita turno abierto y una categoría habilitada para caja.
create function public.registrar_gasto(
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
  v_rol public.rol_usuario := public._exigir_usuario();
  v_cat public.categorias_gasto;
begin
  select * into v_cat from public.categorias_gasto where id = p_categoria_id;

  if v_cat.id is null or not v_cat.activa then
    raise exception 'La categoría de gasto no existe o está inactiva' using errcode = '22023';
  end if;
  if v_cat.padre_id is null then
    raise exception 'Elegí una subcategoría, no un rubro' using errcode = '22023';
  end if;
  if v_cat.sistema is not null then
    raise exception 'La categoría "%" se registra automáticamente; no se carga a mano', v_cat.nombre
      using errcode = '22023';
  end if;

  if v_rol = 'cajero' then
    if not v_cat.habilitada_caja then
      raise exception 'La categoría "%" no está habilitada para la caja', v_cat.nombre
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.turnos where usuario_id = auth.uid() and cerrado_en is null) then
      raise exception 'Necesitás un turno abierto para registrar gastos' using errcode = 'P0001';
    end if;
  end if;

  return public._insertar_gasto(p_categoria_id, p_monto, p_fuente, p_nota);
end;
$$;

create function public.anular_gasto(p_gasto_id bigint, p_motivo text)
returns public.gastos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gasto  public.gastos;
  v_motivo text;
begin
  perform public._exigir_admin();
  v_motivo := public._texto_obligatorio(p_motivo, 'El motivo es obligatorio');

  select * into v_gasto from public.gastos where id = p_gasto_id for update;
  if v_gasto.id is null then
    raise exception 'El gasto no existe' using errcode = '22023';
  end if;
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

  if v_gasto.fuente = 'efectivo' then
    perform public._mover_efectivo('anulacion_gasto', v_gasto.monto,
      'Anulación de gasto #' || v_gasto.id || ': ' || v_motivo, null, null, v_gasto.id);
  end if;

  return v_gasto;
end;
$$;
