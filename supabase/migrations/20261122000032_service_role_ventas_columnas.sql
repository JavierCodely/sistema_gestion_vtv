-- service_role lee de `ventas` solo las columnas que usa la Edge Function `arca` (auditoría de
-- seguridad, 2026-11-22).
--
-- La migración 28 le dio `select` sobre toda la tabla `ventas`, costos incluidos
-- (`costo_certificado`, `certificado_id`), y cada columna nueva quedaba legible sin decidirlo.
-- `arca` no lee `ventas` directo: lee la vista `v_comprobantes` (security_invoker, así que
-- service_role necesita permiso sobre las columnas de `ventas` que la vista usa) y todo lo demás lo
-- hace con funciones `_arca_*` security definer, que no dependen de estos grants.
-- Columnas que usa `v_comprobantes` (migración 25): id (join), turno_id, servicio_nombre, patente.
-- Si la vista suma una columna de `ventas`, sumarla acá y en 08_seguridad.sql.

revoke select on public.ventas from service_role;
grant select (id, turno_id, servicio_nombre, patente) on public.ventas to service_role;
