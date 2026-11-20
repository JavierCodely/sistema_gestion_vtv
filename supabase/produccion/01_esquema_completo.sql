-- =====================================================================
-- Sistema VTV — esquema completo para producción
-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs. No editar a mano:
-- cambiá supabase/migrations/ y corré `npm run sql:produccion`.
--
-- Ejecutar UNA sola vez, en un proyecto vacío, en el SQL Editor del Dashboard.
-- Corre en una transacción: si algo falla, no queda nada a medias.
-- NO incluye supabase/seed.sql (usuarios de prueba): no va a producción.
--
-- Incluye, en este orden:
--   01. 20261119000001_tipos.sql
--   02. 20261119000002_usuarios.sql
--   03. 20261119000003_cajas_turnos.sql
--   04. 20261119000004_catalogo.sql
--   05. 20261119000005_certificados.sql
--   06. 20261119000006_efectivo.sql
--   07. 20261119000007_gastos.sql
--   08. 20261119000008_compras_certificados.sql
--   09. 20261119000009_alertas.sql
--   10. 20261119000010_ventas.sql
--   11. 20261119000011_turnos.sql
--   12. 20261119000012_vistas.sql
--   13. 20261119000013_rls.sql
--   14. 20261120000014_endurecimiento_seguridad.sql
--
-- Después de ejecutarlo, registrá las migraciones como aplicadas para que
-- `supabase db push` no intente aplicarlas de nuevo:
--   npx supabase migration repair --status applied 20261119000001 20261119000002 20261119000003 20261119000004 20261119000005 20261119000006 20261119000007 20261119000008 20261119000009 20261119000010 20261119000011 20261119000012 20261119000013 20261120000014
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 20261119000001_tipos.sql
-- ---------------------------------------------------------------------
-- Tipos enumerados y utilidades comunes.

create type public.rol_usuario as enum ('admin', 'cajero');
create type public.medio_pago as enum ('efectivo', 'transferencia', 'tarjeta');
create type public.fuente_fondos as enum ('efectivo', 'transferencia');
create type public.unidad_compra as enum ('caja', 'libreta', 'unidad');
create type public.alcance_certificado as enum ('global', 'categoria', 'servicio');
create type public.tipo_mov_certificado as enum ('compra', 'venta', 'ajuste');
create type public.tipo_mov_efectivo as enum (
  'fondo_inicial', 'ingreso', 'retiro',
  'venta', 'anulacion_venta',
  'gasto', 'anulacion_gasto'
);
create type public.tipo_alerta as enum ('venta_sin_stock', 'stock_bajo');

-- Fecha "de negocio": el día se cuenta en hora argentina.
create function public.fecha_local(ts timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (ts at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create function public.tg_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Valida que un texto obligatorio no venga vacío (si no, lanza p_mensaje). Devuelve el texto recortado.
create function public._texto_obligatorio(p_valor text, p_mensaje text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valor is null or btrim(p_valor) = '' then
    raise exception '%', p_mensaje using errcode = '22023';
  end if;
  return btrim(p_valor);
end;
$$;

-- ---------------------------------------------------------------------
-- 20261119000002_usuarios.sql
-- ---------------------------------------------------------------------
-- Perfiles de usuario y roles.
-- El perfil se crea solo cuando se da de alta un usuario en auth.users.
-- El rol se toma de raw_app_meta_data->>'rol' (solo el service role puede escribirlo).

create table public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null check (btrim(nombre) <> ''),
  email          text,
  rol            public.rol_usuario not null default 'cajero',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create trigger perfiles_actualizado_en
  before update on public.perfiles
  for each row execute function public.tg_actualizado_en();

create function public.tg_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), new.email, 'Sin nombre'),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'rol')::public.rol_usuario, 'cajero')
  );
  return new;
end;
$$;

create trigger auth_users_crear_perfil
  after insert on auth.users
  for each row execute function public.tg_crear_perfil();

-- Siempre debe quedar al menos un administrador activo.
create function public.tg_proteger_ultimo_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

create trigger perfiles_proteger_ultimo_admin
  before update or delete on public.perfiles
  for each row execute function public.tg_proteger_ultimo_admin();

-- Rol del usuario actual; null si no hay sesión o el usuario está desactivado.
create function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.perfiles p where p.id = auth.uid() and p.activo
$$;

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'admin', false)
$$;

-- Para usar al inicio de cada RPC: corta si no hay usuario activo.
create function public._exigir_usuario()
returns public.rol_usuario
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'Usuario no autenticado o desactivado' using errcode = '42501';
  end if;
  return v_rol;
end;
$$;

create function public._exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public._exigir_usuario() <> 'admin' then
    raise exception 'Solo un administrador puede hacer esta operación' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 20261119000003_cajas_turnos.sql
-- ---------------------------------------------------------------------
-- Cajas (puestos de cobro) y turnos.
-- Regla: una caja tiene a lo sumo un turno abierto; un usuario también.
-- Las RPC abrir_turno / cerrar_turno están en la migración de turnos.

create table public.cajas (
  id        bigint generated always as identity primary key,
  nombre    text not null unique check (btrim(nombre) <> ''),
  activa    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.turnos (
  id                  bigint generated always as identity primary key,
  caja_id             bigint not null references public.cajas (id),
  usuario_id          uuid not null references public.perfiles (id),
  abierto_en          timestamptz not null default now(),
  cerrado_en          timestamptz,
  observaciones       text,
  -- Foto de totales al cerrar (las vistas calculan los valores en vivo).
  cantidad_ventas     integer,
  total_efectivo      numeric(12,2),
  total_transferencia numeric(12,2),
  total_tarjeta       numeric(12,2),
  total_gastos        numeric(12,2),
  check (cerrado_en is null or cerrado_en >= abierto_en)
);

create unique index turnos_un_abierto_por_caja
  on public.turnos (caja_id) where cerrado_en is null;
create unique index turnos_un_abierto_por_usuario
  on public.turnos (usuario_id) where cerrado_en is null;
create index turnos_abierto_en on public.turnos (abierto_en desc);

-- ---------------------------------------------------------------------
-- 20261119000004_catalogo.sql
-- ---------------------------------------------------------------------
-- Catálogo de servicios que se cobran (ej. "Vehículo particular" en "Vehicular").

create table public.categorias_servicio (
  id        bigint generated always as identity primary key,
  nombre    text not null unique check (btrim(nombre) <> ''),
  activa    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.servicios (
  id                   bigint generated always as identity primary key,
  nombre               text not null unique check (btrim(nombre) <> ''),
  categoria_id         bigint not null references public.categorias_servicio (id),
  precio               numeric(12,2) not null check (precio >= 0),
  requiere_certificado boolean not null default true,
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

create index servicios_categoria on public.servicios (categoria_id);

create trigger servicios_actualizado_en
  before update on public.servicios
  for each row execute function public.tg_actualizado_en();

-- ---------------------------------------------------------------------
-- 20261119000005_certificados.sql
-- ---------------------------------------------------------------------
-- Certificados (hojas impresas que se entregan con cada servicio).
-- stock_hojas y costo_promedio SOLO los modifican las RPC (compra, venta, ajuste);
-- el cliente no tiene permiso de UPDATE sobre esas columnas (ver migración de RLS).

create table public.certificados (
  id               bigint generated always as identity primary key,
  nombre           text not null unique check (btrim(nombre) <> ''),
  unidad_compra    public.unidad_compra not null default 'caja',
  hojas_por_unidad integer not null check (hojas_por_unidad > 0),
  alcance          public.alcance_certificado not null default 'global',
  categoria_id     bigint references public.categorias_servicio (id),
  servicio_id      bigint references public.servicios (id),
  stock_minimo     integer not null default 0 check (stock_minimo >= 0),
  stock_hojas      integer not null default 0 check (stock_hojas >= 0),
  costo_promedio   numeric(14,4) not null default 0 check (costo_promedio >= 0),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint certificados_unidad_suelta
    check (unidad_compra <> 'unidad' or hojas_por_unidad = 1),
  constraint certificados_alcance_coherente check (
       (alcance = 'global'    and categoria_id is null     and servicio_id is null)
    or (alcance = 'categoria' and categoria_id is not null and servicio_id is null)
    or (alcance = 'servicio'  and servicio_id is not null  and categoria_id is null)
  )
);

-- Un solo certificado activo por destino, para que la elección sea inequívoca.
create unique index certificados_un_global_activo
  on public.certificados (alcance) where alcance = 'global' and activo;
create unique index certificados_uno_por_categoria
  on public.certificados (categoria_id) where alcance = 'categoria' and activo;
create unique index certificados_uno_por_servicio
  on public.certificados (servicio_id) where alcance = 'servicio' and activo;

create trigger certificados_actualizado_en
  before update on public.certificados
  for each row execute function public.tg_actualizado_en();

-- Kardex: cada entrada/salida de hojas con su costo.
-- compra_id y venta_id se enlazan en las migraciones de compras y ventas.
create table public.movimientos_certificado (
  id                         bigint generated always as identity primary key,
  certificado_id             bigint not null references public.certificados (id),
  tipo                       public.tipo_mov_certificado not null,
  hojas                      integer not null check (hojas <> 0),
  costo_unitario             numeric(14,4) not null check (costo_unitario >= 0),
  costo_total                numeric(14,2) not null,
  stock_resultante           integer not null check (stock_resultante >= 0),
  costo_promedio_resultante  numeric(14,4) not null,
  compra_id                  bigint,
  venta_id                   bigint,
  nota                       text,
  usuario_id                 uuid references public.perfiles (id),
  creado_en                  timestamptz not null default now()
);

create index movimientos_certificado_cert
  on public.movimientos_certificado (certificado_id, creado_en desc);

-- Certificado que corresponde a un servicio: el más específico activo
-- (servicio > categoría > global). Null si el servicio no lleva certificado
-- o no hay ninguno configurado.
create function public.certificado_para_servicio(p_servicio_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.servicios s
  join public.certificados c
    on c.activo
   and (   (c.alcance = 'servicio'  and c.servicio_id  = s.id)
        or (c.alcance = 'categoria' and c.categoria_id = s.categoria_id)
        or  c.alcance = 'global')
  where s.id = p_servicio_id
    and s.requiere_certificado
  order by case c.alcance when 'servicio' then 1 when 'categoria' then 2 else 3 end
  limit 1
$$;

-- ---------------------------------------------------------------------
-- 20261119000006_efectivo.sql
-- ---------------------------------------------------------------------
-- Caja de efectivo para cambio: UNA sola, compartida por todos los cajeros.
-- Todo movimiento pasa por public._mover_efectivo, que bloquea la fila y
-- garantiza que el saldo nunca quede negativo.

create table public.caja_efectivo (
  id             smallint primary key default 1 check (id = 1),
  saldo          numeric(12,2) not null default 0 check (saldo >= 0),
  actualizado_en timestamptz not null default now()
);

insert into public.caja_efectivo (id, saldo) values (1, 0);

-- Libro de movimientos. monto con signo: + entra, - sale.
-- venta_id / gasto_id se enlazan en las migraciones correspondientes.
create table public.movimientos_efectivo (
  id               bigint generated always as identity primary key,
  tipo             public.tipo_mov_efectivo not null,
  monto            numeric(12,2) not null check (monto <> 0),
  saldo_resultante numeric(12,2) not null check (saldo_resultante >= 0),
  nota             text,
  usuario_id       uuid references public.perfiles (id),
  turno_id         bigint references public.turnos (id),
  venta_id         bigint,
  gasto_id         bigint,
  creado_en        timestamptz not null default now()
);

create index movimientos_efectivo_creado on public.movimientos_efectivo (creado_en desc);

-- Uso interno (no expuesta al cliente).
create function public._mover_efectivo(
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

-- Movimientos manuales del administrador: fondo inicial, ingreso, retiro.
-- p_monto siempre positivo; el retiro resta.
create function public.movimiento_efectivo(
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
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero' using errcode = '22023';
  end if;

  v_id := public._mover_efectivo(
    p_tipo,
    case when p_tipo = 'retiro' then -p_monto else p_monto end,
    public._texto_obligatorio(p_nota, 'La nota es obligatoria')
  );

  select * into v_mov from public.movimientos_efectivo where id = v_id;
  return v_mov;
end;
$$;

-- ---------------------------------------------------------------------
-- 20261119000007_gastos.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261119000008_compras_certificados.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261119000009_alertas.sql
-- ---------------------------------------------------------------------
-- Alertas para el administrador (venta sin certificado, stock bajo).
-- Se publican en Realtime para el contador del header.

create table public.alertas (
  id             bigint generated always as identity primary key,
  tipo           public.tipo_alerta not null,
  mensaje        text not null,
  certificado_id bigint references public.certificados (id),
  venta_id       bigint,
  leida          boolean not null default false,
  leida_en       timestamptz,
  leida_por      uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);

create index alertas_no_leidas on public.alertas (creado_en desc) where not leida;

-- Marca como leídas las alertas indicadas, o todas si p_ids es null. Devuelve cuántas cambió.
create function public.marcar_alertas_leidas(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cant integer;
begin
  perform public._exigir_admin();

  update public.alertas
  set leida = true, leida_en = now(), leida_por = auth.uid()
  where not leida
    and (p_ids is null or id = any (p_ids));

  get diagnostics v_cant = row_count;
  return v_cant;
end;
$$;

-- ---------------------------------------------------------------------
-- 20261119000010_ventas.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261119000011_turnos.sql
-- ---------------------------------------------------------------------
-- Apertura y cierre de turnos.

create function public.abrir_turno(p_caja_id bigint)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caja  public.cajas;
  v_turno public.turnos;
begin
  perform public._exigir_usuario();

  select * into v_caja from public.cajas where id = p_caja_id;
  if v_caja.id is null or not v_caja.activa then
    raise exception 'La caja no existe o está desactivada' using errcode = '22023';
  end if;
  if exists (select 1 from public.turnos where usuario_id = auth.uid() and cerrado_en is null) then
    raise exception 'Ya tenés un turno abierto; cerralo antes de abrir otro' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.turnos where caja_id = p_caja_id and cerrado_en is null) then
    raise exception 'La caja "%" ya tiene un turno abierto', v_caja.nombre using errcode = 'P0001';
  end if;

  begin
    insert into public.turnos (caja_id, usuario_id)
    values (p_caja_id, auth.uid())
    returning * into v_turno;
  exception when unique_violation then
    raise exception 'La caja "%" acaba de ser ocupada por otro usuario', v_caja.nombre
      using errcode = 'P0001';
  end;

  return v_turno;
end;
$$;

-- Cierra el turno propio, o cualquiera si lo pide un admin indicando p_turno_id.
create function public.cerrar_turno(p_observaciones text default null, p_turno_id bigint default null)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol   public.rol_usuario := public._exigir_usuario();
  v_turno public.turnos;
begin
  if p_turno_id is null then
    select * into v_turno from public.turnos
    where usuario_id = auth.uid() and cerrado_en is null
    for update;
    if v_turno.id is null then
      raise exception 'No tenés un turno abierto' using errcode = 'P0001';
    end if;
  else
    select * into v_turno from public.turnos where id = p_turno_id for update;
    if v_turno.id is null then
      raise exception 'El turno no existe' using errcode = '22023';
    end if;
    if v_turno.usuario_id <> auth.uid() and v_rol <> 'admin' then
      raise exception 'Solo un administrador puede cerrar el turno de otro usuario' using errcode = '42501';
    end if;
    if v_turno.cerrado_en is not null then
      raise exception 'El turno ya estaba cerrado' using errcode = 'P0001';
    end if;
  end if;

  update public.turnos t
  set cerrado_en          = now(),
      observaciones       = nullif(btrim(p_observaciones), ''),
      cantidad_ventas     = r.cantidad,
      total_efectivo      = r.efectivo,
      total_transferencia = r.transferencia,
      total_tarjeta       = r.tarjeta,
      total_gastos        = r.gastos
  from (
    select
      count(*) filter (where not v.anulada)                                         as cantidad,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'efectivo'), 0)      as efectivo,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'transferencia'), 0) as transferencia,
      coalesce(sum(v.precio) filter (where not v.anulada and v.medio_pago = 'tarjeta'), 0)       as tarjeta,
      (select coalesce(sum(g.monto), 0) from public.gastos g
        where g.turno_id = v_turno.id and not g.anulado)                            as gastos
    from public.ventas v
    where v.turno_id = v_turno.id
  ) r
  where t.id = v_turno.id
  returning t.* into v_turno;

  return v_turno;
end;
$$;

-- ---------------------------------------------------------------------
-- 20261119000012_vistas.sql
-- ---------------------------------------------------------------------
-- Vistas para pantallas y reportes. Todas con security_invoker: respetan la RLS
-- del usuario que consulta (el cajero ve lo suyo, el admin ve todo).

-- Ventas y gastos juntos. Los gastos con monto NEGATIVO (fila roja en la UI).
-- Las filas anuladas se incluyen (anulada = true) para mostrarlas tachadas;
-- los totales deben excluirlas.
create view public.v_movimientos_caja
with (security_invoker = true) as
select
  'venta'::text                  as tipo,
  v.id                           as id,
  v.creado_en                    as fecha,
  public.fecha_local(v.creado_en) as fecha_local,
  v.turno_id,
  v.caja_id,
  c.nombre                       as caja_nombre,
  v.usuario_id,
  p.nombre                       as usuario_nombre,
  v.servicio_nombre              as concepto,
  cs.nombre                      as detalle,
  v.medio_pago::text             as medio,
  v.precio                       as monto,
  v.patente,
  v.sin_stock,
  v.anulada,
  v.anulada_motivo               as motivo_anulacion,
  null::text                     as nota,
  v.servicio_id,
  null::bigint                   as categoria_gasto_id
from public.ventas v
join public.cajas c on c.id = v.caja_id
left join public.perfiles p on p.id = v.usuario_id
left join public.categorias_servicio cs on cs.id = v.categoria_id
union all
select
  'gasto'::text,
  g.id,
  g.creado_en,
  public.fecha_local(g.creado_en),
  g.turno_id,
  g.caja_id,
  c.nombre,
  g.usuario_id,
  p.nombre,
  sub.nombre,
  rubro.nombre,
  g.fuente::text,
  -g.monto,
  null,
  false,
  g.anulado,
  g.anulado_motivo,
  g.nota,
  null,
  g.categoria_id
from public.gastos g
left join public.cajas c on c.id = g.caja_id
left join public.perfiles p on p.id = g.usuario_id
join public.categorias_gasto sub on sub.id = g.categoria_id
left join public.categorias_gasto rubro on rubro.id = sub.padre_id;

-- Turnos con totales calculados en vivo (excluyen anulados).
create view public.v_turnos
with (security_invoker = true) as
select
  t.*,
  c.nombre  as caja_nombre,
  p.nombre  as usuario_nombre,
  t.cerrado_en is null as abierto,
  coalesce(v.cantidad, 0)                     as ventas_cantidad,
  coalesce(v.efectivo, 0)::numeric(14,2)      as ventas_efectivo,
  coalesce(v.transferencia, 0)::numeric(14,2) as ventas_transferencia,
  coalesce(v.tarjeta, 0)::numeric(14,2)       as ventas_tarjeta,
  coalesce(v.total, 0)::numeric(14,2)         as ventas_total,
  coalesce(g.total, 0)::numeric(14,2)         as gastos_total,
  (coalesce(v.total, 0) - coalesce(g.total, 0))::numeric(14,2) as neto
from public.turnos t
join public.cajas c on c.id = t.caja_id
left join public.perfiles p on p.id = t.usuario_id
left join lateral (
  select
    count(*)                                                          as cantidad,
    sum(precio)                                                       as total,
    sum(precio) filter (where medio_pago = 'efectivo')                as efectivo,
    sum(precio) filter (where medio_pago = 'transferencia')           as transferencia,
    sum(precio) filter (where medio_pago = 'tarjeta')                 as tarjeta
  from public.ventas where turno_id = t.id and not anulada
) v on true
left join lateral (
  select sum(monto) as total from public.gastos where turno_id = t.id and not anulado
) g on true;

-- Resumen por día (hora argentina), sin anulados.
create view public.v_resumen_diario
with (security_invoker = true) as
with mov as (
  select public.fecha_local(creado_en) as fecha, precio as venta, medio_pago,
         costo_certificado as costo, sin_stock, 0::numeric as gasto
  from public.ventas where not anulada
  union all
  select public.fecha_local(creado_en), 0, null, 0, false, monto
  from public.gastos where not anulado
)
select
  fecha,
  count(*) filter (where medio_pago is not null)                         as cantidad_ventas,
  coalesce(sum(venta), 0)::numeric(14,2)                                 as total_ventas,
  coalesce(sum(venta) filter (where medio_pago = 'efectivo'), 0)::numeric(14,2)      as total_efectivo,
  coalesce(sum(venta) filter (where medio_pago = 'transferencia'), 0)::numeric(14,2) as total_transferencia,
  coalesce(sum(venta) filter (where medio_pago = 'tarjeta'), 0)::numeric(14,2)       as total_tarjeta,
  coalesce(sum(gasto), 0)::numeric(14,2)                                 as total_gastos,
  (coalesce(sum(venta), 0) - coalesce(sum(gasto), 0))::numeric(14,2)    as flujo_neto,
  round(coalesce(sum(costo), 0), 2)::numeric(14,2)                       as costo_certificados,
  round(coalesce(sum(venta), 0) - coalesce(sum(costo), 0), 2)::numeric(14,2) as margen_bruto,
  count(*) filter (where sin_stock)                                      as ventas_sin_stock
from mov
group by fecha;

-- Stock de certificados con valuación y semáforo.
create view public.v_stock_certificados
with (security_invoker = true) as
select
  c.id,
  c.nombre,
  c.unidad_compra,
  c.hojas_por_unidad,
  c.alcance,
  c.categoria_id,
  c.servicio_id,
  case c.alcance
    when 'global'    then 'Todos los servicios'
    when 'categoria' then cs.nombre
    else s.nombre
  end                                               as aplica_a,
  c.stock_minimo,
  c.stock_hojas,
  round(c.costo_promedio, 2)::numeric(14,2)         as costo_promedio,
  round(c.stock_hojas * c.costo_promedio, 2)::numeric(14,2) as valor_stock,
  case
    when c.stock_hojas = 0              then 'sin_stock'
    when c.stock_hojas <= c.stock_minimo then 'bajo'
    else 'ok'
  end                                               as semaforo,
  c.activo
from public.certificados c
left join public.categorias_servicio cs on cs.id = c.categoria_id
left join public.servicios s on s.id = c.servicio_id;

-- Gastos agregados por día, rubro, subcategoría y fuente (sin anulados).
create view public.v_gastos_por_categoria
with (security_invoker = true) as
select
  public.fecha_local(g.creado_en) as fecha,
  rubro.id     as rubro_id,
  rubro.nombre as rubro,
  sub.id       as categoria_id,
  sub.nombre   as categoria,
  g.fuente,
  count(*)     as cantidad,
  sum(g.monto)::numeric(14,2) as total
from public.gastos g
join public.categorias_gasto sub on sub.id = g.categoria_id
join public.categorias_gasto rubro on rubro.id = sub.padre_id
where not g.anulado
group by 1, 2, 3, 4, 5, 6;

-- ---------------------------------------------------------------------
-- 20261119000013_rls.sql
-- ---------------------------------------------------------------------
-- Seguridad: RLS, permisos y Realtime.
-- Principio: el cliente LEE con RLS; toda escritura con reglas de negocio
-- (ventas, turnos, gastos, stock, efectivo, alertas) pasa por RPC security definer.
-- El CRUD simple de catálogo lo hace el admin directo sobre la tabla, con columnas acotadas.

-- 1) Partir de cero: nada para anon/authenticated, ni ahora ni en objetos futuros.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 2) RLS en todas las tablas.
alter table public.perfiles                enable row level security;
alter table public.cajas                   enable row level security;
alter table public.turnos                  enable row level security;
alter table public.categorias_servicio     enable row level security;
alter table public.servicios               enable row level security;
alter table public.certificados            enable row level security;
alter table public.movimientos_certificado enable row level security;
alter table public.compras_certificado     enable row level security;
alter table public.caja_efectivo           enable row level security;
alter table public.movimientos_efectivo    enable row level security;
alter table public.categorias_gasto        enable row level security;
alter table public.gastos                  enable row level security;
alter table public.alertas                 enable row level security;
alter table public.ventas                  enable row level security;

-- 3) Funciones expuestas a usuarios autenticados.
grant execute on function
  public.rol_actual(),
  public.es_admin(),
  public.fecha_local(timestamptz),
  public.certificado_para_servicio(bigint),
  public.abrir_turno(bigint),
  public.cerrar_turno(text, bigint),
  public.registrar_venta(bigint, public.medio_pago, text),
  public.anular_venta(bigint, text),
  public.registrar_gasto(bigint, numeric, public.fuente_fondos, text),
  public.anular_gasto(bigint, text),
  public.registrar_compra_certificado(bigint, integer, numeric, public.fuente_fondos, text),
  public.ajustar_stock_certificado(bigint, integer, text),
  public.movimiento_efectivo(public.tipo_mov_efectivo, numeric, text),
  public.marcar_alertas_leidas(bigint[])
to authenticated;

-- 4) Lectura.
grant select on
  public.perfiles, public.cajas, public.turnos, public.categorias_servicio, public.servicios,
  public.certificados, public.movimientos_certificado, public.compras_certificado,
  public.caja_efectivo, public.movimientos_efectivo, public.categorias_gasto, public.gastos,
  public.alertas, public.ventas,
  public.v_movimientos_caja, public.v_turnos, public.v_resumen_diario,
  public.v_stock_certificados, public.v_gastos_por_categoria
to authenticated;

-- Catálogos: cualquier usuario activo.
create policy "usuarios activos leen cajas" on public.cajas
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen categorias de servicio" on public.categorias_servicio
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen servicios" on public.servicios
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen certificados" on public.certificados
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen categorias de gasto" on public.categorias_gasto
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "usuarios activos leen saldo de efectivo" on public.caja_efectivo
  for select to authenticated using ((select public.rol_actual()) is not null);

-- Datos propios (o todo, si es admin).
create policy "propio perfil o admin" on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or (select public.es_admin()));
create policy "turnos propios o admin" on public.turnos
  for select to authenticated
  using ((usuario_id = (select auth.uid()) and (select public.rol_actual()) is not null)
         or (select public.es_admin()));
create policy "ventas propias o admin" on public.ventas
  for select to authenticated
  using ((usuario_id = (select auth.uid()) and (select public.rol_actual()) is not null)
         or (select public.es_admin()));
create policy "gastos propios o admin" on public.gastos
  for select to authenticated
  using ((usuario_id = (select auth.uid()) and (select public.rol_actual()) is not null)
         or (select public.es_admin()));

-- Solo admin.
create policy "admin lee kardex" on public.movimientos_certificado
  for select to authenticated using ((select public.es_admin()));
create policy "admin lee compras" on public.compras_certificado
  for select to authenticated using ((select public.es_admin()));
create policy "admin lee libro de efectivo" on public.movimientos_efectivo
  for select to authenticated using ((select public.es_admin()));
create policy "admin lee alertas" on public.alertas
  for select to authenticated using ((select public.es_admin()));

-- 5) Escritura directa del admin (CRUD de catálogo), con columnas acotadas.
grant insert (nombre, activa), update (nombre, activa), delete on public.cajas to authenticated;
grant insert (nombre, activa), update (nombre, activa), delete on public.categorias_servicio to authenticated;
grant insert (nombre, categoria_id, precio, requiere_certificado, activo),
      update (nombre, categoria_id, precio, requiere_certificado, activo),
      delete on public.servicios to authenticated;
-- stock_hojas y costo_promedio quedan fuera: solo los mueven las RPC.
grant insert (nombre, unidad_compra, hojas_por_unidad, alcance, categoria_id, servicio_id, stock_minimo, activo),
      update (nombre, unidad_compra, hojas_por_unidad, alcance, categoria_id, servicio_id, stock_minimo, activo),
      delete on public.certificados to authenticated;
grant insert (nombre, padre_id, habilitada_caja, activa),
      update (nombre, padre_id, habilitada_caja, activa),
      delete on public.categorias_gasto to authenticated;

create policy "admin crea cajas" on public.cajas for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita cajas" on public.cajas for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra cajas" on public.cajas for delete to authenticated using ((select public.es_admin()));

create policy "admin crea categorias de servicio" on public.categorias_servicio for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita categorias de servicio" on public.categorias_servicio for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra categorias de servicio" on public.categorias_servicio for delete to authenticated using ((select public.es_admin()));

create policy "admin crea servicios" on public.servicios for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita servicios" on public.servicios for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra servicios" on public.servicios for delete to authenticated using ((select public.es_admin()));

create policy "admin crea certificados" on public.certificados for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita certificados" on public.certificados for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra certificados" on public.certificados for delete to authenticated using ((select public.es_admin()));

create policy "admin crea categorias de gasto" on public.categorias_gasto for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita categorias de gasto" on public.categorias_gasto for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra categorias de gasto" on public.categorias_gasto for delete to authenticated using ((select public.es_admin()));

-- 6) Realtime para el contador de alertas (respeta la RLS de select).
alter publication supabase_realtime add table public.alertas;

-- ---------------------------------------------------------------------
-- 20261120000014_endurecimiento_seguridad.sql
-- ---------------------------------------------------------------------
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

commit;
