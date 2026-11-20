import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile, copyFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { z } from "zod";

import { paths } from "../config.ts";
import {
  aTexto,
  bloqueaFirma,
  evaluarVigencia,
  leerRuta,
  reglaIdentificadorFiscal,
  type Pais,
} from "../knowledge/registro-proveedor.ts";
import type {
  CampoMapeado,
  Contexto,
  Herramienta,
  Mapeo,
  ToolResult,
} from "./types.ts";

const ok = <T>(data: T): string => JSON.stringify({ ok: true, data });
const fail = (error: string): string => JSON.stringify({ ok: false, error });

function rutaDentro(base: string, fragmento: string): string | null {
  const ruta = resolve(base, fragmento);
  return ruta.startsWith(`${resolve(base)}${sep}`) ? ruta : null;
}

function casoValido(caso: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(caso);
}

async function leerJson<T>(ruta: string): Promise<T> {
  const raw = await readFile(ruta, "utf8");
  return JSON.parse(raw) as T;
}

async function registrar(
  ctx: Contexto,
  caso: string,
  herramienta: string,
  resultado: ToolResult<unknown>,
): Promise<void> {
  try {
    if (!casoValido(caso)) return;
    const dir = join(paths.out, caso);
    await mkdir(dir, { recursive: true });
    const resumen = resultado.ok ? "ok" : resultado.error;
    const linea = JSON.stringify({
      ts: new Date().toISOString(),
      herramienta,
      ok: resultado.ok,
      resumen,
    });
    await appendFile(join(dir, "log.jsonl"), `${linea}\n`, "utf8");
  } catch {
    // El registro de auditoría nunca debe romper la herramienta.
  }
}

/** Envuelve execute capturando cualquier excepción y logueando el resultado. */
function envolver<A>(
  nombre: string,
  fn: (args: A, ctx: Contexto) => Promise<string>,
): (args: A, ctx: Contexto) => Promise<string> {
  return async (args, ctx) => {
    let out: string;
    try {
      out = await fn(args, ctx);
    } catch {
      out = fail(`no fue posible completar ${nombre}`);
    }
    try {
      const parsed = JSON.parse(out) as ToolResult<unknown>;
      const caso = (args as { caso?: string }).caso;
      if (caso) await registrar(ctx, caso, nombre, parsed);
    } catch {
      // sin caso identificable; se ignora el log
    }
    return out;
  };
}

// ---------------------------------------------------------------------------
// Datos de caso
// ---------------------------------------------------------------------------

interface Solicitud {
  id: string;
  de: string;
  pais: Pais;
  cliente: string;
  formato: "xlsx" | "pdf" | "portal";
  cuerpo?: string;
  adjuntos?: string[];
}

interface CeldaPlantilla {
  hoja: string;
  celda_etiqueta: string;
  etiqueta: string;
  celda_valor: string;
}

interface CampoPlantilla {
  etiqueta: string;
  obligatorio: boolean;
}

interface Caso {
  solicitud: Solicitud;
  celdas: CeldaPlantilla[] | null;
  campos: CampoPlantilla[] | null;
  soportes: string[];
}

async function cargarCaso(caso: string): Promise<ToolResult<Caso>> {
  if (!casoValido(caso)) return { ok: false, error: "identificador de caso inválido" };
  const dir = join(paths.casos, caso);
  if (!existsSync(dir) || !existsSync(join(dir, "solicitud.json"))) {
    return { ok: false, error: `caso inexistente: ${caso}` };
  }
  let solicitud: Solicitud;
  try {
    solicitud = await leerJson<Solicitud>(join(dir, "solicitud.json"));
  } catch {
    return {
      ok: false,
      error: `plantilla o solicitud corrupta en el caso ${caso}`,
    };
  }

  let celdas: CeldaPlantilla[] | null = null;
  let campos: CampoPlantilla[] | null = null;
  if (solicitud.formato === "xlsx") {
    try {
      celdas = await leerJson<CeldaPlantilla[]>(join(dir, "plantilla-celdas.json"));
    } catch {
      return { ok: false, error: "plantilla de celdas corrupta" };
    }
  } else if (solicitud.formato === "pdf") {
    try {
      campos = await leerJson<CampoPlantilla[]>(join(dir, "plantilla-campos.json"));
    } catch {
      return { ok: false, error: "plantilla de campos corrupta" };
    }
  }

  let soportes: string[] = [];
  if (existsSync(join(dir, "soportes-exigidos.json"))) {
    try {
      soportes = await leerJson<string[]>(join(dir, "soportes-exigidos.json"));
    } catch {
      soportes = [];
    }
  }
  return { ok: true, data: { solicitud, celdas, campos, soportes } };
}

// ---------------------------------------------------------------------------
// HU-1 · proveedor_leer_solicitud
// ---------------------------------------------------------------------------

export const leer_solicitud: Herramienta<{ caso: string }> = {
  description:
    "Lee la solicitud de un caso y devuelve país, cliente, formato, campos pedidos y soportes exigidos.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en casos/"),
  },
  execute: envolver("proveedor_leer_solicitud", async ({ caso }) => {
    const r = await cargarCaso(caso);
    if (!r.ok) return fail(r.error);
    const { solicitud, celdas, campos, soportes } = r.data;
    const etiquetas =
      solicitud.formato === "xlsx"
        ? (celdas ?? []).map((c) => c.etiqueta)
        : (campos ?? []).map((c) => c.etiqueta);
    return ok({
      pais: solicitud.pais,
      cliente: solicitud.cliente,
      formato: solicitud.formato,
      campos: etiquetas,
      soportes,
    });
  }),
};

// ---------------------------------------------------------------------------
// HU-2 · proveedor_mapear_campos
// ---------------------------------------------------------------------------

export const mapear_campos: Herramienta<{ caso: string; campos: string[] }> = {
  description:
    "Cruza cada campo pedido con el maestro y el glosario; devuelve llenos, faltantes y por confirmar. Nunca inventa valores.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    campos: z.array(z.string()).describe("Etiquetas solicitadas"),
  },
  execute: envolver("proveedor_mapear_campos", async ({ caso, campos }) => {
    const r = await cargarCaso(caso);
    if (!r.ok) return fail(r.error);
    const pais = r.data.solicitud.pais;

    if (!existsSync(paths.maestro) || !existsSync(paths.glosario)) {
      return fail("repositorio maestro o glosario no disponible");
    }
    const maestro = await leerJson<Record<string, unknown>>(paths.maestro);
    const glosario = await leerJson<Record<string, string>>(paths.glosario);

    const llenos: CampoMapeado[] = [];
    const faltantes: CampoMapeado[] = [];
    const requiere_confirmacion: CampoMapeado[] = [];

    for (const etiqueta of campos) {
      const ruta = glosario[etiqueta];
      const valor = ruta ? aTexto(leerRuta(maestro, ruta)) : null;

      if (!ruta || valor === null) {
        faltantes.push({ etiqueta, estado: "faltante", ruta: ruta ?? null, valor: null });
        continue;
      }

      const regla = reglaIdentificadorFiscal(etiqueta, pais);
      if (regla.requiereConfirmacion) {
        requiere_confirmacion.push({
          etiqueta,
          estado: "requiere_confirmacion",
          ruta,
          valor,
          nota: regla.nota,
        });
      } else {
        llenos.push({ etiqueta, estado: "lleno", ruta, valor });
      }
    }
    return ok({ llenos, faltantes, requiere_confirmacion });
  }),
};

// ---------------------------------------------------------------------------
// HU-3 · proveedor_generar_formulario
// ---------------------------------------------------------------------------

function valorPorEtiqueta(mapeo: Mapeo, etiqueta: string): string {
  const todos = [...mapeo.llenos, ...mapeo.requiere_confirmacion];
  return todos.find((c) => c.etiqueta === etiqueta)?.valor ?? "";
}

export const generar_formulario: Herramienta<{ caso: string; mapeo: Mapeo }> = {
  description:
    "Genera el formulario lleno en el formato del caso: formulario.xlsx, formulario.pdf o valores-portal.md.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    mapeo: z.object({
      llenos: z.array(z.any()),
      faltantes: z.array(z.any()),
      requiere_confirmacion: z.array(z.any()),
    }),
  },
  execute: envolver("proveedor_generar_formulario", async ({ caso, mapeo }) => {
    const r = await cargarCaso(caso);
    if (!r.ok) return fail(r.error);
    const { solicitud, celdas, campos } = r.data;
    const etiquetas = solicitud.formato === "xlsx" ? (celdas ?? []).map((c) => c.etiqueta) : (campos ?? []).map((c) => c.etiqueta);
    const mapeoReal = JSON.parse(await mapear_campos.execute({ caso, campos: etiquetas }, { directory: paths.dataRoot, sessionId: "formulario" })) as ToolResult<Mapeo>;
    if (!mapeoReal.ok) return fail(mapeoReal.error);
    const entradas = [...mapeo.llenos, ...mapeo.faltantes, ...mapeo.requiere_confirmacion];
    const reales = [...mapeoReal.data.llenos, ...mapeoReal.data.faltantes, ...mapeoReal.data.requiere_confirmacion];
    if (entradas.length !== reales.length || reales.some((campo) => !entradas.some((entrada) => JSON.stringify(entrada) === JSON.stringify(campo)))) {
      return fail("el mapeo no coincide con el maestro y la plantilla");
    }
    const dir = join(paths.out, caso);
    await mkdir(dir, { recursive: true });

    if (solicitud.formato === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const hojas = new Map<string, ReturnType<typeof wb.addWorksheet>>();
      for (const c of celdas ?? []) {
        let ws = hojas.get(c.hoja);
        if (!ws) {
          ws = wb.addWorksheet(c.hoja);
          hojas.set(c.hoja, ws);
        }
        ws.getCell(c.celda_etiqueta).value = c.etiqueta;
        ws.getCell(c.celda_valor).value = valorPorEtiqueta(mapeo, c.etiqueta);
      }
      const ruta = join(dir, "formulario.xlsx");
      await wb.xlsx.writeFile(ruta);
      return ok({ ruta: `out/${caso}/formulario.xlsx`, formato: "xlsx" });
    }

    if (solicitud.formato === "pdf") {
      const PDFDocument = (await import("pdfkit")).default;
      const { createWriteStream } = await import("node:fs");
      const ruta = join(dir, "formulario.pdf");
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = createWriteStream(ruta);
        doc.pipe(stream);
        doc.fontSize(16).text(`Formulario: ${solicitud.cliente}`, { underline: true });
        doc.moveDown();
        for (const c of campos ?? []) {
          const valor = valorPorEtiqueta(mapeo, c.etiqueta);
          doc.fontSize(11).text(`${c.etiqueta}: ${valor || "(sin dato)"}`);
          doc.moveDown(0.5);
        }
        doc.end();
        stream.on("finish", () => resolve());
        stream.on("error", reject);
      });
      return ok({ ruta: `out/${caso}/formulario.pdf`, formato: "pdf" });
    }

    // Portal P2: no soportado, se entregan valores copiables.
    const lineas = [...mapeo.llenos, ...mapeo.requiere_confirmacion]
      .map((c) => `- ${c.etiqueta}: ${c.valor ?? ""}`)
      .join("\n");
    const ruta = join(dir, "valores-portal.md");
    await writeFile(
      ruta,
      `# Valores para portal (copia manual)\n\nCaso: ${caso}\n\n${lineas}\n`,
      "utf8",
    );
    return ok({
      ruta: `out/${caso}/valores-portal.md`,
      formato: "portal",
      error: "formato no soportado",
    });
  }),
};

// ---------------------------------------------------------------------------
// HU-4 · proveedor_armar_paquete
// ---------------------------------------------------------------------------

interface SoporteIndex {
  tipo: string;
  archivo: string;
  vigencia_hasta: string | null;
  pais_emisor: string;
  descripcion: string;
}

export const armar_paquete: Herramienta<{ caso: string }> = {
  description:
    "Reúne formulario, soportes exigidos, checklist y borrador de correo. Un soporte ausente o vencido bloquea listo_para_firma.",
  args: { caso: z.string().describe("Nombre de la carpeta del caso") },
  execute: envolver("proveedor_armar_paquete", async ({ caso }) => {
    const r = await cargarCaso(caso);
    if (!r.ok) return fail(r.error);
    const dir = join(paths.out, caso);
    const paquete = join(dir, "paquete");
    await mkdir(paquete, { recursive: true });

    const hoy = new Date();
    const index = existsSync(paths.soportesIndex)
      ? await leerJson<SoporteIndex[]>(paths.soportesIndex)
      : [];

    const filas: string[] = [];
    const estados: Array<"presente" | "ausente" | "vencido" | "sin_fecha"> = [];
    for (const tipo of r.data.soportes) {
      const soporte = index.find((s) => s.tipo === tipo);
      if (!soporte) {
        estados.push("ausente");
        filas.push(`- [ ] ${tipo}: ausente`);
        continue;
      }
      const vig = evaluarVigencia(soporte.vigencia_hasta, hoy);
      const origen = rutaDentro(paths.soportes, soporte.archivo);
      if (!origen || !existsSync(origen)) {
        estados.push("ausente");
        filas.push(`- [ ] ${tipo}: ausente`);
        continue;
      }
      await copyFile(origen, join(paquete, basename(soporte.archivo)));
      if (vig === "vencido") {
        estados.push("vencido");
        filas.push(`- [x] ${tipo}: VENCIDO (vigencia hasta ${soporte.vigencia_hasta})`);
      } else if (vig === "sin_fecha") {
        estados.push("sin_fecha");
        filas.push(`- [x] ${tipo}: sin fecha de vencimiento registrada`);
      } else {
        estados.push("presente");
        filas.push(`- [x] ${tipo}: presente (vigencia hasta ${soporte.vigencia_hasta})`);
      }
    }

    const formulario = join(dir, r.data.solicitud.formato === "xlsx" ? "formulario.xlsx" : "formulario.pdf");
    if (r.data.solicitud.formato !== "portal") {
      if (existsSync(formulario)) await copyFile(formulario, join(paquete, basename(formulario)));
      else {
        estados.push("ausente");
        filas.push("- [ ] formulario: ausente");
      }
    }
    const listo = !bloqueaFirma(estados);
    const checklist = [
      `# Checklist de soportes · ${caso}`,
      "",
      `Fecha de evaluación: ${hoy.toISOString().slice(0, 10)}`,
      `Estado listo_para_firma: ${listo ? "listo" : "bloqueado"}`,
      "",
      ...filas,
    ].join("\n");
    await writeFile(join(paquete, "checklist.md"), `${checklist}\n`, "utf8");

    const solicitud = r.data.solicitud;
    const borrador = [
      `Asunto: Registro como proveedor – ${solicitud.cliente}`,
      "",
      "Estimados,",
      "",
      `Adjuntamos la documentación de Periferia IT Group para el registro como proveedor.`,
      `Soportes incluidos: ${r.data.soportes.join(", ") || "ninguno"}.`,
      "",
      "Quedamos atentos a su confirmación.",
      "",
      "Cordialmente,",
      "Área administrativa · Periferia IT Group",
    ].join("\n");
    await writeFile(join(paquete, "borrador-correo.md"), `${borrador}\n`, "utf8");

    return ok({
      ruta: `out/${caso}/paquete/`,
      listo_para_firma: listo,
      checklist: filas,
    });
  }),
};

// ---------------------------------------------------------------------------
// HU-4 · proveedor_simular_envio
// ---------------------------------------------------------------------------

export const simular_envio: Herramienta<{ caso: string; confirmado: boolean }> = {
  description:
    "Solo tras confirmación explícita del turno anterior, escribe ENVIO-SIMULADO.md. No envía correo real.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    confirmado: z
      .boolean()
      .describe("true solo si el usuario confirmó explícitamente en el turno anterior"),
  },
  execute: envolver("proveedor_simular_envio", async ({ caso, confirmado }) => {
    if (!confirmado) {
      return fail("requiere confirmación explícita");
    }
    const r = await cargarCaso(caso);
    if (!r.ok) return fail(r.error);
    if (r.data.solicitud.formato === "portal") {
      return fail("el portal no se automatiza ni se envía");
    }
    const dir = join(paths.out, caso);
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, "ENVIO-SIMULADO.md");
    await writeFile(
      ruta,
      `# Envío simulado\n\nCaso: ${caso}\nFecha: ${new Date().toISOString()}\n\nNo se envió correo real.`,
      "utf8",
    );
    return ok({ ruta: `out/${caso}/ENVIO-SIMULADO.md` });
  }),
};

/** Registro de herramientas con el nombre que ve el modelo. */
export const herramientas = {
  proveedor_leer_solicitud: leer_solicitud,
  proveedor_mapear_campos: mapear_campos,
  proveedor_generar_formulario: generar_formulario,
  proveedor_armar_paquete: armar_paquete,
  proveedor_simular_envio: simular_envio,
} as const;

export type NombreHerramienta = keyof typeof herramientas;