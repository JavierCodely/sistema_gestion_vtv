# Facturación electrónica ARCA

Cómo poner en marcha la facturación electrónica del sistema (fase 4b), probarla y pasar a producción.
Las reglas de negocio están en `CLAUDE.md` §9; el contrato técnico de la Edge Function `arca`, en §5.

## Fuentes

| Fuente | Para qué se usó |
|---|---|
| Manual del desarrollador WSFEv1, versión 4.7 (ARCA) | Operaciones `FECAESolicitar`, `FECompUltimoAutorizado`, `FECompConsultar`, `FEParamGetCondicionIvaReceptor`; orden de los elementos (XSD), códigos de error |
| Especificación técnica WSAA (ARCA) | Ticket de acceso (TRA firmado en CMS/PKCS#7, SHA-256), vigencia de 12 h |
| RG 5616 | `CondicionIVAReceptorId` obligatorio en cada comprobante (errores 10242/10243/10246) |
| RG 5700/2025 | Tope de $ 10.000.000 para identificar al consumidor final (editable en Configuración ARCA) |
| RG 4892 + especificación del QR (2025) | QR del comprobante: `https://www.arca.gob.ar/fe/qr/?p=` + JSON en Base64 |
| Ley 27.743 (transparencia fiscal) | La Factura B informa el IVA contenido |

> **Inconsistencia del manual:** el ejemplo de request de la operación `FEParamGetCondicionIvaReceptor`
> usa el elemento `FEParamGetCondicionFrenteIvaReceptor`. El sistema usa el nombre de la operación
> (`FEParamGetCondicionIvaReceptor`). Si "Probar conexión" falla en homologación justo en ese paso,
> revisá este punto primero.

## Qué hace el sistema

- El **emisor** es Responsable Inscripto. La clase de la factura sale de la tabla de ARCA: **B** si la
  condición del cliente la admite (consumidor final, exento); si no, **A** con CUIT (responsable
  inscripto, monotributista).
- Precios con IVA 21 % incluido: la base calcula neto e IVA (redondeo a centavos).
- Se factura **después de vender**, desde el historial: el cajero, las ventas de su turno abierto; el
  admin, cualquier venta (Ventas → turno).
- Si ARCA rechaza, la factura queda **rechazada** con el motivo y se corrige/reintenta. Si ARCA no
  responde, queda **pendiente "a confirmar"**: el próximo intento primero consulta a ARCA si ese número
  ya se emitió (`FECompConsultar`), así **nunca hay dos CAE para una venta**.
- **Anular** una venta facturada emite la **nota de crédito** asociada (A o B como la factura). Si ARCA
  falla, queda pendiente y se reintenta desde el turno o desde **Facturación**.
- **Facturación** (admin): comprobantes sin CAE con reintento, y el log de cada comunicación con ARCA
  (request/response SOAP **sin** token, firma ni certificado).
- El certificado y la clave se guardan cifrados en **Supabase Vault** y nunca vuelven al navegador.

## 1. Certificado digital

Se necesita uno por ambiente: el de homologación **no sirve** en producción.

```bash
# Clave privada (guardala fuera del repositorio; NUNCA la subas a git)
openssl genrsa -out vtv.key 2048

# Pedido de certificado (CSR) con el CUIT del emisor
openssl req -new -key vtv.key -out vtv.csr \
  -subj "/C=AR/O=<Razón social>/CN=vtv/serialNumber=CUIT <CUIT sin guiones>"
```

- **Homologación**: con clave fiscal, servicio **"WSASS - Autogestión Certificados Homologación"** →
  nuevo certificado → pegar el CSR → descargar el `.crt`. En el mismo servicio, **crear la
  autorización** del certificado al servicio `wsfe`.
- **Producción**: servicio **"Administración de Certificados Digitales"** → agregar alias → subir el
  CSR → descargar el `.crt`. Después, en **"Administrador de Relaciones de Clave Fiscal"** → nueva
  relación → ARCA → WebServices → **Facturación Electrónica**, eligiendo como representante el alias
  del certificado.

## 2. Punto de venta

- **Producción**: en **"Administración de puntos de venta y domicilios"** crear un punto de venta del
  sistema **"Factura Electrónica - Monotributo / Responsable Inscripto - Web Services"**. Usá uno
  exclusivo para este sistema (la numeración la lleva ARCA por punto de venta y tipo).
- **Homologación**: acepta cualquier número de punto de venta.

## 3. Configurar el sistema (admin → Configuración ARCA)

1. **Datos del emisor**: CUIT, razón social, domicilio comercial, inicio de actividades, IIBB, punto de
   venta y ambiente. Guardar.
2. **Certificado digital**: elegir el `.crt` y el `.key` → **Guardar certificado**. El sistema verifica
   que la clave corresponda al certificado, que sea del CUIT del emisor y que no esté vencido.
3. **Probar conexión**: pide un ticket a WSAA, trae las **condiciones frente al IVA** de ARCA (sin esto
   no se puede facturar) y consulta el último número de Factura B del punto de venta.

## 4. Pasar de homologación a producción

1. Generar el certificado de producción y la relación con Facturación Electrónica (paso 1).
2. Crear el punto de venta de producción (paso 2).
3. En Configuración ARCA: cambiar el punto de venta y el **ambiente a Producción**, guardar, subir el
   certificado de producción y **Probar conexión**.

Los comprobantes de homologación quedan en el historial marcados "sin validez fiscal".

## 5. Probar en la computadora local

- Los tests (`npm run verificar`) usan siempre el **simulador** (`tests/arca/simulador.mjs`), nunca ARCA.
- A mano: `npm run arca:simulador` en otra terminal y `npm run dev`. Con el simulador sirve cualquier
  certificado autofirmado que tenga `serialNumber=CUIT <cuit>` (los tests lo generan con
  `tests/arca/certificado.mjs`).
- Contra la **homologación real**: comentar `ARCA_URL_SIMULADOR` en `supabase/config.toml`
  (`[edge_runtime.secrets]`), reiniciar (`npm run db:stop && npm run db:start`) y cargar tu certificado
  de homologación. Volver a descomentarlo antes de correr los tests.
- En la nube **no** se configura `ARCA_URL_SIMULADOR`: solo `npx supabase functions deploy arca`.

## Errores frecuentes

| Mensaje / código | Causa | Qué hacer |
|---|---|---|
| `coe.notAuthorized` / "Computador no autorizado a acceder al servicio" | El certificado no está asociado a `wsfe` | Crear la autorización (homologación) o la relación de Facturación Electrónica (producción) |
| `cms.cert.expired` o "certificado vencido" | Venció el certificado | Generar uno nuevo y subirlo |
| `coe.alreadyAuthenticated` | Ya hay un ticket vigente emitido para ese certificado (otra app o un ticket perdido) | El sistema reutiliza su ticket; si lo perdió, esperar a que venza (hasta 12 h) o usar otro certificado |
| 10016 | El número no es el siguiente al último autorizado | Otro sistema usa el mismo punto de venta: usar uno exclusivo |
| 10242 / 10243 / 10246 | Condición frente al IVA del receptor inválida o incompatible con la clase | Probar conexión para actualizar las condiciones; revisar la condición elegida |
| 10013 / 10015 | Documento del receptor inválido (la Factura A exige CUIT) | Corregir el documento y reintentar |
| "Todavía no se cargaron las condiciones frente al IVA" | Nunca se probó la conexión | Configuración ARCA → Probar conexión |
| "Falta confirmar con ARCA" | ARCA no respondió al pedir el CAE | Reintentar: el sistema consulta antes de volver a pedir |
