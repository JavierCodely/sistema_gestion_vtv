-- Corrige la base de privilegios de funciones.
-- La migración 013 usó `alter default privileges in schema public revoke execute ... from public`,
-- pero los privilegios por defecto A NIVEL DE ESQUEMA no pueden quitar el EXECUTE que PUBLIC recibe
-- de fábrica: toda función creada después quedaba ejecutable por anon (ej. _validar_monto de la 014).
-- Se corrige a nivel global para el rol que crea los objetos (postgres) y se limpia lo existente.

alter default privileges for role postgres revoke execute on functions from public;

-- La 013 ya lo había hecho con las funciones de ese momento; esto cubre las creadas después.
-- Las RPC para usuarios conservan sus grants explícitos a `authenticated`.
revoke execute on all functions in schema public from public;
