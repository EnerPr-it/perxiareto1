/**
 * demo.ts · Ejecuta las herramientas directamente, sin modelo ni clave.
 * Uso: npm run demo
 */
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { paths } from "./src/config.ts";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./src/tools/proveedor.ts";
import type { Mapeo } from "./src/tools/types.ts";

const ctx = { directory: paths.dataRoot, sessionId: "demo" };

interface ResumenCaso {
  caso: string;
  formato: string;
  llenos: number;
  faltantes: number;
  confirmaciones: number;
  listoParaFirma: boolean | null;
  salida: string | null;
  error: string | null;
}

async function procesarCaso(caso: string): Promise<ResumenCaso> {
  const resumen: ResumenCaso = {
    caso,
    formato: "-",
    llenos: 0,
    faltantes: 0,
    confirmaciones: 0,
    listoParaFirma: null,
    salida: null,
    error: null,
  };

  const solicitudRaw = await leer_solicitud.execute({ caso }, ctx);
  const solicitud = JSON.parse(solicitudRaw);
  if (!solicitud.ok) {
    resumen.error = solicitud.error;
    return resumen;
  }
  resumen.formato = solicitud.data.formato;

  const mapeoRaw = await mapear_campos.execute(
    { caso, campos: solicitud.data.campos },
    ctx,
  );
  const mapeoRes = JSON.parse(mapeoRaw);
  if (!mapeoRes.ok) {
    resumen.error = mapeoRes.error;
    return resumen;
  }
  const mapeo = mapeoRes.data as Mapeo;
  resumen.llenos = mapeo.llenos.length;
  resumen.faltantes = mapeo.faltantes.length;
  resumen.confirmaciones = mapeo.requiere_confirmacion.length;

  const formulaRaw = await generar_formulario.execute({ caso, mapeo }, ctx);
  const formula = JSON.parse(formulaRaw);
  if (formula.ok) resumen.salida = formula.data.ruta;

  const paqueteRaw = await armar_paquete.execute({ caso }, ctx);
  const paquete = JSON.parse(paqueteRaw);
  if (paquete.ok) resumen.listoParaFirma = paquete.data.listo_para_firma;

  return resumen;
}

async function main(): Promise<void> {
  // Determinismo: out/ se limpia al inicio (salvo timestamps).
  if (existsSync(paths.out)) await rm(paths.out, { recursive: true, force: true });

  const casos = (await readdir(paths.casos, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(`Raíz de datos: ${paths.dataRoot}`);
  console.log(`Casos encontrados: ${casos.length}\n`);

  const filas: ResumenCaso[] = [];
  for (const caso of casos) {
    filas.push(await procesarCaso(caso));
  }

  const pad = (s: string | number | boolean | null, n: number) =>
    String(s ?? "-").padEnd(n).slice(0, n);

  console.log(
    pad("CASO", 22) +
      pad("FORMATO", 9) +
      pad("LLENOS", 8) +
      pad("FALTAN", 8) +
      pad("CONFIRM", 9) +
      pad("LISTO", 8) +
      "SALIDA",
  );
  console.log("-".repeat(96));
  for (const f of filas) {
    console.log(
      pad(f.caso, 22) +
        pad(f.formato, 9) +
        pad(f.llenos, 8) +
        pad(f.faltantes, 8) +
        pad(f.confirmaciones, 9) +
        pad(f.listoParaFirma === null ? "-" : f.listoParaFirma, 8) +
        (f.error ? `ERROR: ${f.error}` : f.salida ?? "-"),
    );
  }

  // Verificación de errores (HU-5): simulaciones sin confirmación deben fallar.
  console.log("\nVerificación de confirmación y errores:");
  const sinConfirmar = JSON.parse(
    await simular_envio.execute({ caso: "co-industrias-delta", confirmado: false }, ctx),
  );
  console.log(`  simular sin confirmar → ${sinConfirmar.ok ? "FALLO" : sinConfirmar.error}`);
  const inexistente = JSON.parse(await leer_solicitud.execute({ caso: "no-existe" }, ctx));
  console.log(`  caso inexistente → ${inexistente.ok ? "FALLO" : inexistente.error}`);
}

main().catch((err) => {
  console.error("demo falló:", err);
  process.exitCode = 1;
});