# Sistema de gestión VTV

Sistema de ventas para una planta de VTV (Argentina): cobro de servicios, stock y costo de las
hojas de certificado, cajas compartidas con turnos, pago mixto, descuentos, caja de efectivo para cambio y Fondos
(efectivo, transferencia, crédito/débito), gastos, impuestos, facturación electrónica con ARCA y un
dashboard con gráficos para el administrador.

**Stack:** Supabase (Postgres 17, Auth, Realtime, Edge Functions) · Vite + React 19 + TypeScript
strict · Tailwind 4 + shadcn · TanStack Query · Vitest · Playwright · pgTAP.

## Empezar

Requisitos: Node.js y Docker Desktop corriendo.

```bash
npm install
npx playwright install chromium
npm run db:start        # Supabase local en Docker
npm run env:local       # genera .env.local
npm run dev             # http://localhost:5173
```

Usuarios de prueba (solo local): `admin@vtv.local / admin1234`, `cajero@vtv.local / cajero1234`.

Antes de entregar o commitear cualquier cambio: `npm run verificar` (tipos, lint, formato, unit,
build, pgTAP, Edge Functions y E2E).

## Documentación

| Archivo | Contenido |
|---|---|
| [`docs/COMANDOS.md`](docs/COMANDOS.md) | Todos los comandos en orden: local, tests, instalación en la nube, cambios futuros |
| [`supabase/produccion/LEEME.md`](supabase/produccion/LEEME.md) | Instalación de la base en producción (SQL Editor) |
| [`docs/arca/LEEME.md`](docs/arca/LEEME.md) | Facturación electrónica: certificado de ARCA, homologación y producción, errores frecuentes |
| [`CLAUDE.md`](CLAUDE.md) | Arquitectura, reglas de negocio, modelo de datos, contrato de RPC y fases |

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| −1 | Base de datos completa, Edge Function de usuarios, tests | Hecha |
| 0 | Scaffold del frontend y herramientas de calidad | Hecha |
| 1 | Login, menú por rol, rutas protegidas, usuarios | Hecha |
| 2 | Admin: cajas, categorías de servicio y servicios | Hecha |
| 3 | Admin: certificados, compras (con edición), ajustes, movimientos y stock | Hecha |
| 4 | Caja: turnos, ventas, historial, cierre; admin: totales por turno y anulaciones | Hecha |
| 4b | Facturación electrónica ARCA: configuración, facturas A/B, comprobante con QR, notas de crédito, log | Hecha |
| 5 | Gastos, caja de efectivo, turnos con efectivo inicial, modo oscuro | Hecha |
| 5b | Caja compartida, pago mixto (efectivo + transferencia o débito/crédito), descuentos, Fondos, ventas con fecha pasada, ventas en vivo, impuestos | Hecha |
| 6 | Dashboard (hecho: ventas de la semana, servicios, categorías, descuentos y gastos por período o turno); alertas en tiempo real | En curso |
| 7 | Pulido y E2E completo | Pendiente |

Principio central: **la base de datos es la fuente de verdad del dinero y el stock**. El frontend
no calcula saldos, costos ni stock; llama funciones de la base (RPC) que validan permisos y
reglas. Los costos de certificados solo los ve el administrador.
