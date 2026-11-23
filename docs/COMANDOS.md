# Comandos del proyecto — en orden de ejecución

Guía rápida para levantar, probar y publicar el Sistema VTV. Todos los comandos se corren
**desde la carpeta del proyecto** (`vtv/`). Los que dicen *SQL Editor* se ejecutan en el
Dashboard de Supabase, no en la terminal.

Hay dos entornos:

| Entorno | Para qué | Base de datos | Archivo de configuración |
|---|---|---|---|
| **Local** | Desarrollar y correr los tests | Supabase en Docker (`127.0.0.1:54321`) | `.env.local` |
| **Nube** (`gestion_vtv`) | Uso real / pruebas en internet | `https://lrtxjqnskgfsckapfhfh.supabase.co` | `.env.remoto.local` |

Los dos `.env.*.local` no se suben a git. Solo llevan la URL y la **clave publicable**;
las claves `secret` / `service_role` nunca van en el frontend ni en estos archivos.

---

## Parte A — Desarrollo local (primera vez)

Requisitos: Node.js, Docker Desktop **abierto y corriendo**.

```bash
# 1. Instalar dependencias del proyecto
npm install

# 2. Instalar el navegador que usan los tests E2E
npx playwright install chromium

# 3. Levantar Supabase local en Docker (la primera vez descarga imágenes, tarda)
npm run db:start

# 4. Generar .env.local con la URL y la clave del Supabase local
npm run env:local

# 5. Abrir la app en http://localhost:5173
npm run dev
```

Usuarios de prueba (solo local, los crea `supabase/seed.sql`):

| Rol | Email | Contraseña |
|---|---|---|
| Admin | `admin@vtv.local` | `admin1234` |
| Cajero | `cajero@vtv.local` | `cajero1234` |

## Parte B — Día a día en local

```bash
npm run db:start          # Prender Supabase local (después de reiniciar la PC o Docker)
npm run dev               # App contra Supabase local
npm run db:stop           # Apagar Supabase local
npm run db:reset          # Borrar la base local y recrearla: migraciones + datos de prueba
```

Si agregás una **Edge Function nueva**, el runtime local solo la detecta al reiniciar:

```bash
npm run db:stop && npm run db:start
```

El runtime local de Edge Functions corre en modo `oneshot` (`supabase/config.toml`): cada llamada
arranca un worker nuevo, así que la primera respuesta puede tardar unos segundos. Es solo local; en
la nube no aplica. Si después de muchas horas encendido las funciones dejan de responder, reiniciá
con el mismo `db:stop && db:start`.

## Parte C — Tests y calidad

```bash
npm run verificar         # TODO junto. Debe pasar antes de entregar/commitear cualquier cambio
```

`verificar` corre, en este orden:

| Paso | Comando suelto | Qué revisa |
|---|---|---|
| 1 | `npm run typecheck` | Tipos de TypeScript |
| 2 | `npm run lint` | ESLint, sin warnings |
| 3 | `npm run format:check` | Formato (Prettier). `npm run format` lo corrige |
| 4 | `node scripts/generar-sql-produccion.mjs --verificar` | Que el SQL de producción esté al día con las migraciones |
| 5 | `npm run test` | Tests unitarios (Vitest) |
| 6 | `npm run build` | Que la app compile |
| 7 | `npm run db:reset` | Base local limpia |
| 8 | `npm run test:db` | Tests de base de datos (pgTAP) |
| 9 | `npm run test:functions` | Tests de las Edge Functions `admin-usuarios` y `arca` (contra el simulador de ARCA) |
| 10 | `npm run test:e2e` | Tests de punta a punta en el navegador (Playwright), siempre contra Supabase local y el simulador de ARCA |

Correr un solo test:

```bash
npx vitest run tests/unit/compartido/lib/formato.test.ts
npx playwright test tests/e2e/auth.spec.ts
npx supabase test db supabase/tests/database/05_ventas.sql
node --test --test-name-pattern "ciclo completo" supabase/tests/functions/admin-usuarios.test.mjs
```

> En los E2E, las acciones que llaman a una Edge Function se envuelven en `conFuncion(...)`
> (`tests/e2e/utilidades.ts`): espera la respuesta de la función antes de seguir, en vez de
> depender de un tiempo fijo.

> **Simulador de ARCA**: los tests nunca hablan con ARCA real. `npm run test:functions` levanta el
> simulador dentro del test y Playwright lo levanta solo (puerto **54399**). Para probar la
> facturación a mano en local: `npm run arca:simulador` en otra terminal (la Edge Function local lo
> usa por `ARCA_URL_SIMULADOR` en `supabase/config.toml`). Para probar contra la homologación real
> de ARCA, ver [`docs/arca/LEEME.md`](arca/LEEME.md).

> Los E2E levantan su propio servidor en el puerto **5174** y toman la URL y la clave de
> `supabase status`, sin importar los `.env`: aunque tengas `npm run dev:remoto` abierto, nunca
> tocan la nube. Si Supabase local no está corriendo, avisan y no arrancan.

## Parte D — Instalar en la nube (proyecto `gestion_vtv`), una sola vez

Detalle completo en [`supabase/produccion/LEEME.md`](../supabase/produccion/LEEME.md).

```bash
# 1. Iniciar sesión en Supabase desde la terminal (abre el navegador)
npx supabase login

# 2. Vincular esta carpeta con el proyecto en la nube
npx supabase link --project-ref lrtxjqnskgfsckapfhfh
```

3. **SQL Editor** → pegar y ejecutar `supabase/produccion/01_esquema_completo.sql`
   (crea tablas, funciones, vistas y permisos; corre en una transacción).

```bash
# 4. Marcar las migraciones como aplicadas (para que un futuro db push no las repita)
npx supabase migration repair --status applied <versiones>
```

> Copiá el comando completo del encabezado de `supabase/produccion/01_esquema_completo.sql`:
> ahí está siempre con todas las versiones al día.

5. **Dashboard → Authentication** (configuración de seguridad):
   - Desactivar **Allow new users to sign up**.
   - **Minimum password length**: 8.
   - Activar **Secure password change**.
6. **Dashboard → Authentication → Users → Add user**: tu email + contraseña (≥ 8),
   marcando **Auto Confirm User**.
7. **SQL Editor** → `supabase/produccion/02_promover_primer_admin.sql`
   (editar el email en la línea marcada con `<<<`). Lo convierte en administrador.

```bash
# 8. Publicar las Edge Functions: usuarios y facturación electrónica
npx supabase functions deploy admin-usuarios
npx supabase functions deploy arca
```

> En la nube **no** se configura `ARCA_URL_SIMULADOR` (es solo local): la función `arca` habla con
> ARCA real según el ambiente elegido en Configuración ARCA. Guía completa en
> [`docs/arca/LEEME.md`](arca/LEEME.md).

```bash
# 9. Probar la app contra la nube (lee .env.remoto.local) → http://localhost:5173
npm run dev:remoto
```

## Parte E — Cambios futuros en la base de datos

```bash
# 1. Crear una migración NUEVA (nunca editar una ya commiteada)
npx supabase migration new nombre_del_cambio

# 2. Aplicarla en local y regenerar los tipos de TypeScript
npm run db:reset
npm run db:types

# 3. Regenerar el SQL combinado de producción
npm run sql:produccion

# 4. Verificar todo
npm run verificar

# 5. Subir SOLO las migraciones nuevas a la nube (o pegarlas en el SQL Editor)
npx supabase migration list --linked     # ver qué falta aplicar
npx supabase db push                     # aplica las pendientes

# 6. Si cambió una Edge Function, volver a publicarla
npx supabase functions deploy admin-usuarios
npx supabase functions deploy arca
```

> En una base ya instalada **nunca** se vuelve a correr `01_esquema_completo.sql`.

**Estado de la nube (`gestion_vtv`), verificado el 2026-11-22** (cuerpos de todas las funciones,
columnas, restricciones, índices y vistas comparados contra los archivos): migraciones 001–028
aplicadas y registradas; la **029 está aplicada** (corrida desde el SQL Editor, idéntica al archivo)
**pero no registrada** en el historial. Por eso 026–029 ya no se editan: todo cambio va en una
migración nueva. Para registrar la 029 y aplicar las siguientes:

```bash
npx supabase migration repair --linked --status applied 20261121000029
npx supabase migration list --linked     # deben faltar solo las nuevas (030 a 037)
npx supabase db push
npx supabase functions deploy admin-usuarios   # si cambió desde la última publicación
```

Después, en la app:
1. Usuarios → editar a quien figure con "Falta el apellido" (ej. el primer admin).
2. Fondos → pestaña Efectivo → "Fondo inicial" con el efectivo disponible para cambio (y, si hace falta, "Saldo inicial" en Transferencia y Crédito/Débito).
3. Ventas → "Abrir turno" de cada caja, con su efectivo inicial (el turno es de la caja: cualquier usuario activo trabaja en una caja abierta).

> Si alguna vez se aplica una migración desde el SQL Editor, hay que registrarla después con
> `npx supabase migration repair --linked --status applied <versión>`: el SQL Editor no escribe el
> historial y `db push` intentaría aplicarla de nuevo.

## Parte F — Volver a probar la instalación desde cero (solo proyecto de prueba)

En el **SQL Editor**:

| Script | Qué hace | Después |
|---|---|---|
| `supabase/produccion/50_reiniciar_datos.sql` | Borra los **datos** (ventas, turnos, gastos, compras, caja de cambio a $ 0, Fondos, comprobantes; opcional el catálogo —con descuentos e impuestos— y los rubros de gasto creados) y deja la base instalada con todos los usuarios. Exige escribir `EMPEZAR DE CERO` | Fondos → "Fondo inicial" y abrir turnos |
| `supabase/produccion/51_borrar_gastos.sql` | Borra los **gastos** (no los de compras de certificados) y, opcional, sus rubros y subcategorías; recalcula la caja de cambio. Exige escribir `BORRAR GASTOS` | — |
| `supabase/produccion/52_borrar_usuarios.sql` | Borra los **usuarios** (login, email y perfil): todos o todos menos tu admin. Solo sin operaciones: antes correr `50_reiniciar_datos.sql`. Exige escribir `BORRAR USUARIOS` | Si no quedó nadie: pasos D6 y D7 |
| `supabase/produccion/90_deshacer_primer_admin.sql` | Borra solo el usuario indicado (si no tiene operaciones) | Repetir pasos D6 y D7 |
| `supabase/produccion/99_borrar_todo.sql` | ⚠ Borra **todo**: tablas, datos, usuarios e historial de migraciones. Exige escribir `BORRAR TODO` | Repetir desde el paso D3 |

## Parte G — Git

```bash
git status                    # qué cambió
git add -A                    # preparar todo
git commit -m "mensaje"       # guardar (solo con npm run verificar en verde)
git log --oneline             # historial
```

Se trabaja en la rama `desarrollo`; `main` queda para lo estable.

---

## Referencia rápida de scripts npm

| Comando | Qué hace |
|---|---|
| `npm run dev` | App local contra Supabase local |
| `npm run dev:remoto` | App local contra Supabase en la nube |
| `npm run build` | Compila la app para publicar |
| `npm run db:start` / `db:stop` | Prender / apagar Supabase local |
| `npm run db:reset` | Recrear base local (migraciones + seed) |
| `npm run db:types` | Regenerar `src/types/database.ts` (tras cada migración) |
| `npm run env:local` | Generar `.env.local` del Supabase local |
| `npm run sql:produccion` | Regenerar `supabase/produccion/01_esquema_completo.sql` |
| `npm run verificar` | Todos los chequeos y tests |
