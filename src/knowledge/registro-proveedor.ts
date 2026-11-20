/**
 * Dominio puro del proceso de registro como proveedor.
 * No conoce HTTP, archivos ni el proveedor LLM. Solo reglas.
 */

export type Pais = "CO" | "EC" | "PE" | "PA" | "HN";

export const IDENTIFICADOR_TRIBUTARIO: Record<Pais, string> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
};

/** Etiquetas fiscales ambiguas que se traducen por país. */
export const ETIQUETAS_FISCALES = [
  "NIT",
  "RUC",
  "RTN",
  "Identificación tributaria",
  "Número de identificación fiscal",
];

export const CONFIANZA_MINIMA = 0.8;

export function esEtiquetaFiscal(etiqueta: string): boolean {
  return ETIQUETAS_FISCALES.some(
    (e) => e.toLowerCase() === etiqueta.trim().toLowerCase(),
  );
}

/**
 * Regla de país (RN1): Periferia solo tiene NIT colombiano. Un identificador
 * fiscal pedido para otro país se propone con el NIT y se marca para confirmar.
 */
export function reglaIdentificadorFiscal(
  etiqueta: string,
  pais: Pais,
): { requiereConfirmacion: boolean; nota: string | null } {
  if (!esEtiquetaFiscal(etiqueta)) {
    return { requiereConfirmacion: false, nota: null };
  }
  const esperado = IDENTIFICADOR_TRIBUTARIO[pais];
  if (pais === "CO") {
    return { requiereConfirmacion: false, nota: null };
  }
  return {
    requiereConfirmacion: true,
    nota: `identificador extranjero: el maestro solo tiene NIT colombiano, se propone como ${esperado}`,
  };
}

/** Lee un valor anidado por ruta con puntos: "banco.numero_cuenta". */
export function leerRuta(obj: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function aTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor.trim() === "" ? null : valor;
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (typeof valor === "object") {
    const v = (valor as { valor?: unknown }).valor;
    if (v !== undefined) return aTexto(v);
  }
  return null;
}

/**
 * Evalúa vigencia (RN3): compara contra la fecha de ejecución, no contra la
 * fecha de la solicitud. `null` significa sin vencimiento registrado.
 */
export function evaluarVigencia(
  vigenciaHasta: string | null,
  fechaEjecucion: Date,
): "vigente" | "vencido" | "sin_fecha" {
  if (!vigenciaHasta) return "sin_fecha";
  const fin = new Date(`${vigenciaHasta}T23:59:59`);
  if (Number.isNaN(fin.getTime())) return "sin_fecha";
  return fin.getTime() < fechaEjecucion.getTime() ? "vencido" : "vigente";
}

/** Un soporte faltante o vencido bloquea listo_para_firma. */
export function bloqueaFirma(
  estados: Array<"presente" | "ausente" | "vencido" | "sin_fecha">,
): boolean {
  return estados.some((e) => e === "ausente" || e === "vencido");
}