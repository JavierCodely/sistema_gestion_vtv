    -- =====================================================================
    -- Control de cierres de turno y de la caja de cambio (SOLO LECTURA)
    --
    -- Pegalo entero en el SQL Editor y ejecutalo: no modifica nada.
    -- Devuelve una fila por control, con los que fallan primero (ok = false):
    --   · Cada turno cerrado: lo que guardó el cierre (cantidad de ventas, efectivo, transferencia,
    --     gastos y efectivo devuelto) contra lo recalculado desde las ventas, sus pagos y los
    --     gastos que no estaban anulados al cerrar; y lo que salió y volvió de la caja de cambio.
    --   · Cada venta: sus pagos suman el precio.
    --   · Caja de cambio: el saldo es la suma de su libro, ningún saldo negativo y cada movimiento parte
    --     del saldo del anterior.
    -- Si todo está bien, todas las filas dicen ok = true.
    -- =====================================================================
    with turnos_cerrados as (
      select * from public.turnos where cerrado_en is not null
    ),
    -- Ventas que contaban al cerrar (las anuladas después del cierre siguen en la foto).
    ventas_al_cierre as (
      select v.turno_id, v.id
      from public.ventas v
      join turnos_cerrados t on t.id = v.turno_id
      where not v.anulada or v.anulada_en > t.cerrado_en
    ),
    pagos as (
      select va.turno_id,
            count(distinct va.id) as cantidad,
            coalesce(sum(p.monto) filter (where p.medio = 'efectivo'), 0) as efectivo,
            coalesce(sum(p.monto) filter (where p.medio = 'transferencia'), 0) as transferencia
      from ventas_al_cierre va
      join public.venta_pagos p on p.venta_id = va.id
      group by va.turno_id
    ),
    gastos as (
      select g.turno_id,
            sum(g.monto) as total,
            coalesce(sum(g.monto) filter (where g.fuente = 'efectivo'), 0) as efectivo
      from public.gastos g
      join turnos_cerrados t on t.id = g.turno_id
      where not g.anulado or g.anulado_en > t.cerrado_en
      group by g.turno_id
    ),
    caja_de_cambio as (
      select turno_id,
            -sum(monto) filter (where tipo = 'apertura_turno') as salio,
            sum(monto) filter (where tipo = 'cierre_turno') as volvio
      from public.movimientos_efectivo
      where turno_id is not null
      group by turno_id
    ),
    -- Una fila por turno cerrado: las diferencias "control: guardado X, calculado Y".
    controles_turnos as (
      select 'Turno ' || t.id || ' (' || c.nombre || ', cerró '
              || to_char(t.cerrado_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
              || ')' as control,
            coalesce(string_agg(d.nombre || ': guardado ' || coalesce(d.guardado::text, 'vacío')
                                || ', calculado ' || d.calculado::text, ' · ')
                        filter (where d.guardado is distinct from d.calculado),
                      'Todo coincide') as detalle,
            bool_and(d.guardado is not distinct from d.calculado) as ok,
            t.id as orden
      from turnos_cerrados t
      join public.cajas c on c.id = t.caja_id
      left join pagos p on p.turno_id = t.id
      left join gastos g on g.turno_id = t.id
      left join caja_de_cambio cc on cc.turno_id = t.id
      cross join lateral (values
        ('ventas', t.cantidad_ventas::numeric, coalesce(p.cantidad, 0)::numeric),
        ('efectivo', t.total_efectivo, coalesce(p.efectivo, 0)),
        ('transferencia', t.total_transferencia, coalesce(p.transferencia, 0)),
        ('gastos', t.total_gastos, coalesce(g.total, 0)),
        ('efectivo devuelto', t.efectivo_cierre,
          t.efectivo_inicial + coalesce(p.efectivo, 0) - coalesce(g.efectivo, 0)),
        -- Los turnos anteriores a la migración 27 no sacaban ni devolvían efectivo de la caja de cambio
        -- (efectivo_inicial y efectivo_cierre vacíos): no hay nada que comparar.
        ('salió de la caja de cambio', t.efectivo_inicial,
          case when t.efectivo_inicial is not null then coalesce(cc.salio, 0) end),
        ('volvió a la caja de cambio', t.efectivo_cierre,
          case when t.efectivo_inicial is not null then coalesce(cc.volvio, 0) end)
      ) as d (nombre, guardado, calculado)
      group by t.id, c.nombre, t.cerrado_en
    ),
    ventas_descuadradas as (
      select v.id, v.precio, coalesce(sum(p.monto), 0) as pagos
      from public.ventas v
      left join public.venta_pagos p on p.venta_id = v.id
      group by v.id, v.precio
      having v.precio is distinct from coalesce(sum(p.monto), 0)
    ),
    libro as (
      select monto, saldo_resultante,
            lag(saldo_resultante) over (order by id) as saldo_anterior
      from public.movimientos_efectivo
    )
    select control, detalle, ok
    from (
      select control, detalle, ok, 2 as grupo, orden from controles_turnos
      union all
      select 'Ventas: los pagos suman el precio',
            case when count(*) = 0 then 'Todas cuadran (' || (select count(*) from public.ventas) || ' ventas)'
                  else count(*) || ' ventas no cuadran, ej. ' || string_agg('venta ' || id || ': precio ' || precio
                      || ', pagos ' || pagos, ' · ' order by id) end,
            count(*) = 0, 1, 1
      from ventas_descuadradas
      union all
      select 'Caja de cambio: saldo = suma del libro',
            'Saldo ' || ce.saldo || ', suma del libro ' || coalesce((select sum(monto) from public.movimientos_efectivo), 0),
            ce.saldo = coalesce((select sum(monto) from public.movimientos_efectivo), 0), 1, 2
      from public.caja_efectivo ce
      union all
      select 'Caja de cambio: cada movimiento parte del saldo anterior',
            count(*) filter (where saldo_anterior is not null and saldo_anterior + monto <> saldo_resultante)
              || ' saltos · ' || count(*) filter (where saldo_resultante < 0) || ' saldos negativos',
            count(*) filter (where (saldo_anterior is not null and saldo_anterior + monto <> saldo_resultante)
                                    or saldo_resultante < 0) = 0, 1, 3
      from libro
    ) r
    order by ok, grupo, orden;
