import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm, readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { join } from "node:path";

import { paths } from "../config.ts";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./proveedor.ts";
import type { Mapeo } from "./types.ts";

const ctx = { directory: paths.dataRoot, sessionId: "test" };

test("HU-1: lee la solicitud xlsx con país, cliente, formato y soportes", async () => {
  const r = JSON.parse(await leer_solicitud.execute({ caso: "co-industrias-delta" }, ctx));
  assert.equal(r.ok, true);
  assert.equal(r.data.pais, "CO");
  assert.equal(r.data.formato, "xlsx");
  assert.ok(r.data.campos.includes("Razón social"));
  assert.ok(r.data.soportes.includes("camara_comercio"));
});

test("HU-1: reporta caso inexistente sin lanzar", async () => {
  const r = JSON.parse(await leer_solicitud.execute({ caso: "no-existe" }, ctx));
  assert.equal(r.ok, false);
  assert.match(r.error, /inexistente/);
});

test("HU-2: nunca inventa valores; los campos sin fuente son faltantes", async () => {
  const solicitud = JSON.parse(await leer_solicitud.execute({ caso: "ec-corp-andina" }, ctx));
  const mapeo = JSON.parse(
    await mapear_campos.execute({ caso: "ec-corp-andina", campos: solicitud.data.campos }, ctx),
  ) as { ok: true; data: Mapeo };

  const contribuyente = mapeo.data.faltantes.find(
    (c) => c.etiqueta === "Número de contribuyente especial",
  );
  assert.ok(contribuyente, "el campo sin dato debe ser faltante");
  assert.equal(contribuyente?.valor, null);
});

test("HU-2: el identificador fiscal extranjero requiere confirmación", async () => {
  const mapeo = JSON.parse(
    await mapear_campos.execute({ caso: "hn-agroexport-sula", campos: ["RTN"] }, ctx),
  ) as { ok: true; data: Mapeo };
  assert.equal(mapeo.data.requiere_confirmacion.length, 1);
  assert.match(mapeo.data.requiere_confirmacion[0]!.nota ?? "", /extranjero/);
});

test("HU-3: genera formulario.xlsx en la ruta contractual", async () => {
  const solicitud = JSON.parse(await leer_solicitud.execute({ caso: "co-industrias-delta" }, ctx));
  const mapeo = JSON.parse(
    await mapear_campos.execute({ caso: "co-industrias-delta", campos: solicitud.data.campos }, ctx),
  ).data;
  const r = JSON.parse(
    await generar_formulario.execute({ caso: "co-industrias-delta", mapeo }, ctx),
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.formato, "xlsx");
  assert.ok(existsSync(join(paths.out, "co-industrias-delta", "formulario.xlsx")));
});

test("HU-3: portal no soportado produce valores-portal.md", async () => {
  const solicitud = JSON.parse(await leer_solicitud.execute({ caso: "pa-logistica-istmo" }, ctx));
  const mapeo = JSON.parse(await mapear_campos.execute({ caso: "pa-logistica-istmo", campos: solicitud.data.campos }, ctx));
  const r = JSON.parse(await generar_formulario.execute({ caso: "pa-logistica-istmo", mapeo: mapeo.data }, ctx));
  assert.equal(r.ok, true);
  assert.equal(r.data.formato, "portal");
  assert.ok(existsSync(join(paths.out, "pa-logistica-istmo", "valores-portal.md")));
});

test("HU-4: un soporte vencido bloquea listo_para_firma", async () => {
  const r = JSON.parse(await armar_paquete.execute({ caso: "co-industrias-delta" }, ctx));
  assert.equal(r.ok, true);
  assert.equal(r.data.listo_para_firma, false);
  const checklist = r.data.checklist.join("\n");
  assert.match(checklist, /VENCIDO/);
});

test("HU-4: un soporte ausente bloquea listo_para_firma", async () => {
  const r = JSON.parse(await armar_paquete.execute({ caso: "ec-corp-andina" }, ctx));
  assert.equal(r.data.listo_para_firma, false);
  assert.match(r.data.checklist.join("\n"), /ausente/);
});

test("HU-4: simular envío sin confirmación falla y no escribe el archivo", async () => {
  const objetivo = join(paths.out, "co-industrias-delta", "ENVIO-SIMULADO.md");
  await rm(objetivo, { force: true });
  const r = JSON.parse(
    await simular_envio.execute({ caso: "co-industrias-delta", confirmado: false }, ctx),
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /confirmación/);
  assert.equal(existsSync(objetivo), false);
});

test("HU-4: simular envío confirmado escribe ENVIO-SIMULADO.md", async () => {
  const r = JSON.parse(
    await simular_envio.execute({ caso: "co-industrias-delta", confirmado: true }, ctx),
  );
  assert.equal(r.ok, true);
  assert.ok(existsSync(join(paths.out, "co-industrias-delta", "ENVIO-SIMULADO.md")));
});

test("HU-3: XLSX conserva hoja, celdas, etiquetas y valores del maestro", async () => {
  const caso = "hn-agroexport-sula";
  const solicitud = JSON.parse(await leer_solicitud.execute({ caso }, ctx));
  const mapeo = JSON.parse(await mapear_campos.execute({ caso, campos: solicitud.data.campos }, ctx)).data as Mapeo;
  const resultado = JSON.parse(await generar_formulario.execute({ caso, mapeo }, ctx));
  assert.equal(resultado.ok, true);
  const plantilla = JSON.parse(await readFile(join(paths.casos, caso, "plantilla-celdas.json"), "utf8")) as Array<{ hoja: string; celda_etiqueta: string; celda_valor: string; etiqueta: string }>;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(join(paths.out, caso, "formulario.xlsx"));
  for (const fila of plantilla) {
    const hoja = libro.getWorksheet(fila.hoja);
    assert.ok(hoja);
    assert.equal(hoja.getCell(fila.celda_etiqueta).value, fila.etiqueta);
    const esperado = [...mapeo.llenos, ...mapeo.requiere_confirmacion].find((campo) => campo.etiqueta === fila.etiqueta)?.valor ?? "";
    assert.equal(hoja.getCell(fila.celda_valor).value, esperado);
  }
});

test("HU-3: rechaza un mapeo ajeno al maestro", async () => {
  const caso = "co-industrias-delta";
  const solicitud = JSON.parse(await leer_solicitud.execute({ caso }, ctx));
  const mapeo = JSON.parse(await mapear_campos.execute({ caso, campos: solicitud.data.campos }, ctx)).data as Mapeo;
  const alterado = structuredClone(mapeo);
  if (alterado.llenos[0]) alterado.llenos[0].valor = "valor inventado";
  const resultado = JSON.parse(await generar_formulario.execute({ caso, mapeo: alterado }, ctx));
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /mapeo/);
});

test("HU-4: el paquete incluye el formulario y bloquea si falta", async () => {
  const caso = "hn-agroexport-sula";
  const formulario = join(paths.out, caso, "formulario.xlsx");
  await rm(formulario, { force: true });
  const ausente = JSON.parse(await armar_paquete.execute({ caso }, ctx));
  assert.equal(ausente.data.listo_para_firma, false);
  assert.match(ausente.data.checklist.join("\n"), /formulario: ausente/);
  const solicitud = JSON.parse(await leer_solicitud.execute({ caso }, ctx));
  const mapeo = JSON.parse(await mapear_campos.execute({ caso, campos: solicitud.data.campos }, ctx)).data as Mapeo;
  await generar_formulario.execute({ caso, mapeo }, ctx);
  await armar_paquete.execute({ caso }, ctx);
  assert.equal(existsSync(join(paths.out, caso, "paquete", "formulario.xlsx")), true);
});

test("HU-5: no acepta rutas fuera de la raíz de casos", async () => {
  const resultado = JSON.parse(await leer_solicitud.execute({ caso: "../repositorio" }, ctx));
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /inválido/);
});

test("HU-5: toda herramienta devuelve JSON { ok } y nunca lanza", async () => {
  const resultados = await Promise.all([
    leer_solicitud.execute({ caso: "no-existe" }, ctx),
    mapear_campos.execute({ caso: "no-existe", campos: [] }, ctx),
    armar_paquete.execute({ caso: "no-existe" }, ctx),
    simular_envio.execute({ caso: "no-existe", confirmado: false }, ctx),
  ]);
  for (const raw of resultados) {
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed.ok, "boolean");
  }
});