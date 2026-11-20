// Edge Function: facturación electrónica ARCA (WSAA + WSFEv1). Decisiones en CLAUDE.md §9.
//
// POST { accion: "emitir", comprobante_id }              → admin o cajero (la BD decide)
// POST { accion: "guardar_certificado", certificado, clave } → admin (PEM; se guarda en Vault)
// POST { accion: "probar_conexion" }                     → admin (WSAA + condiciones IVA + punto de venta)
//
// Respuesta: 200 { comprobante } | { configuracion } | { prueba } · 4xx { error } en español.
// La BD es la fuente de verdad (qué y cómo se factura); esta función solo habla con ARCA.
// Nunca dos CAE para una venta: el número se registra antes de pedirlo y, si la respuesta no
// llega, el próximo intento lo reconcilia con FECompConsultar antes de pedir otro.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import forge from "npm:node-forge@1.4.3";
import {
  type Ambiente,
  ErrorArca,
  ErrorComunicacion,
  direcciones,
  llamadaDe,
  sanear,
  type Codigo,
  type Llamada,
} from "./soap.ts";
import { pedirTicket, type Ticket, yaTieneTicket } from "./wsaa.ts";
import {
  condicionesIva,
  consultar,
  describir,
  solicitarCae,
  ultimoAutorizado,
  type Pedido,
} from "./wsfe.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ErrorHttp extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface Configuracion {
  cuit: string;
  punto_venta: number;
  ambiente: Ambiente;
}

interface Comprobante {
  id: number;
  tipo: "factura" | "nota_credito";
  cbte_tipo: number;
  ambiente: Ambiente;
  cuit_emisor: string;
  punto_venta: number;
  numero_intentado: number | null;
  /** Identificador de esta toma: lo exigen todas las funciones que cierran la emisión. */
  toma: string;
  fecha: string | null;
  fecha_servicio: string;
  doc_tipo: number;
  doc_nro: number;
  condicion_iva_receptor_id: number;
  neto: number;
  iva: number;
  total: number;
  asociado_id: number | null;
}

/** Error de la BD (RPC): las reglas de negocio ya vienen en español. */
function errorBd(error: { code?: string; message: string }, contexto: string): ErrorHttp {
  if (error.code === "P0001" || error.code === "22023") return new ErrorHttp(409, error.message);
  if (error.code === "42501") return new ErrorHttp(403, error.message);
  console.error(`arca (${contexto}):`, error.message);
  return new ErrorHttp(500, "No se pudo completar la operación");
}

const aaaammdd = (fecha: string) => fecha.replaceAll("-", "");
const isoDesde = (aaaammdd: string) =>
  `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

class Arca {
  private ticket: Ticket | null = null;

  constructor(
    private db: SupabaseClient,
    private ambiente: Ambiente,
    private cuit: string,
    private usuarioId: string,
    private comprobanteId: number | null = null,
  ) {}

  get urls() {
    return direcciones(this.ambiente);
  }

  async registrar(
    operacion: string,
    exito: boolean,
    mensaje: string | null,
    llamada: Llamada | null,
    errores: Codigo[] = [],
    observaciones: Codigo[] = [],
  ) {
    const { error } = await this.db.rpc("_arca_registrar_intento", {
      p_comprobante_id: this.comprobanteId,
      p_operacion: operacion,
      p_ambiente: this.ambiente,
      p_exito: exito,
      p_mensaje: mensaje,
      p_errores: errores,
      p_observaciones: observaciones,
      p_solicitud: llamada ? sanear(llamada.solicitud) : null,
      p_respuesta: llamada ? sanear(llamada.respuesta) : null,
      p_duracion_ms: llamada?.duracionMs ?? 0,
      p_usuario_id: this.usuarioId,
    });
    if (error) console.error("arca (log):", error.message);
  }

  /** Ejecuta una operación contra ARCA y deja el intento en el log (con o sin éxito). */
  async paso<T extends { llamada: Llamada }>(operacion: string, fn: () => Promise<T>): Promise<T> {
    try {
      const r = await fn();
      await this.registrar(operacion, true, null, r.llamada);
      return r;
    } catch (e) {
      const errores = e instanceof ErrorArca ? e.errores : [];
      await this.registrar(
        operacion,
        false,
        e instanceof Error ? e.message : "Error",
        llamadaDe(e),
        errores,
      );
      throw e;
    }
  }

  async obtenerTicket(): Promise<Ticket> {
    if (this.ticket) return this.ticket;
    const leerCache = async () => {
      const { data, error } = await this.db
        .rpc("_arca_token", { p_ambiente: this.ambiente, p_cuit: this.cuit })
        .maybeSingle<{ token: string | null; firma: string; expira: string }>();
      if (error) throw errorBd(error, "leer ticket");
      return data?.token ? { token: data.token, firma: data.firma, expira: data.expira } : null;
    };
    const enCache = await leerCache();
    if (enCache) return (this.ticket = enCache);

    const { data: cred, error } = await this.db
      .rpc("_arca_credenciales")
      .single<{ certificado: string | null; clave: string | null }>();
    if (error) throw errorBd(error, "credenciales");
    if (!cred.certificado || !cred.clave) {
      throw new ErrorHttp(
        409,
        "Falta subir el certificado y la clave de ARCA en Configuración ARCA",
      );
    }
    try {
      const { ticket } = await this.paso("wsaa", () =>
        pedirTicket(this.urls.wsaa, cred.certificado!, cred.clave!),
      );
      const { error: errGuardar } = await this.db.rpc("_arca_guardar_token", {
        p_ambiente: this.ambiente,
        p_cuit: this.cuit,
        p_token: ticket.token,
        p_firma: ticket.firma,
        p_expira: ticket.expira,
      });
      if (errGuardar) throw errorBd(errGuardar, "guardar ticket");
      return (this.ticket = ticket);
    } catch (e) {
      if (yaTieneTicket(e)) {
        // Otro pedido simultáneo obtuvo el ticket y ya lo guardó.
        const otro = await leerCache();
        if (otro) return (this.ticket = otro);
        throw new ErrorArca(
          "ARCA indica que ya hay un ticket de acceso vigente que este sistema no tiene guardado. Se libera solo cuando vence (hasta 12 horas)",
        );
      }
      throw e;
    }
  }
}

async function usuarioDe(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const llamador = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data } = await llamador.auth.getUser();
  if (!data.user) throw new ErrorHttp(401, "Sesión inválida o vencida");
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  return { llamador, servicio, usuarioId: data.user.id };
}

async function exigirAdmin(llamador: SupabaseClient) {
  const { data, error } = await llamador.rpc("es_admin");
  if (error || data !== true) {
    throw new ErrorHttp(403, "Solo un administrador puede configurar la facturación electrónica");
  }
}

async function configuracion(servicio: SupabaseClient): Promise<Configuracion> {
  const { data, error } = await servicio.rpc("_arca_config_lista").single<Configuracion>();
  if (error) throw errorBd(error, "configuración");
  return data;
}

async function leerComprobante(servicio: SupabaseClient, id: number) {
  const { data, error } = await servicio.from("v_comprobantes").select("*").eq("id", id).single();
  if (error) throw errorBd(error, "leer comprobante");
  return data;
}

// ------------------------------------------------------------------------------------ emitir
async function emitir(req: Request, body: Record<string, unknown>) {
  const id = Number(body.comprobante_id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorHttp(400, "El comprobante no es válido");
  const { llamador, servicio, usuarioId } = await usuarioDe(req);

  // Permisos y estado, con el usuario que llama.
  const { error: errPermiso } = await llamador.rpc("puede_emitir_comprobante", {
    p_comprobante_id: id,
  });
  if (errPermiso) throw errorBd(errPermiso, "permiso");

  const { data: comp, error: errTomar } = await servicio
    .rpc("_arca_tomar", { p_comprobante_id: id })
    .single<Comprobante>();
  if (errTomar) throw errorBd(errTomar, "tomar");

  const arca = new Arca(servicio, comp.ambiente, comp.cuit_emisor, usuarioId, id);
  const rpc = async (nombre: string, args: Record<string, unknown>) => {
    const { error } = await servicio.rpc(nombre, {
      p_comprobante_id: id,
      p_toma: comp.toma,
      ...args,
    });
    if (error) throw errorBd(error, nombre);
  };

  try {
    const ticket = await arca.obtenerTicket();
    const urlWsfe = arca.urls.wsfe;

    // 1) Reconciliar un número que quedó sin respuesta.
    if (comp.numero_intentado !== null) {
      const { comprobante: enArca } = await arca.paso("consultar", () =>
        consultar(
          urlWsfe,
          ticket,
          comp.cuit_emisor,
          comp.punto_venta,
          comp.cbte_tipo,
          comp.numero_intentado!,
        ),
      );
      const esElNuestro =
        enArca !== null &&
        enArca.docTipo === comp.doc_tipo &&
        enArca.docNro === Number(comp.doc_nro) &&
        Math.abs(enArca.total - Number(comp.total)) < 0.005 &&
        comp.fecha !== null &&
        enArca.fecha === aaaammdd(comp.fecha) &&
        /^\d{14}$/.test(enArca.cae);
      if (esElNuestro) {
        await rpc("_arca_autorizar", {
          p_numero: enArca.numero,
          p_fecha: isoDesde(enArca.fecha),
          p_cae: enArca.cae,
          p_cae_vencimiento: isoDesde(enArca.caeVencimiento),
          p_mensaje: "Autorizado (confirmado con ARCA tras una respuesta que no llegó)",
        });
        return await leerComprobante(servicio, id);
      }
      // No figura (o ese número lo usa otro comprobante): el nuestro nunca se emitió.
      await rpc("_arca_descartar_numero", {});
    }

    // 2) Número siguiente y pedido de CAE.
    const { numero: ultimo } = await arca.paso("ultimo_autorizado", () =>
      ultimoAutorizado(urlWsfe, ticket, comp.cuit_emisor, comp.punto_venta, comp.cbte_tipo),
    );
    const numero = ultimo + 1;
    const fecha = hoyArgentina();
    await rpc("_arca_registrar_numero", { p_numero: numero, p_fecha: fecha });

    let asociado: Pedido["asociado"] = null;
    if (comp.asociado_id !== null) {
      const factura = await leerComprobante(servicio, comp.id);
      asociado = {
        cbteTipo: factura.asociado_cbte_tipo,
        puntoVenta: factura.asociado_punto_venta,
        numero: factura.asociado_numero,
        fecha: aaaammdd(factura.asociado_fecha),
      };
    }
    const pedido: Pedido = {
      cbteTipo: comp.cbte_tipo,
      puntoVenta: comp.punto_venta,
      numero,
      fecha: aaaammdd(fecha),
      fechaServicio: aaaammdd(comp.fecha_servicio),
      docTipo: comp.doc_tipo,
      docNro: Number(comp.doc_nro),
      condicionIva: comp.condicion_iva_receptor_id,
      neto: Number(comp.neto),
      iva: Number(comp.iva),
      total: Number(comp.total),
      asociado,
    };

    let resultado;
    let llamada: Llamada;
    try {
      ({ resultado, llamada } = await solicitarCae(urlWsfe, ticket, comp.cuit_emisor, pedido));
    } catch (e) {
      await arca.registrar(
        "solicitar",
        false,
        e instanceof Error ? e.message : "Error",
        llamadaDe(e),
      );
      throw e;
    }
    if (resultado.aprobado) {
      const obs =
        resultado.observaciones.length > 0
          ? `Observaciones: ${describir(resultado.observaciones)}`
          : null;
      await arca.registrar("solicitar", true, obs, llamada, [], resultado.observaciones);
      await rpc("_arca_autorizar", {
        p_numero: numero,
        p_fecha: fecha,
        p_cae: resultado.cae,
        p_cae_vencimiento: isoDesde(resultado.caeVencimiento),
        p_mensaje: obs,
      });
    } else {
      const motivo =
        describir([...resultado.errores, ...resultado.observaciones]) ||
        "ARCA rechazó el comprobante";
      await arca.registrar(
        "solicitar",
        false,
        motivo,
        llamada,
        resultado.errores,
        resultado.observaciones,
      );
      await rpc("_arca_rechazar", { p_mensaje: `Rechazado por ARCA: ${motivo}` });
    }
    return await leerComprobante(servicio, id);
  } catch (e) {
    // Sin resultado de ARCA: vuelve a pendiente (si ya tenía número, queda para reconciliar).
    const mensaje =
      e instanceof ErrorComunicacion
        ? `${e.message}. Reintentá: antes de pedir otro número se confirma con ARCA si se emitió`
        : e instanceof ErrorArca || e instanceof ErrorHttp
          ? e.message
          : "Error inesperado al emitir el comprobante";
    if (!(e instanceof ErrorArca || e instanceof ErrorComunicacion || e instanceof ErrorHttp)) {
      console.error("arca (emitir):", e);
    }
    const { error } = await servicio.rpc("_arca_liberar", {
      p_comprobante_id: id,
      p_toma: comp.toma,
      p_mensaje: mensaje,
    });
    if (error) console.error("arca (liberar):", error.message);
    return await leerComprobante(servicio, id);
  }
}

// ------------------------------------------------------------------------ guardar_certificado
const LARGO_MAXIMO_PEM = 20_000;

function pem(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || valor.trim() === "") throw new ErrorHttp(400, `Falta ${campo}`);
  if (valor.length > LARGO_MAXIMO_PEM) throw new ErrorHttp(400, `${campo} es demasiado grande`);
  return valor.trim();
}

async function guardarCertificado(req: Request, body: Record<string, unknown>) {
  const { llamador, servicio, usuarioId } = await usuarioDe(req);
  await exigirAdmin(llamador);
  const certificadoPem = pem(body.certificado, "el certificado (.crt)");
  const clavePem = pem(body.clave, "la clave privada (.key)");

  let certificado: ReturnType<typeof forge.pki.certificateFromPem>;
  try {
    certificado = forge.pki.certificateFromPem(certificadoPem);
  } catch {
    throw new ErrorHttp(
      400,
      "El certificado no es válido: subí el .crt que descargaste de ARCA (formato PEM)",
    );
  }
  let clave: ReturnType<typeof forge.pki.privateKeyFromPem>;
  try {
    clave = forge.pki.privateKeyFromPem(clavePem);
  } catch {
    throw new ErrorHttp(
      400,
      "La clave privada no es válida o está protegida con contraseña: subí el .key sin contraseña (PEM)",
    );
  }
  const publica = certificado.publicKey;
  if (!publica.n || publica.n.compareTo(clave.n) !== 0 || publica.e.compareTo(clave.e) !== 0) {
    throw new ErrorHttp(400, "La clave privada no corresponde a ese certificado");
  }
  const serie = String(certificado.subject.getField({ name: "serialNumber" })?.value ?? "");
  const cuit = /CUIT\s*(\d{11})/i.exec(serie)?.[1];
  if (!cuit)
    throw new ErrorHttp(400, 'El certificado no indica un CUIT (campo serialNumber "CUIT ...")');
  const vence = certificado.validity.notAfter;
  if (vence.getTime() <= Date.now()) {
    throw new ErrorHttp(400, `El certificado venció el ${vence.toLocaleDateString("es-AR")}`);
  }
  const sujeto = certificado.subject.attributes
    .map((a) => `${a.shortName ?? a.name}=${String(a.value)}`)
    .join(", ");

  const { data, error } = await servicio
    .rpc("_arca_guardar_credenciales", {
      p_certificado: certificadoPem,
      p_clave: clavePem,
      p_cuit: cuit,
      p_sujeto: sujeto,
      p_vence: vence.toISOString(),
      p_usuario_id: usuarioId,
    })
    .single<Record<string, unknown>>();
  if (error) throw errorBd(error, "guardar certificado");
  return {
    certificado_cuit: data.certificado_cuit,
    certificado_sujeto: data.certificado_sujeto,
    certificado_vence: data.certificado_vence,
  };
}

// ---------------------------------------------------------------------------- probar_conexion
async function probarConexion(req: Request) {
  const { llamador, servicio, usuarioId } = await usuarioDe(req);
  await exigirAdmin(llamador);
  const config = await configuracion(servicio);
  const arca = new Arca(servicio, config.ambiente, config.cuit, usuarioId);
  try {
    const ticket = await arca.obtenerTicket();
    const { condiciones } = await arca.paso("condiciones", () =>
      condicionesIva(arca.urls.wsfe, ticket, config.cuit),
    );
    const { error } = await servicio.rpc("_arca_actualizar_condiciones", {
      p_condiciones: condiciones,
    });
    if (error) throw errorBd(error, "condiciones");
    // El último número de Factura B valida el punto de venta y la autorización del CUIT.
    const { numero } = await arca.paso("ultimo_autorizado", () =>
      ultimoAutorizado(arca.urls.wsfe, ticket, config.cuit, config.punto_venta, 6),
    );
    const mensaje = `Conexión correcta con ARCA (${config.ambiente}). Último número de Factura B en el punto de venta ${config.punto_venta}: ${numero}`;
    await arca.registrar("probar_conexion", true, mensaje, null);
    return { ok: true, mensaje, condiciones: condiciones.length, ultimo_factura_b: numero };
  } catch (e) {
    if (e instanceof ErrorHttp) throw e;
    const mensaje = e instanceof Error ? e.message : "Error inesperado";
    if (!(e instanceof ErrorArca || e instanceof ErrorComunicacion))
      console.error("arca (probar):", e);
    await arca.registrar("probar_conexion", false, mensaje, null);
    return { ok: false, mensaje };
  }
}

async function manejar(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => {
    throw new ErrorHttp(400, "Cuerpo de la solicitud inválido");
  })) as Record<string, unknown> | null;
  switch (body?.accion) {
    case "emitir":
      return json(200, { comprobante: await emitir(req, body) });
    case "guardar_certificado":
      return json(200, { configuracion: await guardarCertificado(req, body) });
    case "probar_conexion":
      return json(200, { prueba: await probarConexion(req) });
    default:
      throw new ErrorHttp(400, "Acción desconocida");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  try {
    return await manejar(req);
  } catch (e) {
    if (e instanceof ErrorHttp) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Error inesperado en el servidor" });
  }
});
