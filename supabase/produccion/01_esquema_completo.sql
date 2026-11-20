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
--   15. 20261120000015_catalogo_nombres.sql
--   16. 20261120000016_privilegios_funciones.sql
--   17. 20261120000017_costos_solo_admin.sql
--   18. 20261120000018_certificados_admin.sql
--   19. 20261120000019_ajuste_stock_tope.sql
--   20. 20261120000020_stock_tope.sql
--   21. 20261120000021_corregir_compra.sql
--   22. 20261120000022_cajas_para_turno.sql
--   23. 20261120000023_facturacion_arca.sql
--   24. 20261120000024_arca_safeupdate.sql
--   25. 20261120000025_arca_emision_segura.sql
--
-- Después de ejecutarlo, registrá las migraciones como aplicadas para que
-- `supabase db push` no intente aplicarlas de nuevo:
--   npx supabase migration repair --status applied 20261119000001 20261119000002 20261119000003 20261119000004 20261119000005 20261119000006 20261119000007 20261119000008 20261119000009 20261119000010 20261119000011 20261119000012 20261119000013 20261120000014 20261120000015 20261120000016 20261120000017 20261120000018 20261120000019 20261120000020 20261120000021 20261120000022 20261120000023 20261120000024 20261120000025
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

-- ---------------------------------------------------------------------
-- 20261120000015_catalogo_nombres.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261120000016_privilegios_funciones.sql
-- ---------------------------------------------------------------------
-- Corrige la base de privilegios de funciones.
-- La migración 013 usó `alter default privileges in schema public revoke execute ... from public`,
-- pero los privilegios por defecto A NIVEL DE ESQUEMA no pueden quitar el EXECUTE que PUBLIC recibe
-- de fábrica: toda función creada después quedaba ejecutable por anon (ej. _validar_monto de la 014).
-- Se corrige a nivel global para el rol que crea los objetos (postgres) y se limpia lo existente.

alter default privileges for role postgres revoke execute on functions from public;

-- La 013 ya lo había hecho con las funciones de ese momento; esto cubre las creadas después.
-- Las RPC para usuarios conservan sus grants explícitos a `authenticated`.
revoke execute on all functions in schema public from public;

-- ---------------------------------------------------------------------
-- 20261120000017_costos_solo_admin.sql
-- ---------------------------------------------------------------------
-- Costos de certificados: SOLO el administrador (decisión del negocio, 2026-11-20).
-- El cajero nunca ve costo por hoja, costo promedio, valor del stock, costo de una venta ni margen.
--
-- Los privilegios por columna son por ROL y admin y cajero son ambos `authenticated`, así que:
--   - lo que lee cualquier usuario (tablas y vistas) queda SIN columnas de costo;
--   - el admin lee los costos solo por RPC `security definer` que exigen admin.
-- Columnas nuevas en certificados/ventas no quedan legibles hasta que se las agregue al grant.

-- 1) Tablas: lectura por columna, sin costos.
revoke select on public.certificados, public.ventas from authenticated;

grant select (id, nombre, unidad_compra, hojas_por_unidad, alcance, categoria_id, servicio_id,
              stock_minimo, stock_hojas, activo, creado_en, actualizado_en)
  on public.certificados to authenticated;

grant select (id, turno_id, caja_id, usuario_id, servicio_id, servicio_nombre, categoria_id, precio,
              medio_pago, patente, certificado_id, sin_stock, anulada, anulada_motivo, anulada_por,
              anulada_en, creado_en)
  on public.ventas to authenticated;
-- movimientos_certificado, compras_certificado y movimientos_efectivo ya son solo admin (RLS).

-- 2) Stock para todos: sin costo ni valuación.
drop view public.v_stock_certificados;
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
  end                                                as aplica_a,
  c.stock_minimo,
  c.stock_hojas,
  case
    when c.stock_hojas = 0               then 'sin_stock'
    when c.stock_hojas <= c.stock_minimo then 'bajo'
    else 'ok'
  end                                                as semaforo,
  c.activo
from public.certificados c
left join public.categorias_servicio cs on cs.id = c.categoria_id
left join public.servicios s on s.id = c.servicio_id;

grant select on public.v_stock_certificados to authenticated;

-- 3) Stock valorizado: solo admin.
create function public.stock_certificados_valorizado()
returns table (
  id               bigint,
  nombre           text,
  unidad_compra    public.unidad_compra,
  hojas_por_unidad integer,
  alcance          public.alcance_certificado,
  categoria_id     bigint,
  servicio_id      bigint,
  aplica_a         text,
  stock_minimo     integer,
  stock_hojas      integer,
  costo_promedio   numeric(14,2),
  valor_stock      numeric(14,2),
  semaforo         text,
  activo           boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();

  return query
  select
    v.id, v.nombre, v.unidad_compra, v.hojas_por_unidad, v.alcance, v.categoria_id,
    v.servicio_id, v.aplica_a, v.stock_minimo, v.stock_hojas,
    round(c.costo_promedio, 2)::numeric(14,2),
    round(c.stock_hojas * c.costo_promedio, 2)::numeric(14,2),
    v.semaforo, v.activo
  from public.v_stock_certificados v
  join public.certificados c on c.id = v.id
  order by v.activo desc, v.nombre;
end;
$$;

-- 4) Resumen diario con costo y margen: solo admin (reemplaza a la vista v_resumen_diario).
drop view public.v_resumen_diario;

create function public.resumen_diario(p_desde date default null, p_hasta date default null)
returns table (
  fecha               date,
  cantidad_ventas     bigint,
  total_ventas        numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  total_tarjeta       numeric(14,2),
  total_gastos        numeric(14,2),
  flujo_neto          numeric(14,2),
  costo_certificados  numeric(14,2),
  margen_bruto        numeric(14,2),
  ventas_sin_stock    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  with mov as (
    select public.fecha_local(v.creado_en) as dia, v.precio as venta, v.medio_pago,
           v.costo_certificado as costo, v.sin_stock, 0::numeric as gasto
    from public.ventas v where not v.anulada
    union all
    select public.fecha_local(g.creado_en), 0, null, 0, false, g.monto
    from public.gastos g where not g.anulado
  )
  select
    m.dia,
    count(*) filter (where m.medio_pago is not null),
    coalesce(sum(m.venta), 0)::numeric(14,2),
    coalesce(sum(m.venta) filter (where m.medio_pago = 'efectivo'), 0)::numeric(14,2),
    coalesce(sum(m.venta) filter (where m.medio_pago = 'transferencia'), 0)::numeric(14,2),
    coalesce(sum(m.venta) filter (where m.medio_pago = 'tarjeta'), 0)::numeric(14,2),
    coalesce(sum(m.gasto), 0)::numeric(14,2),
    (coalesce(sum(m.venta), 0) - coalesce(sum(m.gasto), 0))::numeric(14,2),
    round(coalesce(sum(m.costo), 0), 2)::numeric(14,2),
    round(coalesce(sum(m.venta), 0) - coalesce(sum(m.costo), 0), 2)::numeric(14,2),
    count(*) filter (where m.sin_stock)
  from mov m
  where (p_desde is null or m.dia >= p_desde)
    and (p_hasta is null or m.dia <= p_hasta)
  group by m.dia
  order by m.dia;
end;
$$;

-- PUBLIC ya no recibe EXECUTE por defecto (migración 016): solo `authenticated`.
grant execute on function public.stock_certificados_valorizado() to authenticated;
grant execute on function public.resumen_diario(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 20261120000018_certificados_admin.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261120000019_ajuste_stock_tope.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261120000020_stock_tope.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261120000021_corregir_compra.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20261120000022_cajas_para_turno.sql
-- ---------------------------------------------------------------------
-- Fase 4: para abrir un turno el cajero necesita saber qué cajas están libres. La RLS de `turnos`
-- solo le muestra los propios, así que no puede verlo leyendo la tabla: esta función expone lo
-- mínimo (si la caja está ocupada y por quién), sin totales ni datos del turno ajeno.

create function public.cajas_para_turno()
returns table (id bigint, nombre text, ocupada boolean, ocupada_por text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_usuario();

  return query
  select c.id, c.nombre, t.id is not null, p.nombre
  from public.cajas c
  left join public.turnos t on t.caja_id = c.id and t.cerrado_en is null
  left join public.perfiles p on p.id = t.usuario_id
  where c.activa
  order by c.nombre;
end;
$$;

revoke all on function public.cajas_para_turno() from public, anon;
grant execute on function public.cajas_para_turno() to authenticated;

-- ---------------------------------------------------------------------
-- 20261120000023_facturacion_arca.sql
-- ---------------------------------------------------------------------
-- Facturación electrónica ARCA (fase 4b, decisiones en CLAUDE.md §9).
--
-- Fuentes (ver docs/arca/LEEME.md): Manual del desarrollador WSFEv1 v4.7 (revisión 1/9/2026) y
-- "Especificaciones del QR incluido en las facturas electrónicas" (ARCA, 2025).
--
-- Reparto de responsabilidades:
--   * La BD decide qué se factura y cómo: clase A/B según la tabla de ARCA (FEParamGetCondicionIvaReceptor),
--     tipo de comprobante, neto/IVA (precio con IVA 21 % incluido), documento del receptor, permisos,
--     numeración serializada por punto de venta y tipo, estados y nota de crédito al anular.
--   * La Edge Function `arca` (service role) solo habla con ARCA: pide el turno de emisión con
--     `_arca_tomar`, registra el número antes de enviarlo y guarda el resultado.
--   * El certificado y la clave privada viven en Supabase Vault. Solo el service role los lee.

-- ---------------------------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------------------------
create type public.ambiente_arca as enum ('homologacion', 'produccion');
create type public.tipo_comprobante as enum ('factura', 'nota_credito');
-- pendiente: lista para emitir (o a reconciliar, si tiene numero_intentado).
-- procesando: la Edge Function la está emitiendo. autorizado: tiene CAE.
-- rechazado: ARCA la rechazó (se puede corregir y reintentar). cancelado: venta anulada sin CAE.
create type public.estado_comprobante as enum
  ('pendiente', 'procesando', 'autorizado', 'rechazado', 'cancelado');

-- CUIT/CUIL con dígito verificador (módulo 11). Pública: la usan CHECK de tablas que edita el admin.
create function public.cuit_valido(p_cuit text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_pesos int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  v_suma  int := 0;
  v_dv    int;
begin
  if p_cuit is null or p_cuit !~ '^\d{11}$' then
    return false;
  end if;
  for i in 1..10 loop
    v_suma := v_suma + substr(p_cuit, i, 1)::int * v_pesos[i];
  end loop;
  v_dv := 11 - (v_suma % 11);
  if v_dv = 11 then
    v_dv := 0;
  elsif v_dv = 10 then
    return false;
  end if;
  return v_dv = substr(p_cuit, 11, 1)::int;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Configuración (fila única)
-- ---------------------------------------------------------------------------------------------
create table public.arca_configuracion (
  id                       boolean primary key default true check (id),
  cuit                     text check (cuit is null or public.cuit_valido(cuit)),
  razon_social             text check (char_length(razon_social) <= 200),
  domicilio                text check (char_length(domicilio) <= 300),
  inicio_actividades       date,
  iibb                     text check (char_length(iibb) <= 50),
  punto_venta              integer check (punto_venta between 1 and 99998),
  ambiente                 public.ambiente_arca not null default 'homologacion',
  -- Monto desde el cual el consumidor final debe identificarse (RG 5700/2025: $10.000.000).
  tope_identificacion      numeric(14,2) not null default 10000000
    check (tope_identificacion > 0 and tope_identificacion <> 'NaN'::numeric),
  -- Metadatos del certificado (los escribe la Edge Function al subirlo).
  certificado_cuit         text,
  certificado_sujeto       text,
  certificado_vence        timestamptz,
  certificado_cargado_en   timestamptz,
  -- Ids de los secretos en Vault: nadie los lee salvo el service role.
  certificado_secreto_id   uuid,
  clave_secreto_id         uuid,
  condiciones_actualizadas_en timestamptz,
  actualizado_en           timestamptz not null default now(),
  actualizado_por          uuid references public.perfiles (id)
);
insert into public.arca_configuracion (id) values (true);

create function public._tg_arca_configuracion_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.razon_social := nullif(regexp_replace(btrim(new.razon_social), '\s+', ' ', 'g'), '');
  new.domicilio := nullif(regexp_replace(btrim(new.domicilio), '\s+', ' ', 'g'), '');
  new.iibb := nullif(btrim(new.iibb), '');
  new.cuit := nullif(regexp_replace(new.cuit, '\D', '', 'g'), '');
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
  return new;
end;
$$;
create trigger arca_configuracion_normalizar
  before update on public.arca_configuracion
  for each row execute function public._tg_arca_configuracion_normalizar();

-- Condiciones frente al IVA del receptor y clases de comprobante que admite cada una, tal como las
-- devuelve ARCA (FEParamGetCondicionIvaReceptor). Las actualiza la Edge Function.
create table public.arca_condiciones_iva (
  id             integer primary key,
  descripcion    text not null check (char_length(descripcion) <= 250),
  clases         text[] not null,
  actualizado_en timestamptz not null default now()
);

-- Ticket de acceso de WSAA (válido ~12 h; WSAA rechaza pedir otro mientras haya uno vigente).
create table public.arca_tokens (
  ambiente public.ambiente_arca not null,
  cuit     text not null,
  token    text not null,
  firma    text not null,
  expira   timestamptz not null,
  primary key (ambiente, cuit)
);

-- ---------------------------------------------------------------------------------------------
-- Comprobantes
-- ---------------------------------------------------------------------------------------------
create table public.comprobantes (
  id                        bigint generated always as identity primary key,
  venta_id                  bigint not null references public.ventas (id),
  tipo                      public.tipo_comprobante not null,
  asociado_id               bigint references public.comprobantes (id),
  clase                     text not null check (clase in ('A', 'B')),
  cbte_tipo                 smallint not null check (cbte_tipo in (1, 3, 6, 8)),
  ambiente                  public.ambiente_arca not null,
  cuit_emisor               text not null check (public.cuit_valido(cuit_emisor)),
  punto_venta               integer not null check (punto_venta between 1 and 99998),
  numero                    bigint check (numero between 1 and 99999999),
  numero_intentado          bigint check (numero_intentado between 1 and 99999999),
  estado                    public.estado_comprobante not null default 'pendiente',
  fecha                     date,
  fecha_servicio            date not null,
  doc_tipo                  smallint not null check (doc_tipo in (80, 96, 99)),
  doc_nro                   bigint not null check (doc_nro >= 0),
  receptor_nombre           text check (char_length(receptor_nombre) <= 200),
  condicion_iva_receptor_id integer not null references public.arca_condiciones_iva (id),
  neto                      numeric(12,2) not null check (neto > 0 and neto <> 'NaN'::numeric),
  iva                       numeric(12,2) not null check (iva >= 0 and iva <> 'NaN'::numeric),
  total                     numeric(12,2) not null check (total > 0 and total <> 'NaN'::numeric),
  cae                       text check (cae ~ '^\d{14}$'),
  cae_vencimiento           date,
  mensaje                   text check (char_length(mensaje) <= 2000),
  intentos                  integer not null default 0,
  procesando_desde          timestamptz,
  creado_por                uuid not null references public.perfiles (id),
  creado_en                 timestamptz not null default now(),
  actualizado_en            timestamptz not null default now(),
  autorizado_en             timestamptz,
  check (neto + iva = total),
  check ((tipo = 'nota_credito') = (asociado_id is not null)),
  check ((tipo = 'factura') = (cbte_tipo in (1, 6))),
  check ((clase = 'A') = (cbte_tipo in (1, 3))),
  check (clase <> 'A' or doc_tipo = 80),
  check (doc_tipo <> 99 or doc_nro = 0),
  check ((estado = 'autorizado') = (cae is not null and numero is not null and fecha is not null)),
  check ((estado = 'procesando') = (procesando_desde is not null))
);
-- Una factura y una nota de crédito por venta, como máximo.
create unique index comprobantes_venta_tipo on public.comprobantes (venta_id, tipo);
-- Numeración única por emisor, ambiente, punto de venta y tipo.
create unique index comprobantes_numero on public.comprobantes
  (ambiente, cuit_emisor, punto_venta, cbte_tipo, numero) where numero is not null;
-- Un solo comprobante emitiéndose a la vez por punto de venta y tipo (la numeración es correlativa).
create unique index comprobantes_un_procesando on public.comprobantes
  (ambiente, cuit_emisor, punto_venta, cbte_tipo) where estado = 'procesando';
create index comprobantes_estado on public.comprobantes (estado) where estado <> 'autorizado';

-- Log avanzado: cada llamada a ARCA, saneada (sin token, firma ni clave). Solo admin.
create table public.arca_intentos (
  id             bigint generated always as identity primary key,
  comprobante_id bigint references public.comprobantes (id),
  operacion      text not null check (operacion in
    ('wsaa', 'ultimo_autorizado', 'solicitar', 'consultar', 'condiciones', 'probar_conexion')),
  ambiente       public.ambiente_arca not null,
  exito          boolean not null,
  mensaje        text check (char_length(mensaje) <= 2000),
  errores        jsonb not null default '[]',
  observaciones  jsonb not null default '[]',
  solicitud      text check (char_length(solicitud) <= 100000),
  respuesta      text check (char_length(respuesta) <= 100000),
  duracion_ms    integer not null check (duracion_ms >= 0),
  usuario_id     uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index arca_intentos_comprobante on public.arca_intentos (comprobante_id, id desc);
create index arca_intentos_recientes on public.arca_intentos (id desc);

-- ---------------------------------------------------------------------------------------------
-- Reglas
-- ---------------------------------------------------------------------------------------------

-- Config lista para facturar; devuelve la fila o rechaza con un mensaje claro.
create function public._arca_config_lista()
returns public.arca_configuracion
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.arca_configuracion;
begin
  select * into v from public.arca_configuracion;
  if v.cuit is null or v.razon_social is null or v.domicilio is null
     or v.inicio_actividades is null or v.punto_venta is null then
    raise exception 'La facturación electrónica no está configurada: completá los datos del emisor en Configuración ARCA'
      using errcode = 'P0001';
  end if;
  if v.certificado_secreto_id is null or v.clave_secreto_id is null then
    raise exception 'Falta subir el certificado y la clave de ARCA en Configuración ARCA'
      using errcode = 'P0001';
  end if;
  if v.certificado_cuit is distinct from v.cuit then
    raise exception 'El certificado cargado es de otro CUIT (%): subí el certificado del CUIT %',
      v.certificado_cuit, v.cuit using errcode = 'P0001';
  end if;
  if v.certificado_vence <= now() then
    raise exception 'El certificado de ARCA venció el %: generá uno nuevo y subilo en Configuración ARCA',
      to_char(v.certificado_vence at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Precio con IVA 21 % incluido → neto e IVA (redondeo a 2 decimales; ARCA tolera 0,01).
create function public._neto_iva(p_total numeric, out neto numeric, out iva numeric)
language sql
immutable
set search_path = ''
as $$
  select round(p_total / 1.21, 2), p_total - round(p_total / 1.21, 2)
$$;

-- Prepara (o corrige, si todavía no se envió) la factura de una venta. Devuelve el comprobante en
-- estado pendiente: después la UI pide a la Edge Function que lo emita.
--   p_doc_tipo: 99 (consumidor final sin identificar, p_doc_nro = 0), 96 (DNI) u 80 (CUIT).
create function public.preparar_factura(
  p_venta_id bigint,
  p_condicion_iva_id integer,
  p_doc_tipo smallint,
  p_doc_nro bigint,
  p_receptor_nombre text default null
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := public._exigir_usuario();
  v_config    public.arca_configuracion := public._arca_config_lista();
  v_venta     public.ventas;
  v_condicion public.arca_condiciones_iva;
  v_actual    public.comprobantes;
  v_clase     text;
  v_nombre    text := nullif(regexp_replace(btrim(p_receptor_nombre), '\s+', ' ', 'g'), '');
  v_importes  record;
  v_resultado public.comprobantes;
begin
  select * into v_venta from public.ventas where id = p_venta_id for update;
  if v_venta.id is null then
    raise exception 'La venta no existe' using errcode = '22023';
  end if;
  if v_rol <> 'admin' and not exists (
    select 1 from public.turnos t
    where t.id = v_venta.turno_id and t.usuario_id = auth.uid() and t.cerrado_en is null
  ) then
    raise exception 'Solo podés facturar las ventas de tu turno abierto' using errcode = '42501';
  end if;
  if v_venta.anulada then
    raise exception 'La venta está anulada: no se puede facturar' using errcode = 'P0001';
  end if;
  if v_venta.precio <= 0 then
    raise exception 'Una venta de $ 0 no se factura' using errcode = 'P0001';
  end if;

  select * into v_condicion from public.arca_condiciones_iva where id = p_condicion_iva_id;
  if v_condicion.id is null then
    raise exception 'Elegí una condición frente al IVA válida' using errcode = '22023';
  end if;
  -- Clase según ARCA: B si la condición la admite (consumidor final, exento…); si no, A.
  v_clase := case
    when 'B' = any (v_condicion.clases) then 'B'
    when 'A' = any (v_condicion.clases) then 'A'
  end;
  if v_clase is null then
    raise exception 'A un receptor "%" no se le puede emitir Factura A ni B', v_condicion.descripcion
      using errcode = 'P0001';
  end if;

  -- Documento del receptor.
  if p_doc_tipo is null or p_doc_tipo not in (80, 96, 99) then
    raise exception 'Elegí el tipo de documento del cliente' using errcode = '22023';
  end if;
  if v_clase = 'A' and p_doc_tipo <> 80 then
    raise exception 'La Factura A requiere el CUIT del cliente' using errcode = 'P0001';
  end if;
  if p_doc_tipo = 99 then
    -- Sin identificar (DocTipo 99) solo el consumidor final: condición 5 según la tabla de
    -- "Condición frente al IVA del receptor" del manual WSFEv1.
    if v_condicion.id <> 5 then
      raise exception 'Para un cliente "%" ingresá su CUIT o DNI', v_condicion.descripcion
        using errcode = 'P0001';
    end if;
    if v_venta.precio >= v_config.tope_identificacion then
      raise exception 'Desde $ % hay que identificar al consumidor final con CUIT o DNI',
        translate(to_char(v_config.tope_identificacion, 'FM999,999,999,990.00'), ',.', '.,') using errcode = 'P0001';
    end if;
    p_doc_nro := 0;
    v_nombre := null;
  else
    if p_doc_tipo = 80 and (p_doc_nro is null or not public.cuit_valido(lpad(p_doc_nro::text, 11, '0'))) then
      raise exception 'El CUIT del cliente no es válido' using errcode = '22023';
    end if;
    if p_doc_tipo = 96 and (p_doc_nro is null or p_doc_nro not between 1000000 and 99999999) then
      raise exception 'El DNI del cliente no es válido' using errcode = '22023';
    end if;
    if v_nombre is null then
      raise exception 'Ingresá el nombre o la razón social del cliente' using errcode = '22023';
    end if;
    if char_length(v_nombre) > 200 then
      raise exception 'El nombre del cliente no puede superar los 200 caracteres' using errcode = '22023';
    end if;
  end if;

  select * into v_actual from public.comprobantes
  where venta_id = p_venta_id and tipo = 'factura' for update;
  if v_actual.estado = 'autorizado' then
    raise exception 'La venta ya está facturada (Factura % %-%)', v_actual.clase,
      lpad(v_actual.punto_venta::text, 5, '0'), lpad(v_actual.numero::text, 8, '0')
      using errcode = 'P0001';
  end if;
  if v_actual.estado = 'procesando' or v_actual.numero_intentado is not null then
    raise exception 'La factura de esta venta ya se envió a ARCA y falta confirmar el resultado: reintentá la emisión'
      using errcode = 'P0001';
  end if;

  select * into v_importes from public._neto_iva(v_venta.precio);

  if v_actual.id is null then
    insert into public.comprobantes (
      venta_id, tipo, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta, fecha_servicio,
      doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor_id, neto, iva, total, creado_por)
    values (
      v_venta.id, 'factura', v_clase, case v_clase when 'A' then 1 else 6 end,
      v_config.ambiente, v_config.cuit, v_config.punto_venta, public.fecha_local(v_venta.creado_en),
      p_doc_tipo, p_doc_nro, v_nombre, v_condicion.id, v_importes.neto, v_importes.iva,
      v_venta.precio, auth.uid())
    returning * into v_resultado;
  else
    -- Pendiente o rechazada y nunca enviada: se corrigen los datos del cliente.
    update public.comprobantes set
      clase = v_clase, cbte_tipo = case v_clase when 'A' then 1 else 6 end,
      ambiente = v_config.ambiente, cuit_emisor = v_config.cuit, punto_venta = v_config.punto_venta,
      doc_tipo = p_doc_tipo, doc_nro = p_doc_nro, receptor_nombre = v_nombre,
      condicion_iva_receptor_id = v_condicion.id, estado = 'pendiente', mensaje = null,
      actualizado_en = now()
    where id = v_actual.id
    returning * into v_resultado;
  end if;
  return v_resultado;
end;
$$;

-- Verifica que quien llama puede pedir la emisión de un comprobante (lo usa la Edge Function con el
-- JWT del usuario antes de tomarlo con el service role). Facturas: admin, o el cajero si la venta es
-- de su turno abierto. Notas de crédito: solo admin.
create function public.puede_emitir_comprobante(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol  public.rol_usuario := public._exigir_usuario();
  v_comp public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_rol <> 'admin' then
    if v_comp.tipo = 'nota_credito' then
      raise exception 'Solo un administrador puede emitir notas de crédito' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.ventas v join public.turnos t on t.id = v.turno_id
      where v.id = v_comp.venta_id and t.usuario_id = auth.uid() and t.cerrado_en is null
    ) then
      raise exception 'Solo podés facturar las ventas de tu turno abierto' using errcode = '42501';
    end if;
  end if;
  if v_comp.estado = 'autorizado' then
    raise exception 'El comprobante ya está autorizado' using errcode = 'P0001';
  end if;
  if v_comp.estado = 'cancelado' then
    raise exception 'El comprobante está cancelado (la venta se anuló)' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- Toma el turno de emisión de un comprobante (service role). Un comprobante "procesando" hace más de
-- 2 minutos se considera abandonado (la función se cortó) y se puede retomar: su numero_intentado
-- obliga a reconciliar con FECompConsultar antes de pedir un número nuevo.
create function public._arca_tomar(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.arca_configuracion := public._arca_config_lista();
  v_comp   public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id for update;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_comp.estado in ('autorizado', 'cancelado') then
    raise exception 'El comprobante ya está %', v_comp.estado using errcode = 'P0001';
  end if;
  if v_comp.estado = 'procesando' and v_comp.procesando_desde > now() - interval '2 minutes' then
    raise exception 'El comprobante se está emitiendo en este momento: esperá unos segundos'
      using errcode = 'P0001';
  end if;

  if v_comp.numero_intentado is null then
    if v_comp.tipo = 'factura' then
      -- Todavía no se envió nada: se emite con la configuración vigente.
      v_comp.ambiente := v_config.ambiente;
      v_comp.cuit_emisor := v_config.cuit;
      v_comp.punto_venta := v_config.punto_venta;
    elsif (v_comp.ambiente, v_comp.cuit_emisor) is distinct from (v_config.ambiente, v_config.cuit) then
      raise exception 'La factura original se emitió en % con el CUIT %: la nota de crédito tiene que emitirse con esa misma configuración',
        v_comp.ambiente, v_comp.cuit_emisor using errcode = 'P0001';
    end if;
  elsif (v_comp.ambiente, v_comp.cuit_emisor) is distinct from (v_config.ambiente, v_config.cuit) then
    raise exception 'Este comprobante quedó a confirmar en % con el CUIT %: volvé a esa configuración para reconciliarlo',
      v_comp.ambiente, v_comp.cuit_emisor using errcode = 'P0001';
  end if;

  begin
    update public.comprobantes set
      ambiente = v_comp.ambiente, cuit_emisor = v_comp.cuit_emisor, punto_venta = v_comp.punto_venta,
      estado = 'procesando', procesando_desde = now(), intentos = intentos + 1, actualizado_en = now()
    where id = v_comp.id
    returning * into v_comp;
  exception when unique_violation then
    raise exception 'Hay otro comprobante del mismo tipo emitiéndose: probá de nuevo en unos segundos'
      using errcode = 'P0001';
  end;
  return v_comp;
end;
$$;

-- Antes de llamar a FECAESolicitar se guarda el número y la fecha que se van a pedir: si la
-- respuesta no llega, el próximo intento reconcilia ese número con FECompConsultar.
create function public._arca_registrar_numero(p_comprobante_id bigint, p_numero bigint, p_fecha date)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  update public.comprobantes
  set numero_intentado = p_numero, fecha = p_fecha, actualizado_en = now()
  where id = p_comprobante_id and estado = 'procesando'
  returning * into v_comp;
  if v_comp.id is null then
    raise exception 'El comprobante no está en emisión' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

create function public._arca_autorizar(
  p_comprobante_id bigint, p_numero bigint, p_fecha date, p_cae text, p_cae_vencimiento date,
  p_mensaje text default null
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  update public.comprobantes set
    estado = 'autorizado', numero = p_numero, numero_intentado = null, fecha = p_fecha,
    cae = p_cae, cae_vencimiento = p_cae_vencimiento, mensaje = left(p_mensaje, 2000),
    procesando_desde = null, autorizado_en = now(), actualizado_en = now()
  where id = p_comprobante_id and estado = 'procesando'
  returning * into v_comp;
  if v_comp.id is null then
    raise exception 'El comprobante no está en emisión' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- ARCA rechazó el comprobante (Resultado R): el número no se consumió.
create function public._arca_rechazar(p_comprobante_id bigint, p_mensaje text)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  update public.comprobantes set
    estado = 'rechazado', numero_intentado = null, fecha = null, mensaje = left(p_mensaje, 2000),
    procesando_desde = null, actualizado_en = now()
  where id = p_comprobante_id and estado = 'procesando'
  returning * into v_comp;
  if v_comp.id is null then
    raise exception 'El comprobante no está en emisión' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- Error de comunicación (o de autenticación) sin resultado de ARCA: vuelve a pendiente. Si se
-- llegó a registrar un número, queda para reconciliar.
create function public._arca_liberar(p_comprobante_id bigint, p_mensaje text)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  update public.comprobantes set
    estado = 'pendiente', mensaje = left(p_mensaje, 2000), procesando_desde = null,
    fecha = case when numero_intentado is null then null else fecha end, actualizado_en = now()
  where id = p_comprobante_id and estado = 'procesando'
  returning * into v_comp;
  if v_comp.id is null then
    raise exception 'El comprobante no está en emisión' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- Reconciliación: el número intentado no figura en ARCA, así que nunca se emitió. Se descarta y el
-- comprobante sigue en emisión para pedir un número nuevo.
create function public._arca_descartar_numero(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  update public.comprobantes set numero_intentado = null, fecha = null, actualizado_en = now()
  where id = p_comprobante_id and estado = 'procesando'
  returning * into v_comp;
  if v_comp.id is null then
    raise exception 'El comprobante no está en emisión' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

create function public._arca_registrar_intento(
  p_comprobante_id bigint, p_operacion text, p_ambiente public.ambiente_arca, p_exito boolean,
  p_mensaje text, p_errores jsonb, p_observaciones jsonb, p_solicitud text, p_respuesta text,
  p_duracion_ms integer, p_usuario_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.arca_intentos (comprobante_id, operacion, ambiente, exito, mensaje, errores,
    observaciones, solicitud, respuesta, duracion_ms, usuario_id)
  values (p_comprobante_id, p_operacion, p_ambiente, p_exito, left(p_mensaje, 2000),
    coalesce(p_errores, '[]'), coalesce(p_observaciones, '[]'), left(p_solicitud, 100000),
    left(p_respuesta, 100000), greatest(p_duracion_ms, 0), p_usuario_id)
$$;

-- Reemplaza la tabla de condiciones con lo que devolvió ARCA: [{id, descripcion, clases: [..]}].
create function public._arca_actualizar_condiciones(p_condiciones jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cantidad integer;
begin
  if jsonb_typeof(p_condiciones) <> 'array' or jsonb_array_length(p_condiciones) = 0 then
    raise exception 'ARCA no devolvió condiciones frente al IVA' using errcode = '22023';
  end if;
  insert into public.arca_condiciones_iva (id, descripcion, clases, actualizado_en)
  select (c ->> 'id')::int, c ->> 'descripcion',
         array(select jsonb_array_elements_text(c -> 'clases')), now()
  from jsonb_array_elements(p_condiciones) c
  on conflict (id) do update
    set descripcion = excluded.descripcion, clases = excluded.clases, actualizado_en = now();
  get diagnostics v_cantidad = row_count;
  update public.arca_configuracion set condiciones_actualizadas_en = now();
  return v_cantidad;
end;
$$;

create function public._arca_token(p_ambiente public.ambiente_arca, p_cuit text)
returns public.arca_tokens
language sql
stable
security definer
set search_path = ''
as $$
  -- Margen de 10 minutos para no usar un ticket a punto de vencer.
  select * from public.arca_tokens
  where ambiente = p_ambiente and cuit = p_cuit and expira > now() + interval '10 minutes'
$$;

create function public._arca_guardar_token(
  p_ambiente public.ambiente_arca, p_cuit text, p_token text, p_firma text, p_expira timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.arca_tokens (ambiente, cuit, token, firma, expira)
  values (p_ambiente, p_cuit, p_token, p_firma, p_expira)
  on conflict (ambiente, cuit) do update
    set token = excluded.token, firma = excluded.firma, expira = excluded.expira
$$;

-- Certificado y clave en Vault (los sube el admin por la Edge Function, que valida que se
-- correspondan y extrae el CUIT y el vencimiento).
create function public._arca_guardar_credenciales(
  p_certificado text, p_clave text, p_cuit text, p_sujeto text, p_vence timestamptz,
  p_usuario_id uuid
)
returns public.arca_configuracion
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.arca_configuracion;
begin
  select * into v_config from public.arca_configuracion for update;
  if v_config.certificado_secreto_id is null then
    v_config.certificado_secreto_id := vault.create_secret(p_certificado, 'arca_certificado',
      'Certificado X.509 de ARCA (WSAA)');
    v_config.clave_secreto_id := vault.create_secret(p_clave, 'arca_clave',
      'Clave privada del certificado de ARCA');
  else
    perform vault.update_secret(v_config.certificado_secreto_id, p_certificado);
    perform vault.update_secret(v_config.clave_secreto_id, p_clave);
  end if;
  update public.arca_configuracion set
    certificado_secreto_id = v_config.certificado_secreto_id,
    clave_secreto_id = v_config.clave_secreto_id,
    certificado_cuit = p_cuit, certificado_sujeto = left(p_sujeto, 500),
    certificado_vence = p_vence, certificado_cargado_en = now(), actualizado_por = p_usuario_id
  returning * into v_config;
  -- Un certificado nuevo invalida los tickets de acceso anteriores.
  delete from public.arca_tokens where true;
  return v_config;
end;
$$;

create function public._arca_credenciales(out certificado text, out clave text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where id = c.certificado_secreto_id),
    (select decrypted_secret from vault.decrypted_secrets where id = c.clave_secreto_id)
  from public.arca_configuracion c
$$;

-- ---------------------------------------------------------------------------------------------
-- Anular una venta facturada: nota de crédito automática (pendiente de emitir)
-- ---------------------------------------------------------------------------------------------
create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta   public.ventas;
  v_motivo  text;
  v_factura public.comprobantes;
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

  select * into v_factura from public.comprobantes
  where venta_id = p_venta_id and tipo = 'factura' for update;
  if v_factura.estado = 'procesando' or v_factura.numero_intentado is not null then
    raise exception 'La factura de esta venta se envió a ARCA y falta confirmar el resultado: reintentá la emisión y después anulá la venta'
      using errcode = 'P0001';
  end if;

  update public.ventas
  set anulada = true, anulada_motivo = v_motivo, anulada_por = auth.uid(), anulada_en = now()
  where id = p_venta_id
  returning * into v_venta;

  if v_venta.medio_pago = 'efectivo' and v_venta.precio > 0 then
    perform public._mover_efectivo('anulacion_venta', -v_venta.precio,
      'Anulación de venta #' || v_venta.id || ': ' || v_motivo, null, v_venta.id, null);
  end if;

  if v_factura.estado = 'autorizado' then
    insert into public.comprobantes (
      venta_id, tipo, asociado_id, clase, cbte_tipo, ambiente, cuit_emisor, punto_venta,
      fecha_servicio, doc_tipo, doc_nro, receptor_nombre, condicion_iva_receptor_id,
      neto, iva, total, creado_por)
    values (
      v_venta.id, 'nota_credito', v_factura.id, v_factura.clase,
      case v_factura.clase when 'A' then 3 else 8 end, v_factura.ambiente, v_factura.cuit_emisor,
      v_factura.punto_venta, v_factura.fecha_servicio, v_factura.doc_tipo, v_factura.doc_nro,
      v_factura.receptor_nombre, v_factura.condicion_iva_receptor_id,
      v_factura.neto, v_factura.iva, v_factura.total, auth.uid());
  elsif v_factura.id is not null then
    -- Nunca llegó a ARCA: no hay nada que compensar.
    update public.comprobantes
    set estado = 'cancelado', mensaje = 'Venta anulada antes de facturarse', actualizado_en = now()
    where id = v_factura.id;
  end if;

  return v_venta;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Vista para la UI: comprobante con su venta, el asociado y el QR (RG 4291, especificación ARCA)
-- ---------------------------------------------------------------------------------------------
create view public.v_comprobantes
with (security_invoker = true)
as
select
  c.id, c.venta_id, v.turno_id, c.tipo, c.asociado_id, c.clase, c.cbte_tipo, c.ambiente,
  c.cuit_emisor, c.punto_venta, c.numero, c.estado, c.fecha, c.fecha_servicio, c.doc_tipo,
  c.doc_nro, c.receptor_nombre, c.condicion_iva_receptor_id, ci.descripcion as condicion_iva_receptor,
  c.neto, c.iva, c.total, c.cae, c.cae_vencimiento, c.mensaje, c.intentos,
  (c.numero_intentado is not null) as a_reconciliar, c.creado_en, c.autorizado_en,
  v.servicio_nombre, v.patente,
  a.cbte_tipo as asociado_cbte_tipo, a.punto_venta as asociado_punto_venta,
  a.numero as asociado_numero, a.fecha as asociado_fecha,
  case when c.estado = 'autorizado' then
    'https://www.arca.gob.ar/fe/qr/?p=' || replace(encode(convert_to(jsonb_build_object(
      'ver', 1,
      'fecha', to_char(c.fecha, 'YYYY-MM-DD'),
      'cuit', c.cuit_emisor::bigint,
      'ptoVta', c.punto_venta,
      'tipoCmp', c.cbte_tipo,
      'nroCmp', c.numero,
      'importe', c.total,
      'moneda', 'PES',
      'ctz', 1,
      'tipoDocRec', c.doc_tipo,
      'nroDocRec', c.doc_nro,
      'tipoCodAut', 'E',
      'codAut', c.cae::bigint
    )::text, 'UTF8'), 'base64'), E'\n', '')
  end as qr_url
from public.comprobantes c
join public.ventas v on v.id = c.venta_id
join public.arca_condiciones_iva ci on ci.id = c.condicion_iva_receptor_id
left join public.comprobantes a on a.id = c.asociado_id;

-- ---------------------------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------------------------
alter table public.arca_configuracion   enable row level security;
alter table public.arca_condiciones_iva enable row level security;
alter table public.arca_tokens          enable row level security;
alter table public.comprobantes         enable row level security;
alter table public.arca_intentos        enable row level security;

-- Datos del emisor: los imprime cualquiera que factura. Los ids de Vault, nunca.
grant select (id, cuit, razon_social, domicilio, inicio_actividades, iibb, punto_venta, ambiente,
  tope_identificacion, certificado_cuit, certificado_sujeto, certificado_vence,
  certificado_cargado_en, condiciones_actualizadas_en, actualizado_en)
  on public.arca_configuracion to authenticated;
grant update (cuit, razon_social, domicilio, inicio_actividades, iibb, punto_venta, ambiente,
  tope_identificacion)
  on public.arca_configuracion to authenticated;
create policy "usuarios activos leen la configuracion de arca" on public.arca_configuracion
  for select to authenticated using ((select public.rol_actual()) is not null);
create policy "admin edita la configuracion de arca" on public.arca_configuracion
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

grant select on public.arca_condiciones_iva to authenticated;
create policy "usuarios activos leen condiciones de iva" on public.arca_condiciones_iva
  for select to authenticated using ((select public.rol_actual()) is not null);

-- arca_tokens: sin grants ni políticas para authenticated (solo service role).

grant select on public.comprobantes, public.v_comprobantes to authenticated;
create policy "comprobantes de ventas propias o admin" on public.comprobantes
  for select to authenticated
  using ((select public.es_admin())
         or ((select public.rol_actual()) is not null and exists (
           select 1 from public.ventas v
           where v.id = comprobantes.venta_id and v.usuario_id = (select auth.uid()))));

grant select on public.arca_intentos to authenticated;
create policy "admin lee el log de arca" on public.arca_intentos
  for select to authenticated using ((select public.es_admin()));

-- cuit_valido la usan los CHECK de tablas que el admin edita: necesita EXECUTE.
grant execute on function
  public.cuit_valido(text),
  public.preparar_factura(bigint, integer, smallint, bigint, text),
  public.puede_emitir_comprobante(bigint)
to authenticated;

-- Service role (Edge Function `arca`): funciones internas y lectura de lo necesario para emitir.
grant execute on function
  public._arca_config_lista(),
  public._arca_tomar(bigint),
  public._arca_registrar_numero(bigint, bigint, date),
  public._arca_autorizar(bigint, bigint, date, text, date, text),
  public._arca_rechazar(bigint, text),
  public._arca_liberar(bigint, text),
  public._arca_descartar_numero(bigint),
  public._arca_registrar_intento(bigint, text, public.ambiente_arca, boolean, text, jsonb, jsonb,
    text, text, integer, uuid),
  public._arca_actualizar_condiciones(jsonb),
  public._arca_token(public.ambiente_arca, text),
  public._arca_guardar_token(public.ambiente_arca, text, text, text, timestamptz),
  public._arca_guardar_credenciales(text, text, text, text, timestamptz, uuid),
  public._arca_credenciales()
to service_role;
grant select on public.arca_configuracion, public.arca_condiciones_iva, public.comprobantes,
  public.v_comprobantes, public.ventas
to service_role;

-- ---------------------------------------------------------------------
-- 20261120000024_arca_safeupdate.sql
-- ---------------------------------------------------------------------
-- Corrige dos funciones de la migración 023 que actualizaban la fila única de
-- arca_configuracion con un UPDATE sin WHERE. En Supabase, las sesiones de la API cargan
-- pg-safeupdate, que rechaza todo UPDATE/DELETE sin WHERE ("UPDATE requires a WHERE clause"):
-- subir el certificado y actualizar las condiciones de IVA fallaban desde la Edge Function.

create or replace function public._arca_actualizar_condiciones(p_condiciones jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cantidad integer;
begin
  if jsonb_typeof(p_condiciones) <> 'array' or jsonb_array_length(p_condiciones) = 0 then
    raise exception 'ARCA no devolvió condiciones frente al IVA' using errcode = '22023';
  end if;
  insert into public.arca_condiciones_iva (id, descripcion, clases, actualizado_en)
  select (c ->> 'id')::int, c ->> 'descripcion',
         array(select jsonb_array_elements_text(c -> 'clases')), now()
  from jsonb_array_elements(p_condiciones) c
  on conflict (id) do update
    set descripcion = excluded.descripcion, clases = excluded.clases, actualizado_en = now();
  get diagnostics v_cantidad = row_count;
  update public.arca_configuracion set condiciones_actualizadas_en = now() where id;
  return v_cantidad;
end;
$$;

create or replace function public._arca_guardar_credenciales(
  p_certificado text, p_clave text, p_cuit text, p_sujeto text, p_vence timestamptz,
  p_usuario_id uuid
)
returns public.arca_configuracion
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.arca_configuracion;
begin
  select * into v_config from public.arca_configuracion where id for update;
  if v_config.certificado_secreto_id is null then
    v_config.certificado_secreto_id := vault.create_secret(p_certificado, 'arca_certificado',
      'Certificado X.509 de ARCA (WSAA)');
    v_config.clave_secreto_id := vault.create_secret(p_clave, 'arca_clave',
      'Clave privada del certificado de ARCA');
  else
    perform vault.update_secret(v_config.certificado_secreto_id, p_certificado);
    perform vault.update_secret(v_config.clave_secreto_id, p_clave);
  end if;
  update public.arca_configuracion set
    certificado_secreto_id = v_config.certificado_secreto_id,
    clave_secreto_id = v_config.clave_secreto_id,
    certificado_cuit = p_cuit, certificado_sujeto = left(p_sujeto, 500),
    certificado_vence = p_vence, certificado_cargado_en = now(), actualizado_por = p_usuario_id
  where id
  returning * into v_config;
  -- Un certificado nuevo invalida los tickets de acceso anteriores.
  delete from public.arca_tokens where true;
  return v_config;
end;
$$;

-- ---------------------------------------------------------------------
-- 20261120000025_arca_emision_segura.sql
-- ---------------------------------------------------------------------
-- Emisión ARCA más segura (auditoría de seguridad y revisión de la fase 4b, 2026-11-20).
--
-- 1. Numeración reservada mientras haya un número sin confirmar: antes solo se impedía emitir dos
--    comprobantes a la vez ("procesando"). Si una emisión quedaba "a confirmar" (número N enviado
--    sin respuesta), otro comprobante del mismo punto de venta y tipo podía recibir N; al
--    reconciliar, el primero tomaba como propio el N del otro y quedaba trabado para siempre.
--    Ahora nadie más emite en ese punto de venta y tipo hasta reconciliar el pendiente.
-- 2. Toma con identificador: cada `_arca_tomar` genera `toma` y todas las funciones que cierran la
--    emisión lo exigen. Una ejecución vieja (que siguió viva después de que otra retomó el
--    comprobante) ya no puede pisar el estado. El plazo para retomar una emisión "abandonada" pasa
--    de 2 a 10 minutos: por encima del tiempo máximo de una Edge Function.
-- 3. Foto del emisor: razón social, domicilio, IIBB e inicio de actividades quedan guardados en el
--    comprobante al enviarlo, así la reimpresión muestra lo que se autorizó aunque cambie la
--    configuración.
-- 4. El cajero no puede reintentar en ráfaga: 5 segundos entre intentos del mismo comprobante.

-- ---------------------------------------------------------------------------------- columnas
alter table public.comprobantes
  add column toma uuid,
  add column tomado_en timestamptz,
  add column emisor_razon_social text check (char_length(emisor_razon_social) <= 200),
  add column emisor_domicilio text check (char_length(emisor_domicilio) <= 300),
  add column emisor_iibb text check (char_length(emisor_iibb) <= 50),
  add column emisor_inicio_actividades date;

-- Una emisión en curso al aplicar la migración es una emisión cortada: vuelve a pendiente (si tenía
-- número, lo conserva para reconciliar).
update public.comprobantes set estado = 'pendiente', procesando_desde = null
where estado = 'procesando';

alter table public.comprobantes
  add constraint comprobantes_toma_en_emision check ((estado = 'procesando') = (toma is not null));

-- Los comprobantes ya enviados toman la configuración actual (lo más cercano que hay).
update public.comprobantes c set
  emisor_razon_social = a.razon_social, emisor_domicilio = a.domicilio, emisor_iibb = a.iibb,
  emisor_inicio_actividades = a.inicio_actividades
from public.arca_configuracion a
where a.id and (c.estado = 'autorizado' or c.numero_intentado is not null);

-- Numeración reservada (punto 1): reemplaza al índice de "un solo procesando".
drop index public.comprobantes_un_procesando;
create unique index comprobantes_numeracion_reservada on public.comprobantes
  (ambiente, cuit_emisor, punto_venta, cbte_tipo)
  where estado = 'procesando' or numero_intentado is not null;

-- ---------------------------------------------------------------------- permisos de emisión
create or replace function public.puede_emitir_comprobante(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol  public.rol_usuario := public._exigir_usuario();
  v_comp public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_rol <> 'admin' then
    if v_comp.tipo = 'nota_credito' then
      raise exception 'Solo un administrador puede emitir notas de crédito' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.ventas v join public.turnos t on t.id = v.turno_id
      where v.id = v_comp.venta_id and t.usuario_id = auth.uid() and t.cerrado_en is null
    ) then
      raise exception 'Solo podés facturar las ventas de tu turno abierto' using errcode = '42501';
    end if;
  end if;
  if v_comp.estado = 'autorizado' then
    raise exception 'El comprobante ya está autorizado' using errcode = 'P0001';
  end if;
  if v_comp.estado = 'cancelado' then
    raise exception 'El comprobante está cancelado (la venta se anuló)' using errcode = 'P0001';
  end if;
  -- El cajero no reintenta en ráfaga (punto 4).
  if v_rol <> 'admin' and v_comp.tomado_en > now() - interval '5 seconds' then
    raise exception 'Esperá unos segundos antes de volver a intentar' using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- ------------------------------------------------------------------------------------- tomar
create or replace function public._arca_tomar(p_comprobante_id bigint)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.arca_configuracion := public._arca_config_lista();
  v_comp   public.comprobantes;
  v_otro   public.comprobantes;
begin
  select * into v_comp from public.comprobantes where id = p_comprobante_id for update;
  if v_comp.id is null then
    raise exception 'El comprobante no existe' using errcode = '22023';
  end if;
  if v_comp.estado in ('autorizado', 'cancelado') then
    raise exception 'El comprobante ya está %', v_comp.estado using errcode = 'P0001';
  end if;
  if v_comp.estado = 'procesando' and v_comp.procesando_desde > now() - interval '10 minutes' then
    raise exception 'El comprobante se está emitiendo en este momento: esperá unos segundos'
      using errcode = 'P0001';
  end if;

  if v_comp.numero_intentado is null then
    if v_comp.tipo = 'factura' then
      -- Todavía no se envió nada: se emite con la configuración vigente.
      v_comp.ambiente := v_config.ambiente;
      v_comp.cuit_emisor := v_config.cuit;
      v_comp.punto_venta := v_config.punto_venta;
    elsif (v_comp.ambiente, v_comp.cuit_emisor) is distinct from (v_config.ambiente, v_config.cuit) then
      raise exception 'La factura original se emitió en % con el CUIT %: la nota de crédito tiene que emitirse con esa misma configuración',
        v_comp.ambiente, v_comp.cuit_emisor using errcode = 'P0001';
    end if;
    -- Foto del emisor con la que se envía (punto 3).
    v_comp.emisor_razon_social := v_config.razon_social;
    v_comp.emisor_domicilio := v_config.domicilio;
    v_comp.emisor_iibb := v_config.iibb;
    v_comp.emisor_inicio_actividades := v_config.inicio_actividades;
  elsif (v_comp.ambiente, v_comp.cuit_emisor) is distinct from (v_config.ambiente, v_config.cuit) then
    raise exception 'Este comprobante quedó a confirmar en % con el CUIT %: volvé a esa configuración para reconciliarlo',
      v_comp.ambiente, v_comp.cuit_emisor using errcode = 'P0001';
  end if;

  -- Otro comprobante del mismo punto de venta y tipo emitiéndose o a confirmar (punto 1).
  select * into v_otro from public.comprobantes
  where id <> v_comp.id and ambiente = v_comp.ambiente and cuit_emisor = v_comp.cuit_emisor
    and punto_venta = v_comp.punto_venta and cbte_tipo = v_comp.cbte_tipo
    and (estado = 'procesando' or numero_intentado is not null)
  limit 1;
  if v_otro.id is not null then
    if v_otro.numero_intentado is not null and v_otro.estado <> 'procesando' then
      raise exception 'La % de la venta N° % quedó a confirmar con ARCA: reintentala primero (hasta confirmarla no se puede emitir otra del mismo tipo)',
        case v_otro.tipo when 'factura' then 'factura' else 'nota de crédito' end, v_otro.venta_id
        using errcode = 'P0001';
    end if;
    raise exception 'Hay otro comprobante del mismo tipo emitiéndose: probá de nuevo en unos segundos'
      using errcode = 'P0001';
  end if;

  begin
    update public.comprobantes set
      ambiente = v_comp.ambiente, cuit_emisor = v_comp.cuit_emisor, punto_venta = v_comp.punto_venta,
      emisor_razon_social = v_comp.emisor_razon_social, emisor_domicilio = v_comp.emisor_domicilio,
      emisor_iibb = v_comp.emisor_iibb, emisor_inicio_actividades = v_comp.emisor_inicio_actividades,
      estado = 'procesando', procesando_desde = now(), toma = gen_random_uuid(), tomado_en = now(),
      intentos = intentos + 1, actualizado_en = now()
    where id = v_comp.id
    returning * into v_comp;
  exception when unique_violation then
    -- Carrera con otra toma simultánea del mismo punto de venta y tipo.
    raise exception 'Hay otro comprobante del mismo tipo emitiéndose: probá de nuevo en unos segundos'
      using errcode = 'P0001';
  end;
  return v_comp;
end;
$$;

-- -------------------------------------------- funciones de cierre: exigen la toma vigente (punto 2)
drop function public._arca_registrar_numero(bigint, bigint, date);
drop function public._arca_autorizar(bigint, bigint, date, text, date, text);
drop function public._arca_rechazar(bigint, text);
drop function public._arca_liberar(bigint, text);
drop function public._arca_descartar_numero(bigint);

-- Fila en emisión con esa toma, bloqueada; si no, la emisión ya no es de quien llama.
create function public._arca_en_emision(p_comprobante_id bigint, p_toma uuid)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  select * into v_comp from public.comprobantes
  where id = p_comprobante_id and estado = 'procesando' and toma = p_toma
  for update;
  if v_comp.id is null then
    raise exception 'El comprobante ya no está en esta emisión (otra la retomó o terminó)'
      using errcode = 'P0001';
  end if;
  return v_comp;
end;
$$;

-- Antes de llamar a FECAESolicitar se guarda el número y la fecha que se van a pedir: si la
-- respuesta no llega, el próximo intento reconcilia ese número con FECompConsultar.
create function public._arca_registrar_numero(
  p_comprobante_id bigint, p_toma uuid, p_numero bigint, p_fecha date
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes
  set numero_intentado = p_numero, fecha = p_fecha, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

create function public._arca_autorizar(
  p_comprobante_id bigint, p_toma uuid, p_numero bigint, p_fecha date, p_cae text,
  p_cae_vencimiento date, p_mensaje text default null
)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  begin
    update public.comprobantes set
      estado = 'autorizado', numero = p_numero, numero_intentado = null, fecha = p_fecha,
      cae = p_cae, cae_vencimiento = p_cae_vencimiento, mensaje = left(p_mensaje, 2000),
      procesando_desde = null, toma = null, autorizado_en = now(), actualizado_en = now()
    where id = p_comprobante_id
    returning * into v_comp;
  exception when unique_violation then
    -- Ese número ya es de otro comprobante del sistema: nunca se asigna dos veces.
    raise exception 'El número % ya pertenece a otro comprobante: revisá el log de ARCA', p_numero
      using errcode = 'P0001';
  end;
  return v_comp;
end;
$$;

-- ARCA rechazó el comprobante (Resultado R): el número no se consumió.
create function public._arca_rechazar(p_comprobante_id bigint, p_toma uuid, p_mensaje text)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes set
    estado = 'rechazado', numero_intentado = null, fecha = null, mensaje = left(p_mensaje, 2000),
    procesando_desde = null, toma = null, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

-- Error de comunicación (o de autenticación) sin resultado de ARCA: vuelve a pendiente. Si se
-- llegó a registrar un número, queda para reconciliar (y reservado, punto 1).
create function public._arca_liberar(p_comprobante_id bigint, p_toma uuid, p_mensaje text)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes set
    estado = 'pendiente', mensaje = left(p_mensaje, 2000), procesando_desde = null, toma = null,
    fecha = case when numero_intentado is null then null else fecha end, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

-- Reconciliación: el número intentado no figura en ARCA, así que nunca se emitió. Se descarta y el
-- comprobante sigue en emisión para pedir un número nuevo.
create function public._arca_descartar_numero(p_comprobante_id bigint, p_toma uuid)
returns public.comprobantes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
begin
  perform public._arca_en_emision(p_comprobante_id, p_toma);
  update public.comprobantes set numero_intentado = null, fecha = null, actualizado_en = now()
  where id = p_comprobante_id
  returning * into v_comp;
  return v_comp;
end;
$$;

revoke all on function
  public._arca_en_emision(bigint, uuid),
  public._arca_registrar_numero(bigint, uuid, bigint, date),
  public._arca_autorizar(bigint, uuid, bigint, date, text, date, text),
  public._arca_rechazar(bigint, uuid, text),
  public._arca_liberar(bigint, uuid, text),
  public._arca_descartar_numero(bigint, uuid)
from public, anon, authenticated;
grant execute on function
  public._arca_en_emision(bigint, uuid),
  public._arca_registrar_numero(bigint, uuid, bigint, date),
  public._arca_autorizar(bigint, uuid, bigint, date, text, date, text),
  public._arca_rechazar(bigint, uuid, text),
  public._arca_liberar(bigint, uuid, text),
  public._arca_descartar_numero(bigint, uuid)
to service_role;

-- ---------------------------------------------------------------------------------- vista
-- Mismas columnas y al final la foto del emisor (create or replace solo permite agregar al final).
create or replace view public.v_comprobantes
with (security_invoker = true)
as
select
  c.id, c.venta_id, v.turno_id, c.tipo, c.asociado_id, c.clase, c.cbte_tipo, c.ambiente,
  c.cuit_emisor, c.punto_venta, c.numero, c.estado, c.fecha, c.fecha_servicio, c.doc_tipo,
  c.doc_nro, c.receptor_nombre, c.condicion_iva_receptor_id, ci.descripcion as condicion_iva_receptor,
  c.neto, c.iva, c.total, c.cae, c.cae_vencimiento, c.mensaje, c.intentos,
  (c.numero_intentado is not null) as a_reconciliar, c.creado_en, c.autorizado_en,
  v.servicio_nombre, v.patente,
  a.cbte_tipo as asociado_cbte_tipo, a.punto_venta as asociado_punto_venta,
  a.numero as asociado_numero, a.fecha as asociado_fecha,
  case when c.estado = 'autorizado' then
    'https://www.arca.gob.ar/fe/qr/?p=' || replace(encode(convert_to(jsonb_build_object(
      'ver', 1,
      'fecha', to_char(c.fecha, 'YYYY-MM-DD'),
      'cuit', c.cuit_emisor::bigint,
      'ptoVta', c.punto_venta,
      'tipoCmp', c.cbte_tipo,
      'nroCmp', c.numero,
      'importe', c.total,
      'moneda', 'PES',
      'ctz', 1,
      'tipoDocRec', c.doc_tipo,
      'nroDocRec', c.doc_nro,
      'tipoCodAut', 'E',
      'codAut', c.cae::bigint
    )::text, 'UTF8'), 'base64'), E'\n', '')
  end as qr_url,
  c.emisor_razon_social, c.emisor_domicilio, c.emisor_iibb, c.emisor_inicio_actividades
from public.comprobantes c
join public.ventas v on v.id = c.venta_id
join public.arca_condiciones_iva ci on ci.id = c.condicion_iva_receptor_id
left join public.comprobantes a on a.id = c.asociado_id;

commit;
