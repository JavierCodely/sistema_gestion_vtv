import {
  type Errores,
  hayErrores,
  parsearEntero,
  parsearMonto,
} from "@/compartido/lib/validaciones";
import type { Ambiente, CondicionIva, DatosCliente, CambiosConfiguracion } from "../api/consultas";

/** Mismos límites que los CHECK de la migración 023. */
export const LARGO_MAXIMO_RAZON_SOCIAL = 200;
export const LARGO_MAXIMO_DOMICILIO = 300;
export const LARGO_MAXIMO_IIBB = 50;
export const LARGO_MAXIMO_RECEPTOR = 200;
/** Condición "Consumidor Final" en la tabla de ARCA (única que admite receptor sin identificar). */
export const CONSUMIDOR_FINAL = 5;

const soloDigitos = (texto: string) => texto.replace(/[\s.-]/g, "");

/** CUIT/CUIL con dígito verificador (misma regla que `cuit_valido` en la BD). */
export function cuitValido(texto: string): boolean {
  const cuit = soloDigitos(texto);
  if (!/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + Number(cuit[i]) * p, 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(cuit[10]);
}

/** Clase que corresponde según la tabla de ARCA: B si la condición la admite; si no, A. */
export function claseParaCondicion(condicion: CondicionIva | undefined): "A" | "B" | null {
  if (!condicion) return null;
  if (condicion.clases.includes("B")) return "B";
  if (condicion.clases.includes("A")) return "A";
  return null;
}

export interface FormularioCliente {
  condicionIvaId: string;
  docTipo: "" | "80" | "96" | "99";
  docNro: string;
  nombre: string;
}

export function validarCliente(
  f: FormularioCliente,
  condiciones: CondicionIva[],
): { datos?: DatosCliente; errores?: Errores<keyof FormularioCliente> } {
  const errores: Errores<keyof FormularioCliente> = {};
  const condicion = condiciones.find((c) => String(c.id) === f.condicionIvaId);
  const clase = claseParaCondicion(condicion);
  if (!condicion || !clase) errores.condicionIvaId = "Elegí la condición frente al IVA.";
  if (!f.docTipo) errores.docTipo = "Elegí el tipo de documento.";
  else if (clase === "A" && f.docTipo !== "80") errores.docTipo = "La Factura A requiere CUIT.";
  else if (f.docTipo === "99" && condicion && condicion.id !== CONSUMIDOR_FINAL) {
    errores.docTipo = "Solo el consumidor final puede quedar sin identificar.";
  }

  const docNro = soloDigitos(f.docNro);
  const nombre = f.nombre.trim().replace(/\s+/g, " ");
  if (f.docTipo === "80" && !cuitValido(docNro)) errores.docNro = "El CUIT no es válido.";
  if (f.docTipo === "96" && !/^\d{7,8}$/.test(docNro)) errores.docNro = "El DNI no es válido.";
  if (f.docTipo === "80" || f.docTipo === "96") {
    if (!nombre) errores.nombre = "Ingresá el nombre o la razón social.";
    else if (nombre.length > LARGO_MAXIMO_RECEPTOR) {
      errores.nombre = `No puede superar los ${String(LARGO_MAXIMO_RECEPTOR)} caracteres.`;
    }
  }
  if (hayErrores(errores) || !condicion || !f.docTipo) return { errores };
  const sinIdentificar = f.docTipo === "99";
  return {
    datos: {
      condicionIvaId: condicion.id,
      docTipo: Number(f.docTipo) as DatosCliente["docTipo"],
      docNro: sinIdentificar ? 0 : Number(docNro),
      nombre: sinIdentificar ? null : nombre,
    },
  };
}

export interface FormularioConfiguracion {
  cuit: string;
  razonSocial: string;
  domicilio: string;
  inicioActividades: string;
  iibb: string;
  puntoVenta: string;
  ambiente: Ambiente;
  tope: string;
}

export function validarConfiguracion(f: FormularioConfiguracion): {
  datos?: CambiosConfiguracion;
  errores?: Errores<keyof FormularioConfiguracion>;
} {
  const errores: Errores<keyof FormularioConfiguracion> = {};
  const texto = (v: string) => v.trim().replace(/\s+/g, " ");
  if (!cuitValido(f.cuit)) errores.cuit = "El CUIT no es válido.";
  const razonSocial = texto(f.razonSocial);
  if (!razonSocial) errores.razonSocial = "Ingresá la razón social.";
  else if (razonSocial.length > LARGO_MAXIMO_RAZON_SOCIAL) {
    errores.razonSocial = `No puede superar los ${String(LARGO_MAXIMO_RAZON_SOCIAL)} caracteres.`;
  }
  const domicilio = texto(f.domicilio);
  if (!domicilio) errores.domicilio = "Ingresá el domicilio comercial.";
  else if (domicilio.length > LARGO_MAXIMO_DOMICILIO) {
    errores.domicilio = `No puede superar los ${String(LARGO_MAXIMO_DOMICILIO)} caracteres.`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.inicioActividades)) {
    errores.inicioActividades = "Ingresá la fecha de inicio de actividades.";
  }
  const iibb = f.iibb.trim();
  if (iibb.length > LARGO_MAXIMO_IIBB) {
    errores.iibb = `No puede superar los ${String(LARGO_MAXIMO_IIBB)} caracteres.`;
  }
  const puntoVenta = parsearEntero(f.puntoVenta, {
    minimo: 1,
    maximo: 99998,
    nombre: "el punto de venta",
  });
  if (puntoVenta.error) errores.puntoVenta = puntoVenta.error;
  const tope = parsearMonto(f.tope, { nombre: "tope" });
  if (tope.error) errores.tope = tope.error;
  if (hayErrores(errores) || puntoVenta.valor === undefined || tope.valor === undefined) {
    return { errores };
  }
  return {
    datos: {
      cuit: soloDigitos(f.cuit),
      razon_social: razonSocial,
      domicilio,
      inicio_actividades: f.inicioActividades,
      iibb: iibb || null,
      punto_venta: puntoVenta.valor,
      ambiente: f.ambiente,
      tope_identificacion: tope.valor,
    },
  };
}
