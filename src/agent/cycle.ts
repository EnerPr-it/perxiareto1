import { limits } from "../config.ts";
import { crearAdaptador, type DefinicionHerramientaLLM, type MensajeLLM } from "../llm/adapter.ts";
import { herramientas, type NombreHerramienta } from "../tools/proveedor.ts";
import { ZodArray, ZodBoolean, ZodObject, ZodString, type ZodTypeAny } from "zod";
import { decidirRuta, respuestaCambioAgente } from "./general-chat.ts";

export interface LlamadaVisible {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ResultadoTurno {
  reply: string;
  toolCalls: LlamadaVisible[];
  needsConfirmation: boolean;
  iterations: number;
}

export interface Sesion {
  id: string;
  mensajes: MensajeLLM[];
  tokensUsados: number;
  pendienteEnvio?: string;
}

function schemaJson(schema: ZodTypeAny): Record<string, unknown> {
  const description = schema.description;
  if (schema instanceof ZodString) return { type: "string", ...(description ? { description } : {}) };
  if (schema instanceof ZodBoolean) return { type: "boolean", ...(description ? { description } : {}) };
  if (schema instanceof ZodArray) return { type: "array", items: schemaJson(schema.element), ...(description ? { description } : {}) };
  if (schema instanceof ZodObject) return { type: "object", properties: Object.fromEntries(Object.entries(schema.shape).map(([key, value]) => [key, schemaJson(value as ZodTypeAny)])), required: Object.keys(schema.shape), ...(description ? { description } : {}) };
  return { ...(description ? { description } : {}) };
}

export function definiciones(): DefinicionHerramientaLLM[] {
  return (Object.entries(herramientas).filter(([name]) => name !== "proveedor_simular_envio") as Array<[NombreHerramienta, { description: string; args: Record<string, unknown> }]>).map(
    ([name, h]) => ({
      name,
      description: h.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(Object.entries(h.args).map(([k, schema]) => [k, schemaJson(schema as ZodTypeAny)])),
        required: Object.keys(h.args),
      },
    }),
  );
}

function detectarConfirmacion(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return /^(?:sí|si|confirmo|autorizo|adelante|procede|envía|envia)(?:\s+(?:el|la|envío|envio|simulación|simulacion|del|caso|de|para|solo|únicamente|unicamente|(?:co|ec|hn|pa)-[a-z0-9-]+))*[.!]?$/.test(t);
}

/**
 * Ejecuta un turno del ciclo: prompt → modelo → llamadas a herramientas →
 * respuesta. Respeta el tope de iteraciones y de tokens por sesión.
 */
export async function ejecutarTurno(
  sesion: Sesion,
  mensaje: string,
  ctx: { directory: string },
): Promise<ResultadoTurno> {
  const ruta = decidirRuta(mensaje, Object.keys(herramientas));
  const pendienteAnterior = sesion.pendienteEnvio;
  sesion.pendienteEnvio = undefined;
  const casoMencionado = mensaje.match(/(?:co|ec|hn|pa)-[a-z0-9-]+/i)?.[0]?.toLowerCase();
  const confirmacion = detectarConfirmacion(mensaje) && pendienteAnterior && (!casoMencionado || casoMencionado === pendienteAnterior) ? pendienteAnterior : null;
  sesion.mensajes.push({ role: "user", content: mensaje });
  if (confirmacion) {
    const result = await herramientas.proveedor_simular_envio.execute({ caso: confirmacion, confirmado: true }, { directory: ctx.directory, sessionId: sesion.id });
    const parsed = JSON.parse(result) as { ok: boolean; data?: { ruta: string }; error?: string };
    const reply = parsed.ok ? `Simulación registrada para ${confirmacion}: ${parsed.data?.ruta}. No se envió ningún correo.` : `No se pudo simular el envío: ${parsed.error ?? "error"}.`;
    sesion.mensajes.push({ role: "assistant", content: reply });
    return { reply, toolCalls: [{ name: "proveedor_simular_envio", args: { caso: confirmacion, confirmado: true }, result }], needsConfirmation: false, iterations: 0 };
  }
  if (ruta === "derivar") {
    const reply = respuestaCambioAgente();
    sesion.mensajes.push({ role: "assistant", content: reply });
    return { reply, toolCalls: [], needsConfirmation: false, iterations: 0 };
  }

  const adaptador = crearAdaptador();
  const systemPrompt = ruta === "general" ? "Responde la pregunta del usuario en español de forma directa. No proceses casos de proveedores ni inventes datos externos." : await cargarPrompt();
  const toolCalls: LlamadaVisible[] = [];
  let reply = "";
  let iterations = 0;

  while (iterations < limits.maxIterations) {
    if (sesion.tokensUsados >= limits.maxTokensPerSession) {
      reply = "Se alcanzó el límite de tokens de la sesión. Resumo lo obtenido.";
      break;
    }
    iterations++;

    let respuesta;
    try {
      respuesta = await adaptador.enviar(sesion.mensajes, ruta === "general" ? [] : definiciones(), systemPrompt);
    } catch {
      reply = "No pude consultar el modelo. La sesión sigue activa; puedes reintentar.";
      break;
    }
    sesion.tokensUsados += respuesta.tokensUsados;

    if (respuesta.llamadas.length === 0) {
      reply = respuesta.texto || reply;
      break;
    }

    const llamadasConId = respuesta.llamadas.filter((llamada): llamada is typeof llamada & { id: string } => Boolean(llamada.id));
    if (llamadasConId.length) sesion.mensajes.push({ role: "assistant", content: respuesta.texto, toolCalls: llamadasConId.map((llamada) => ({ id: llamada.id, name: llamada.name, args: llamada.args })) });
    for (const llamada of respuesta.llamadas) {
      const herramienta = ruta === "general" || llamada.name === "proveedor_simular_envio" ? undefined : herramientas[llamada.name];
      let resultado: string;
      if (!herramienta) {
        resultado = JSON.stringify({ ok: false, error: llamada.name === "proveedor_simular_envio" ? "requiere confirmación explícita del usuario en el turno siguiente" : `herramienta desconocida: ${llamada.name}` });
      } else {
        // Valida argumentos con zod antes de ejecutar; el contrato nunca lanza.
        let args = llamada.args;
        try {
          const schema = herramienta.args;
          args = Object.fromEntries(
            Object.entries(schema).map(([k, s]) => [k, (s as { parse: (v: unknown) => unknown }).parse(llamada.args[k])]),
          );
        } catch {
          resultado = JSON.stringify({ ok: false, error: "argumentos inválidos" });
          toolCalls.push({ name: llamada.name, args: llamada.args, result: resultado });
          sesion.mensajes.push({ role: "tool", content: resultado, toolName: llamada.name, toolCallId: llamada.id });
          continue;
        }
        resultado = await herramienta.execute(args as never, {
          directory: ctx.directory,
          sessionId: sesion.id,
        });
      }
      toolCalls.push({ name: llamada.name, args: llamada.args, result: resultado });
      sesion.mensajes.push({
        role: "tool",
        content: `${llamada.name} → ${resultado}`,
        toolName: llamada.name,
        toolCallId: llamada.id,
      });
    }

    reply = respuesta.texto || "Continuando con la información obtenida.";
  }

  const paquete = toolCalls.find((t) => t.name === "proveedor_armar_paquete" && t.result.includes('"ok":true'));
  if (paquete && typeof paquete.args.caso === "string") {
    sesion.pendienteEnvio = paquete.args.caso;
    reply = `${reply}\n\n¿Autorizas únicamente la simulación del envío del caso ${sesion.pendienteEnvio}?`;
  }
  sesion.mensajes.push({ role: "assistant", content: reply });
  return { reply, toolCalls, needsConfirmation: Boolean(paquete), iterations };
}

let promptCache: string | null = null;
async function cargarPrompt(): Promise<string> {
  if (promptCache !== null) return promptCache;
  const { readFile } = await import("node:fs/promises");
  const { paths } = await import("../config.ts");
  try {
    promptCache = await readFile(paths.prompt, "utf8");
  } catch {
    promptCache = "Eres un agente de registro de proveedores. No inventes valores.";
  }
  return promptCache;
}