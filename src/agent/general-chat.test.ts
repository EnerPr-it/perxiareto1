import { test } from "node:test";
import assert from "node:assert/strict";

import { decidirRuta, respuestaCambioAgente } from "./general-chat.ts";
import { definiciones, ejecutarTurno, type Sesion } from "./cycle.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../config.ts";

function sesion(): Sesion {
  return { id: "general-test", mensajes: [], tokensUsados: 0 };
}

test("las preguntas y la conversación general no se derivan", () => {
  assert.equal(decidirRuta("¿Qué significa PLAN.md?", []), "general");
  assert.equal(decidirRuta("Hola, ¿cómo estás?", []), "general");
  assert.equal(decidirRuta("Explícame cómo funciona este archivo", []), "general");
  assert.equal(decidirRuta("¿Cómo crear un archivo PDF?", []), "general");
  assert.equal(decidirRuta("¿Qué código usarías para crear un PDF?", []), "general");
});

test("los casos de proveedor conservan su flujo especializado", () => {
  assert.equal(decidirRuta("Procesa el caso co-industrias-delta", []), "proveedor");
  assert.equal(decidirRuta("Genera el formulario de registro del proveedor", []), "proveedor");
});

test("las solicitudes de entregables sin herramientas derivan con el fence exacto", async () => {
  for (const mensaje of ["Crea un documento PDF", "Haz una presentación", "Implementa el archivo app.js", "Escribe código TypeScript"]) {
    const actual = sesion();
    const resultado = await ejecutarTurno(actual, mensaje, { directory: process.cwd() });
    assert.equal(resultado.reply, "El agente Build puede hacerlo.\n\n```agent-switch\nbuild\n```");
    assert.equal(resultado.iterations, 0);
    assert.deepEqual(resultado.toolCalls, []);
    assert.equal(actual.mensajes.length, 2);
  }
});

test("la capacidad real prevalece sobre el nombre del agente", () => {
  assert.equal(decidirRuta("Implementa el archivo app.js", ["write"]), "general");
  assert.equal(decidirRuta("Crea un documento PDF", ["bash"]), "general");
  assert.equal(decidirRuta("Crea un documento PDF", ["proveedor_generar_formulario"]), "derivar");
  assert.equal(decidirRuta("¿Qué es un PDF? Además, crea un documento", []), "derivar");
  assert.equal(respuestaCambioAgente().endsWith("```agent-switch\nbuild\n```"), true);
});

test("los esquemas enviados al modelo tienen tipos correctos", () => {
  const herramientas = definiciones();
  const leer = herramientas.find((h) => h.name === "proveedor_leer_solicitud");
  const mapear = herramientas.find((h) => h.name === "proveedor_mapear_campos");
  assert.deepEqual((leer?.parameters.properties as Record<string, unknown>).caso, { type: "string", description: "Nombre de la carpeta del caso en casos/" });
  assert.equal((mapear?.parameters.properties as Record<string, { type: string }>).campos?.type, "array");
  assert.equal(herramientas.some((h) => h.name === "proveedor_simular_envio"), false);
});

test("el chat mock mantiene el caso del turno y exige confirmación inmediata", async () => {
  const actual = sesion();
  const archivo = join(paths.out, "co-industrias-delta", "ENVIO-SIMULADO.md");
  const primero = await ejecutarTurno(actual, "Procesa el caso co-industrias-delta", { directory: paths.dataRoot });
  assert.equal(primero.needsConfirmation, true);
  assert.match(primero.reply, /¿Autorizas únicamente la simulación/);
  const segundo = await ejecutarTurno(actual, "sí", { directory: paths.dataRoot });
  assert.equal(segundo.toolCalls[0]?.name, "proveedor_simular_envio");
  assert.equal(JSON.parse(segundo.toolCalls[0]!.result).ok, true);
  assert.equal(existsSync(archivo), true);
  const tercero = await ejecutarTurno(actual, "sí", { directory: paths.dataRoot });
  assert.equal(tercero.toolCalls.some((call) => call.name === "proveedor_simular_envio"), false);
});

test("una confirmación para otro caso no autoriza la simulación", async () => {
  const actual = sesion();
  await ejecutarTurno(actual, "Procesa el caso co-industrias-delta", { directory: paths.dataRoot });
  const resultado = await ejecutarTurno(actual, "sí para ec-corp-andina", { directory: paths.dataRoot });
  assert.equal(resultado.toolCalls.some((call) => call.name === "proveedor_simular_envio"), false);
});

test("el modo general no llama herramientas del registro de proveedor", async () => {
  const resultado = await ejecutarTurno(sesion(), "¿Qué es un archivo?", { directory: process.cwd() });
  assert.deepEqual(resultado.toolCalls, []);
  assert.equal(resultado.needsConfirmation, false);
  assert.doesNotMatch(resultado.reply, /agent-switch/);
});
