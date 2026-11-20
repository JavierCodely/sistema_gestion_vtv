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
