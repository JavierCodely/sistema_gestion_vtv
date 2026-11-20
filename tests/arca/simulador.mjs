// Simulador de ARCA (WSAA + WSFEv1) para tests: nunca se usa el servicio real en `npm run verificar`.
//
//   node tests/arca/simulador.mjs            → escucha en 127.0.0.1:54399 (npm run arca:simulador)
//   import { iniciarSimulador } from "...";  → en tests de integración
//
// La Edge Function lo usa cuando existe ARCA_URL_SIMULADOR (solo en supabase/config.toml local).
// Control (para los tests):
//   POST /_control/escenario { escenario, veces? }  escenarios: normal | rechazo | sin_respuesta |
//        wsaa_caido   (sin_respuesta: emite el CAE pero no contesta; el cliente corta por timeout)
//   POST /_control/reiniciar                        borra comprobantes, tickets y escenario
//   POST /_control/vencer_tickets                   vence los tickets de WSAA (conserva la numeración)
//   GET  /_control/estado                           comprobantes emitidos y tickets entregados
//
// Valida lo que ARCA valida en lo que usa este sistema (manual WSFEv1 v4.7): numeración
// correlativa (10016), clase/condición IVA del receptor (10243), Factura A con CUIT (10013),
// ImpTotal = neto + IVA y alícuota 21 % (10051), fechas de servicio (concepto 2) y NC asociada.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";

export const PUERTO_SIMULADOR = 54399;

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
});

// Condiciones frente al IVA del receptor y clases (tabla del manual WSFEv1 v4.7).
const CONDICIONES = [
  [1, "IVA Responsable Inscripto", ["A", "C"]],
  [4, "IVA Sujeto Exento", ["B", "C"]],
  [5, "Consumidor Final", ["B", "C", "49"]],
  [6, "Responsable Monotributo", ["A", "C"]],
  [7, "Sujeto No Categorizado", ["B", "C"]],
  [8, "Proveedor del Exterior", ["B", "C"]],
  [9, "Cliente del Exterior", ["B", "C"]],
  [10, "IVA Liberado – Ley N° 19.640", ["B", "C"]],
  [13, "Monotributista Social", ["A", "C"]],
  [15, "IVA No Alcanzado", ["B", "C"]],
  [16, "Monotributo Trabajador Independiente Promovido", ["A", "C"]],
];
const CLASE_DE_TIPO = { 1: "A", 3: "A", 6: "B", 8: "B" };

function nuevoEstado() {
  return { comprobantes: new Map(), tickets: new Map(), escenario: "normal", veces: 0 };
}

const sobre = (cuerpo) =>
  '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
  `<soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;
const falla = (texto) =>
  sobre(
    `<soap:Fault><faultcode>soap:Server</faultcode><faultstring>${texto}</faultstring></soap:Fault>`,
  );
const errores = (lista) =>
  lista.length
    ? `<Errors>${lista.map(([c, m]) => `<Err><Code>${c}</Code><Msg>${m}</Msg></Err>`).join("")}</Errors>`
    : "";
const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .format(new Date())
    .replaceAll("-", "");
const clave = (cuit, ptoVta, tipo, nro) =>
  `${cuit}|${ptoVta}|${tipo}${nro === undefined ? "" : `|${nro}`}`;

export function crearSimulador() {
  let estado = nuevoEstado();

  function consumirEscenario() {
    const actual = estado.escenario;
    if (actual !== "normal" && estado.veces > 0 && --estado.veces === 0)
      estado.escenario = "normal";
    return actual;
  }

  function wsaa(xml) {
    if (consumirEscenario() === "wsaa_caido")
      return { status: 503, cuerpo: "Servicio no disponible" };
    const body = parser.parse(xml).Envelope.Body;
    const cms = String(body.loginCms?.in0 ?? "");
    let tra;
    let cuit;
    try {
      const mensaje = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms)));
      tra = parser.parse(mensaje.rawCapture.content.value[0].value).loginTicketRequest;
      const serie = String(
        mensaje.certificates[0].subject.getField({ name: "serialNumber" })?.value ?? "",
      );
      cuit = /CUIT\s*(\d{11})/.exec(serie)?.[1];
    } catch {
      return { status: 500, cuerpo: falla("ns1:cms.bad: CMS inválido") };
    }
    if (tra?.service !== "wsfe") return { status: 500, cuerpo: falla("ns1:wsn.unavailable") };
    if (!cuit) return { status: 500, cuerpo: falla("ns1:cms.cert.untrusted") };
    const vigente = [...estado.tickets.values()].find(
      (t) => t.cuit === cuit && t.expira > Date.now(),
    );
    if (vigente) {
      return {
        status: 500,
        cuerpo: falla(
          "ns1:coe.alreadyAuthenticated: El CEE ya posee un TA valido para el acceso al WSN solicitado",
        ),
      };
    }
    const token = randomBytes(24).toString("base64");
    const sign = randomBytes(24).toString("base64");
    const expira = Date.now() + 12 * 3600_000;
    estado.tickets.set(token, { cuit, sign, expira });
    const ticket =
      `<loginTicketResponse version="1.0"><header><expirationTime>${new Date(expira).toISOString()}</expirationTime></header>` +
      `<credentials><token>${token}</token><sign>${sign}</sign></credentials></loginTicketResponse>`;
    const escapado = ticket
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return {
      status: 200,
      cuerpo: sobre(
        `<loginCmsResponse><loginCmsReturn>${escapado}</loginCmsReturn></loginCmsResponse>`,
      ),
    };
  }

  function autenticar(auth) {
    const t = estado.tickets.get(String(auth?.Token ?? ""));
    if (!t || t.sign !== String(auth?.Sign ?? "") || t.expira < Date.now())
      return [[600, "ValidacionDeToken: token inválido o vencido"]];
    if (t.cuit !== String(auth?.Cuit ?? ""))
      return [[600, "ValidacionDeToken: no aparece CUIT en lista de relaciones"]];
    return [];
  }

  const ultimoNumero = (cuit, ptoVta, tipo) =>
    Math.max(
      0,
      ...[...estado.comprobantes.values()]
        .filter((c) => clave(c.cuit, c.ptoVta, c.tipo) === clave(cuit, ptoVta, tipo))
        .map((c) => c.nro),
    );

  function solicitar(op, cuit) {
    const cab = op.FeCAEReq.FeCabReq;
    const det = op.FeCAEReq.FeDetReq.FECAEDetRequest;
    const ptoVta = Number(cab.PtoVta);
    const tipo = Number(cab.CbteTipo);
    const nro = Number(det.CbteDesde);
    const n = (v) => Number(v ?? "NaN");
    const errs = [];
    const obs = [];
    if (nro !== ultimoNumero(cuit, ptoVta, tipo) + 1) {
      errs.push([
        10016,
        `El numero o fecha del comprobante no se corresponde con el proximo a autorizar. Consultar metodo FECompUltimoAutorizado.`,
      ]);
    }
    const clase = CLASE_DE_TIPO[tipo];
    const condicion = CONDICIONES.find(([id]) => id === n(det.CondicionIVAReceptorId));
    if (!condicion)
      errs.push([
        10246,
        "Campo Condicion Frente al IVA del receptor es obligatorio conforme a lo reglamentado por la Resolución General N° 5616.",
      ]);
    else if (!condicion[2].includes(clase))
      errs.push([
        10243,
        "El campo de identificacion de Condicion de IVA del receptor no es valido para la clase de comprobante informado.",
      ]);
    if (clase === "A" && n(det.DocTipo) !== 80)
      errs.push([10013, "Para comprobantes clase A el campo DocTipo debe ser 80 (CUIT)."]);
    if (n(det.DocTipo) === 99 && n(det.DocNro) !== 0)
      errs.push([10015, "Si DocTipo es 99, DocNro debe ser 0."]);
    if (
      Math.abs(
        n(det.ImpTotal) -
          (n(det.ImpNeto) + n(det.ImpIVA) + n(det.ImpTotConc) + n(det.ImpOpEx) + n(det.ImpTrib)),
      ) > 0.01
    ) {
      errs.push([
        10048,
        "El campo ImpTotal debe ser igual a la suma de ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA.",
      ]);
    }
    const alic = det.Iva?.AlicIva;
    if (
      !alic ||
      n(alic.Id) !== 5 ||
      Math.abs(n(alic.Importe) - n(alic.BaseImp) * 0.21) > 0.01 ||
      Math.abs(n(alic.Importe) - n(det.ImpIVA)) > 0.01
    ) {
      errs.push([
        10051,
        "Los importes informados en AlicIVA se deben corresponder según el tipo de iva seleccionado.",
      ]);
    }
    if (n(det.Concepto) === 2 && !(det.FchServDesde && det.FchServHasta && det.FchVtoPago)) {
      errs.push([
        10035,
        "Los campos FchServDesde, FchServHasta y FchVtoPago son obligatorios para concepto 2.",
      ]);
    }
    if (tipo === 3 || tipo === 8) {
      const a = det.CbtesAsoc?.CbteAsoc;
      const original = a && estado.comprobantes.get(clave(cuit, n(a.PtoVta), n(a.Tipo), n(a.Nro)));
      if (!original || CLASE_DE_TIPO[n(a.Tipo)] !== clase)
        errs.push([10197, "El comprobante asociado no existe o no es de la misma clase."]);
    }
    if (consumirEscenario() === "rechazo")
      obs.push([10063, "Rechazo simulado para pruebas: documento del receptor inválido."]);

    const aprobado = errs.length === 0 && obs.length === 0;
    let cae = "";
    let vto = "";
    if (aprobado) {
      cae = String(70000000000000 + Math.floor(Math.random() * 9999999999999)).padStart(14, "0");
      vto = det.CbteFch;
      estado.comprobantes.set(clave(cuit, ptoVta, tipo, nro), {
        cuit,
        ptoVta,
        tipo,
        nro,
        fecha: det.CbteFch,
        docTipo: n(det.DocTipo),
        docNro: n(det.DocNro),
        total: n(det.ImpTotal),
        neto: n(det.ImpNeto),
        iva: n(det.ImpIVA),
        cae,
        vto,
        asociado: det.CbtesAsoc?.CbteAsoc ?? null,
      });
    }
    const observaciones = obs.length
      ? `<Observaciones>${obs.map(([c, m]) => `<Obs><Code>${c}</Code><Msg>${m}</Msg></Obs>`).join("")}</Observaciones>`
      : "";
    const resultado = aprobado ? "A" : "R";
    return (
      `<FeCabResp><Cuit>${cuit}</Cuit><PtoVta>${ptoVta}</PtoVta><CbteTipo>${tipo}</CbteTipo><FchProceso>${hoy()}120000</FchProceso>` +
      `<CantReg>1</CantReg><Resultado>${resultado}</Resultado></FeCabResp><FeDetResp><FECAEDetResponse>` +
      `<Concepto>${det.Concepto}</Concepto><DocTipo>${det.DocTipo}</DocTipo><DocNro>${det.DocNro}</DocNro>` +
      `<CbteDesde>${nro}</CbteDesde><CbteHasta>${nro}</CbteHasta><CbteFch>${det.CbteFch}</CbteFch>` +
      `<Resultado>${resultado}</Resultado><CAE>${cae}</CAE><CAEFchVto>${vto}</CAEFchVto>${observaciones}` +
      `</FECAEDetResponse></FeDetResp>${errores(errs)}`
    );
  }

  function wsfe(xml, accion) {
    const body = parser.parse(xml).Envelope.Body;
    const operacion = String(accion).replaceAll('"', "").split("/").at(-1);
    const op = body[operacion] ?? {};
    const res = (contenido) => ({
      status: 200,
      cuerpo: sobre(
        `<${operacion}Response xmlns="http://ar.gov.afip.dif.FEV1/"><${operacion}Result>${contenido}</${operacion}Result></${operacion}Response>`,
      ),
    });
    const auth = autenticar(op.Auth);
    if (auth.length) return res(errores(auth));
    const cuit = String(op.Auth.Cuit);

    switch (operacion) {
      case "FECompUltimoAutorizado": {
        const ptoVta = Number(op.PtoVta);
        const tipo = Number(op.CbteTipo);
        return res(
          `<PtoVta>${ptoVta}</PtoVta><CbteTipo>${tipo}</CbteTipo><CbteNro>${ultimoNumero(cuit, ptoVta, tipo)}</CbteNro>`,
        );
      }
      case "FECompConsultar": {
        const r = op.FeCompConsReq;
        const c = estado.comprobantes.get(
          clave(cuit, Number(r.PtoVta), Number(r.CbteTipo), Number(r.CbteNro)),
        );
        if (!c) return res(errores([[602, "Sin Resultados: - en la condicion de busqueda."]]));
        return res(
          `<ResultGet><Concepto>2</Concepto><DocTipo>${c.docTipo}</DocTipo><DocNro>${c.docNro}</DocNro>` +
            `<CbteDesde>${c.nro}</CbteDesde><CbteHasta>${c.nro}</CbteHasta><CbteFch>${c.fecha}</CbteFch>` +
            `<ImpTotal>${c.total}</ImpTotal><ImpNeto>${c.neto}</ImpNeto><ImpIVA>${c.iva}</ImpIVA>` +
            `<Resultado>A</Resultado><CodAutorizacion>${c.cae}</CodAutorizacion><EmisionTipo>CAE</EmisionTipo>` +
            `<FchVto>${c.vto}</FchVto><PtoVta>${c.ptoVta}</PtoVta><CbteTipo>${c.tipo}</CbteTipo></ResultGet>`,
        );
      }
      case "FEParamGetCondicionIvaReceptor":
        return res(
          `<ResultGet>${CONDICIONES.flatMap(([id, desc, clases]) =>
            clases.map(
              (cl) =>
                `<CondicionIvaReceptor><Id>${id}</Id><Desc>${desc}</Desc><Cmp_Clase>${cl}</Cmp_Clase></CondicionIvaReceptor>`,
            ),
          ).join("")}</ResultGet>`,
        );
      case "FECAESolicitar":
        return res(solicitar(op, cuit));
      default:
        return {
          status: 500,
          cuerpo: falla(`Operación no soportada por el simulador: ${operacion}`),
        };
    }
  }

  const servidor = createServer((req, res) => {
    let datos = "";
    req.on("data", (c) => (datos += c));
    req.on("end", () => {
      const responder = (status, cuerpo, tipo = "text/xml; charset=utf-8") => {
        res.writeHead(status, { "Content-Type": tipo });
        res.end(cuerpo);
      };
      try {
        if (req.url === "/_control/estado") {
          return responder(
            200,
            JSON.stringify({
              comprobantes: [...estado.comprobantes.values()],
              tickets: estado.tickets.size,
              escenario: estado.escenario,
            }),
            "application/json",
          );
        }
        if (req.url === "/_control/reiniciar") {
          estado = nuevoEstado();
          return responder(200, "{}", "application/json");
        }
        if (req.url === "/_control/vencer_tickets") {
          estado.tickets.clear();
          return responder(200, "{}", "application/json");
        }
        if (req.url === "/_control/escenario") {
          const { escenario, veces = 1 } = JSON.parse(datos || "{}");
          estado.escenario = escenario;
          estado.veces = veces;
          return responder(200, "{}", "application/json");
        }
        if (req.url === "/wsaa") {
          const r = wsaa(datos);
          return responder(r.status, r.cuerpo);
        }
        if (req.url === "/wsfe") {
          const accion = req.headers.soapaction ?? "";
          const esSolicitud = String(accion).includes("FECAESolicitar");
          if (esSolicitud && estado.escenario === "sin_respuesta") {
            consumirEscenario();
            // ARCA emite el CAE pero la respuesta nunca llega al cliente.
            estado.escenario = "normal";
            wsfe(datos, accion);
            return; // sin responder: el cliente corta por timeout
          }
          const r = wsfe(datos, accion);
          return responder(r.status, r.cuerpo);
        }
        responder(404, "No encontrado", "text/plain");
      } catch (e) {
        responder(500, falla(`Error del simulador: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
  });

  return {
    servidor,
    escuchar: (puerto = PUERTO_SIMULADOR) =>
      new Promise((resolver) => servidor.listen(puerto, "0.0.0.0", () => resolver(undefined))),
    cerrar: () =>
      new Promise((resolver) => {
        servidor.closeAllConnections();
        servidor.close(() => resolver(undefined));
      }),
  };
}

/** Cliente de control para tests (el simulador puede estar en otro proceso). */
export function controlSimulador(base = `http://127.0.0.1:${PUERTO_SIMULADOR}`) {
  const post = (ruta, cuerpo = {}) =>
    fetch(`${base}${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) }).then((r) => r.json());
  return {
    escenario: (escenario, veces = 1) => post("/_control/escenario", { escenario, veces }),
    reiniciar: () => post("/_control/reiniciar"),
    vencerTickets: () => post("/_control/vencer_tickets"),
    estado: () => fetch(`${base}/_control/estado`).then((r) => r.json()),
  };
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop())
) {
  const sim = crearSimulador();
  await sim.escuchar();
  console.log(
    `Simulador de ARCA en http://127.0.0.1:${PUERTO_SIMULADOR} (WSAA /wsaa, WSFEv1 /wsfe)`,
  );
}
