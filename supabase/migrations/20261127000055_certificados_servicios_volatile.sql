-- =====================================================================
-- Migración 55: `certificados_servicios_de_turno` deja de ser `stable` (arreglo de la 53, 2026-11-27)
--
-- PostgREST ejecuta las funciones `stable` en una transacción de solo lectura. Para el cajero, la
-- función valida el turno con `_turno_para_trabajar`, que lo bloquea con `for share`, y en solo
-- lectura eso falla (25006 "cannot execute SELECT FOR SHARE in a read-only transaction"): la ventana
-- "Certificados y servicios" de la caja mostraba un error. Como `resumen_ventas_de_turno` (50) y
-- `efectivo_en_caja_de_turno` (47), queda `volatile`. No cambia lo que devuelve.
-- =====================================================================

alter function public.certificados_servicios_de_turno(bigint) volatile;
