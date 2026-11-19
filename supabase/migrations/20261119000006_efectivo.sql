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
