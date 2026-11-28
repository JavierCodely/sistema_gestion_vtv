// Tests de integración de la Edge Function `arca` contra Supabase local y el simulador de ARCA
// (tests/arca/simulador.mjs). Nunca tocan ARCA real: la función usa ARCA_URL_SIMULADOR (config.toml).
// Ejecutar: npm run test:functions
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { crearSimulador, controlSimulador } from "../../../tests/arca/simulador.mjs";
import { generarCertificado } from "../../../tests/arca/certificado.mjs";

const env = JSON.parse(
  execSync("npx supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const API = env.API_URL;
const ANON = env.ANON_KEY;
const FN = `${env.FUNCTIONS_URL}/arca`;

/**
 * SQL de preparación contra la BD local, como postgres. service_role no tiene DML sobre las tablas
 * (igual que en la nube, migración 28): lo que es solo del test no se hace por la API.
 */
function sqlLocal(sql) {
  execSync(`npx supabase db query ${JSON.stringify(sql)}`, { stdio: ["ignore", "ignore", "pipe"] });
}
const CUIT = "30712345671";
// El simulador arranca vacío en cada corrida y la BD puede traer comprobantes de corridas
// anteriores: un punto de venta propio de esta corrida evita choques de numeración.
const PUNTO_VENTA = 100 + Math.floor(Math.random() * 9000);

const simulador = crearSimulador();
const control = controlSimulador();
let admin;
let cajero;
let servicioId;
let turnoId;

async function login(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).access_token;
}

const cabeceras = (token) => ({
  Authorization: `Bearer ${token}`,
  apikey: ANON,
  "Content-Type": "application/json",
});

async function funcion(token, payload) {
  const r = await fetch(FN, {
    method: "POST",
    headers: cabeceras(token),
    body: JSON.stringify(payload),
  });
  const texto = await r.text();
  try {
    return { status: r.status, body: JSON.parse(texto) };
  } catch {
    throw new Error(
      `${payload.accion}: respuesta no JSON (HTTP ${r.status}): ${texto.slice(0, 300)}`,
    );
  }
}

async function rpc(token, nombre, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: cabeceras(token),
    body: JSON.stringify(args),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`${nombre}: ${body.message}`);
  return body;
}

async function rest(token, ruta, opciones = {}) {
  const r = await fetch(`${API}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { ...cabeceras(token), ...opciones.headers },
  });
  const texto = await r.text();
  return { status: r.status, body: texto ? JSON.parse(texto) : null };
}

async function nuevaVenta(token = cajero, medio = "transferencia", turno = turnoId) {
  return (
    await rpc(token, "registrar_venta", {
      p_turno_id: turno,
      p_servicio_id: servicioId,
      p_medio_pago: medio,
      p_patente: "AB123CD",
    })
  ).id;
}

/** Plazo mínimo entre dos intentos del cajero sobre el mismo comprobante. */
const esperarPlazoCajero = () => new Promise((r) => setTimeout(r, 5_200));

async function facturarConsumidorFinal(token, ventaId) {
  return rpc(token, "preparar_factura", {
    p_venta_id: ventaId,
    p_condicion_iva_id: 5,
    p_doc_tipo: 99,
    p_doc_nro: 0,
  });
}

before(async () => {
  await simulador.escuchar();
  admin = await login("admin@vtv.local", "admin1234");
  cajero = await login("cajero@vtv.local", "cajero1234");
  assert.ok(admin && cajero, "los usuarios del seed deben poder ingresar");
  await rest(admin, "arca_configuracion?id=eq.true", {
    method: "PATCH",
    body: JSON.stringify({
      cuit: CUIT,
      razon_social: "VTV Pruebas SA",
      domicilio: "Ruta 3 km 10",
      inicio_actividades: "2020-01-01",
      punto_venta: PUNTO_VENTA,
      ambiente: "homologacion",
    }),
  });
  servicioId = (await rest(cajero, "servicios?select=id&activo=eq.true&limit=1")).body[0].id;
  turnoId = await abrirCaja();
});

/**
 * El admin abre una caja libre con efectivo inicial, que sale de la caja de cambio (migraciones 27
 * y 33). El turno es de la caja: cualquier usuario activo vende en él pasando su id.
 */
async function abrirCaja() {
  const cajas = await rpc(admin, "cajas_para_turno");
  await rpc(admin, "movimiento_efectivo", {
    p_tipo: "ingreso",
    p_monto: 1000,
    p_nota: "Efectivo inicial para tests arca",
  });
  const turno = await rpc(admin, "abrir_turno", {
    p_caja_id: cajas.find((c) => !c.ocupada).id,
    p_efectivo_inicial: 1000,
  });
  return turno.id;
}

after(async () => {
  if (turnoId) {
    await rpc(admin, "cerrar_turno", { p_turno_id: turnoId, p_observaciones: "tests arca" }).catch(
      () => {},
    );
  }
  await simulador.cerrar();
});

// ------------------------------------------------------------------ certificado
test("solo el admin configura ARCA", async () => {
  const { certificado, clave } = generarCertificado();
  const r1 = await funcion(cajero, { accion: "guardar_certificado", certificado, clave });
  assert.equal(r1.status, 403);
  assert.equal(r1.body.error, "Solo un administrador puede configurar la facturación electrónica");
  const r2 = await funcion(cajero, { accion: "probar_conexion" });
  assert.equal(r2.status, 403);
  const r3 = await funcion(undefined, { accion: "probar_conexion" });
  assert.equal(r3.status, 401);
});

test("valida el certificado y la clave antes de guardarlos", async () => {
  const a = generarCertificado({ bits: 1024 });
  const b = generarCertificado({ bits: 1024 });
  const malo = await funcion(admin, {
    accion: "guardar_certificado",
    certificado: "hola",
    clave: a.clave,
  });
  assert.equal(malo.status, 400);
  assert.match(malo.body.error, /El certificado no es válido/);
  const cruzado = await funcion(admin, {
    accion: "guardar_certificado",
    certificado: a.certificado,
    clave: b.clave,
  });
  assert.equal(cruzado.body.error, "La clave privada no corresponde a ese certificado");
  const vencido = generarCertificado({ bits: 1024, venceEn: -86400_000 });
  const r = await funcion(admin, { accion: "guardar_certificado", ...vencido });
  assert.match(r.body.error, /^El certificado venció el /);
  const sinCuit = generarCertificado({ bits: 1024, cuit: null });
  const r2 = await funcion(admin, { accion: "guardar_certificado", ...sinCuit });
  assert.equal(r2.body.error, 'El certificado no indica un CUIT (campo serialNumber "CUIT ...")');
});

test("guarda el certificado en Vault y prueba la conexión (WSAA, condiciones, punto de venta)", async () => {
  await control.reiniciar();
  const r = await funcion(admin, { accion: "guardar_certificado", ...generarCertificado() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.configuracion.certificado_cuit, CUIT);
  // Nadie lee el PEM desde la API
  const config = await rest(admin, "arca_configuracion?select=certificado_secreto_id");
  assert.equal(config.status, 403, "ni el admin lee los ids de Vault");

  const prueba = await funcion(admin, { accion: "probar_conexion" });
  assert.equal(prueba.status, 200);
  assert.equal(prueba.body.prueba.ok, true, prueba.body.prueba.mensaje);
  assert.equal(prueba.body.prueba.condiciones, 11);
  const condiciones = await rest(cajero, "arca_condiciones_iva?select=id,clases&id=eq.6");
  assert.deepEqual(condiciones.body, [{ id: 6, clases: ["A", "C"] }]);

  // El ticket de WSAA queda guardado: una segunda prueba no pide otro (el simulador lo rechazaría)
  const otra = await funcion(admin, { accion: "probar_conexion" });
  assert.equal(otra.body.prueba.ok, true, otra.body.prueba.mensaje);
  assert.equal((await control.estado()).tickets, 1);
});

// ------------------------------------------------------------------ emisión
test("el cajero factura una venta de una caja abierta: CAE, número correlativo y QR", async () => {
  const venta = await nuevaVenta();
  const comp = await facturarConsumidorFinal(cajero, venta);
  const r = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = r.body.comprobante;
  assert.equal(c.estado, "autorizado", c.mensaje);
  assert.equal(c.cbte_tipo, 6);
  assert.equal(c.punto_venta, PUNTO_VENTA);
  assert.match(c.cae, /^\d{14}$/);
  assert.ok(c.qr_url.startsWith("https://www.arca.gob.ar/fe/qr/?p="));
  const emitido = (await control.estado()).comprobantes.find(
    (x) => x.nro === c.numero && x.tipo === 6,
  );
  assert.equal(emitido.cae, c.cae);
  assert.equal(emitido.total, Number(c.total));

  const otra = await facturarConsumidorFinal(cajero, await nuevaVenta());
  const r2 = await funcion(cajero, { accion: "emitir", comprobante_id: otra.id });
  assert.equal(r2.body.comprobante.numero, c.numero + 1, "numeración correlativa");

  const repetido = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(repetido.status, 409);
  assert.equal(repetido.body.error, "El comprobante ya está autorizado");
});

test("Factura A a un responsable inscripto", async () => {
  const venta = await nuevaVenta();
  const comp = await rpc(cajero, "preparar_factura", {
    p_venta_id: venta,
    p_condicion_iva_id: 1,
    p_doc_tipo: 80,
    p_doc_nro: 20123456786,
    p_receptor_nombre: "Cliente RI SA",
  });
  const r = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(r.body.comprobante.estado, "autorizado", r.body.comprobante.mensaje);
  assert.equal(r.body.comprobante.cbte_tipo, 1);
});

test("un rechazo de ARCA queda con el motivo y se puede reintentar", async () => {
  const comp = await facturarConsumidorFinal(cajero, await nuevaVenta());
  await control.escenario("rechazo");
  const r = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(r.body.comprobante.estado, "rechazado");
  assert.match(r.body.comprobante.mensaje, /^Rechazado por ARCA: 10063: Rechazo simulado/);
  assert.equal(r.body.comprobante.a_reconciliar, false);

  const log = await rest(
    admin,
    `arca_intentos?comprobante_id=eq.${comp.id}&operacion=eq.solicitar&select=exito,observaciones`,
  );
  assert.equal(log.body[0].exito, false);
  assert.equal(log.body[0].observaciones[0].codigo, 10063);

  // El cajero no reintenta en ráfaga
  const rafaga = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(rafaga.status, 409);
  assert.equal(rafaga.body.error, "Esperá unos segundos antes de volver a intentar");

  await esperarPlazoCajero();
  const reintento = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(reintento.body.comprobante.estado, "autorizado");
  assert.equal(reintento.body.comprobante.intentos, 2);
});

test("si la respuesta no llega, el reintento reconcilia con ARCA: nunca dos CAE", async () => {
  const comp = await facturarConsumidorFinal(cajero, await nuevaVenta());
  await control.escenario("sin_respuesta");
  const r = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  const c = r.body.comprobante;
  assert.equal(c.estado, "pendiente");
  assert.equal(c.a_reconciliar, true);
  assert.match(c.mensaje, /^ARCA no respondió en 5 segundos/);
  const enArca = (await control.estado()).comprobantes.filter((x) => x.tipo === 6);
  const ultimo = enArca.at(-1);

  // Mientras está a confirmar no se puede anular la venta
  const venta = (await rest(admin, `comprobantes?id=eq.${comp.id}&select=venta_id`)).body[0]
    .venta_id;
  const anular = await fetch(`${API}/rest/v1/rpc/anular_venta`, {
    method: "POST",
    headers: cabeceras(admin),
    body: JSON.stringify({ p_venta_id: venta, p_motivo: "x" }),
  });
  assert.equal(anular.status, 400);

  // Numeración reservada: otra Factura B del mismo punto de venta espera la confirmación
  const otraVenta = await nuevaVenta();
  const otra = await facturarConsumidorFinal(cajero, otraVenta);
  const bloqueada = await funcion(cajero, { accion: "emitir", comprobante_id: otra.id });
  assert.equal(bloqueada.status, 409);
  assert.equal(
    bloqueada.body.error,
    `La factura de la venta N° ${venta} quedó a confirmar con ARCA: reintentala primero (hasta confirmarla no se puede emitir otra del mismo tipo)`,
  );

  await esperarPlazoCajero();
  const reintento = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  const ok = reintento.body.comprobante;
  assert.equal(ok.estado, "autorizado", ok.mensaje);
  assert.equal(ok.numero, ultimo.nro);
  assert.equal(ok.cae, ultimo.cae);
  assert.match(ok.mensaje, /confirmado con ARCA/);
  const despues = (await control.estado()).comprobantes.filter((x) => x.tipo === 6);
  assert.equal(despues.length, enArca.length, "no se pidió otro CAE");

  // Confirmada la primera, la otra ya se emite con el número siguiente
  const liberada = await funcion(cajero, { accion: "emitir", comprobante_id: otra.id });
  assert.equal(liberada.body.comprobante.estado, "autorizado", liberada.body.comprobante.mensaje);
  assert.equal(liberada.body.comprobante.numero, ok.numero + 1);
});

test("si la consulta no encuentra un número ya autorizado, no se pide otro (nunca dos CAE)", async () => {
  const comp = await facturarConsumidorFinal(cajero, await nuevaVenta());
  await control.escenario("sin_respuesta");
  const r = await funcion(admin, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(r.body.comprobante.a_reconciliar, true);
  const emitidos = (await control.estado()).comprobantes.length;
  const enArca = (await control.estado()).comprobantes.at(-1);

  // ARCA con carga alta: FECompConsultar dice "sin resultados" aunque el número ya se autorizó
  await control.escenario("consulta_vacia");
  const dudoso = await funcion(admin, { accion: "emitir", comprobante_id: comp.id });
  const c = dudoso.body.comprobante;
  assert.equal(c.estado, "pendiente");
  assert.equal(c.a_reconciliar, true, "conserva el número para reconciliar");
  assert.match(c.mensaje, /ya tiene autorizado el número \d+ pero todavía no lo devuelve/);
  assert.equal((await control.estado()).comprobantes.length, emitidos, "no se pidió otro CAE");

  // Cuando la consulta responde, se reconcilia con el CAE original
  const ok = (await funcion(admin, { accion: "emitir", comprobante_id: comp.id })).body.comprobante;
  assert.equal(ok.estado, "autorizado", ok.mensaje);
  assert.equal(ok.cae, enArca.cae);
  assert.equal((await control.estado()).comprobantes.length, emitidos);
});

test("si WSAA no responde, la factura queda pendiente sin número", async () => {
  // Ticket vencido en ambos lados: la próxima emisión tiene que pedir uno nuevo a WSAA.
  sqlLocal(`delete from public.arca_tokens where cuit = '${CUIT}'`);
  await control.vencerTickets();
  const comp = await facturarConsumidorFinal(cajero, await nuevaVenta());
  await control.escenario("wsaa_caido");
  const r = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(r.body.comprobante.estado, "pendiente");
  assert.equal(r.body.comprobante.a_reconciliar, false);
  assert.match(r.body.comprobante.mensaje, /HTTP 503/);
  await esperarPlazoCajero();
  const reintento = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
  assert.equal(reintento.body.comprobante.estado, "autorizado", reintento.body.comprobante.mensaje);
});

test("anular una venta facturada emite la nota de crédito asociada (solo admin)", async () => {
  const venta = await nuevaVenta(cajero, "efectivo");
  const factura = await facturarConsumidorFinal(cajero, venta);
  const f = (await funcion(cajero, { accion: "emitir", comprobante_id: factura.id })).body
    .comprobante;
  assert.equal(f.estado, "autorizado");

  await rpc(admin, "anular_venta", { p_venta_id: venta, p_motivo: "Cobro duplicado" });
  const nc = (await rest(admin, `comprobantes?venta_id=eq.${venta}&tipo=eq.nota_credito&select=id`))
    .body[0];
  const delCajero = await funcion(cajero, { accion: "emitir", comprobante_id: nc.id });
  assert.equal(delCajero.status, 403);
  assert.equal(delCajero.body.error, "Solo un administrador puede emitir notas de crédito");

  const r = await funcion(admin, { accion: "emitir", comprobante_id: nc.id });
  const c = r.body.comprobante;
  assert.equal(c.estado, "autorizado", c.mensaje);
  assert.equal(c.cbte_tipo, 8);
  assert.equal(c.asociado_numero, f.numero);
  const enArca = (await control.estado()).comprobantes.find(
    (x) => x.tipo === 8 && x.nro === c.numero,
  );
  assert.equal(Number(enArca.asociado.Nro), f.numero);
});

test("el cajero emite la factura de una venta ajena de una caja abierta, no de un turno cerrado", async () => {
  const otraCaja = await abrirCaja();
  let cerrada = false;
  try {
    // Caja compartida (migración 33): la venta del admin en otra caja abierta la factura el cajero.
    const ajena = await nuevaVenta(admin, "transferencia", otraCaja);
    const compAjena = await facturarConsumidorFinal(admin, ajena);
    const ok = await funcion(cajero, { accion: "emitir", comprobante_id: compAjena.id });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.comprobante.estado, "autorizado");

    // Turno cerrado: ya no.
    const venta = await nuevaVenta(admin, "transferencia", otraCaja);
    const comp = await facturarConsumidorFinal(admin, venta);
    await rpc(admin, "cerrar_turno", { p_turno_id: otraCaja });
    cerrada = true;
    const r = await funcion(cajero, { accion: "emitir", comprobante_id: comp.id });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Solo podés facturar ventas de una caja con el turno abierto");
  } finally {
    if (!cerrada) await rpc(admin, "cerrar_turno", { p_turno_id: otraCaja }).catch(() => {});
  }
});

test("el simulador nunca se usa en producción (el pedido firmado no sale hacia él)", async () => {
  const antes = (await control.estado()).comprobantes.length;
  await rest(admin, "arca_configuracion?id=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ ambiente: "produccion" }),
  });
  try {
    const r = await funcion(admin, { accion: "probar_conexion" });
    assert.equal(r.status, 200);
    assert.equal(r.body.prueba.ok, false);
    assert.equal(
      r.body.prueba.mensaje,
      "ARCA_URL_SIMULADOR solo se permite en Supabase local y en homologación",
    );
  } finally {
    await rest(admin, "arca_configuracion?id=eq.true", {
      method: "PATCH",
      body: JSON.stringify({ ambiente: "homologacion" }),
    });
  }
  assert.equal((await control.estado()).comprobantes.length, antes);
});

test("el log guarda cada llamada saneada: sin token, firma ni CMS", async () => {
  const log = await rest(
    admin,
    "arca_intentos?select=operacion,solicitud,respuesta&order=id.desc&limit=200",
  );
  const solicitudes = log.body.filter((i) => i.operacion === "solicitar");
  assert.ok(solicitudes.length > 0);
  for (const i of solicitudes)
    assert.match(i.solicitud, /<ar:Token>\[oculto\]<\/ar:Token><ar:Sign>\[oculto\]<\/ar:Sign>/);
  const wsaa = log.body.filter((i) => i.operacion === "wsaa" && i.solicitud);
  assert.ok(wsaa.length > 0);
  for (const i of wsaa) {
    assert.match(i.solicitud, /\[CMS oculto\]/);
    assert.doesNotMatch(i.respuesta ?? "", /&lt;token&gt;(?!\[oculto\])/);
  }
  const cajeroLee = await rest(cajero, "arca_intentos?select=id");
  assert.deepEqual(cajeroLee.body, []);
});
