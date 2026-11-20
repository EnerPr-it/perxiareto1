import { llmConfig } from "../config.ts";
import type { NombreHerramienta } from "../tools/proveedor.ts";

/** Mensaje del historial en formato neutro, independiente del proveedor. */
export interface MensajeLLM {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

export interface DefinicionHerramientaLLM {
  name: NombreHerramienta;
  description: string;
  /** JSON Schema de los argumentos. */
  parameters: Record<string, unknown>;
}

export interface LlamadaHerramienta {
  name: NombreHerramienta;
  args: Record<string, unknown>;
  id?: string;
}

export interface RespuestaLLM {
  texto: string;
  llamadas: LlamadaHerramienta[];
  tokensUsados: number;
}

/** Puerto del proveedor: cambiar de proveedor no toca el ciclo del agente. */
export interface AdaptadorLLM {
  nombre(): string;
  modelo(): string;
  enviar(
    mensajes: MensajeLLM[],
    herramientas: DefinicionHerramientaLLM[],
    systemPrompt: string,
  ): Promise<RespuestaLLM>;
}

async function fetchConTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Implementación para la API de mensajes de Anthropic. */
function crearAnthropic(): AdaptadorLLM {
  const modelo = llmConfig.model || "claude-3-5-sonnet-latest";
  return {
    nombre: () => "anthropic",
    modelo: () => modelo,
    async enviar(mensajes, herramientas, systemPrompt) {
      if (!llmConfig.apiKey) throw new Error("LLM_API_KEY no configurada");
      const body = {
        model: modelo,
        max_tokens: 1024,
        system: systemPrompt,
        messages: mensajes.map((m) => m.role === "tool"
          ? { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }] }
          : m.toolCalls
            ? { role: "assistant", content: [...(m.content ? [{ type: "text", text: m.content }] : []), ...m.toolCalls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.args }))] }
            : { role: m.role, content: m.content }),
        tools: herramientas.map((h) => ({
          name: h.name,
          description: h.description,
          input_schema: h.parameters,
        })),
      };
      const res = await fetchConTimeout(
        `${llmConfig.baseUrl || "https://api.anthropic.com"}/v1/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": llmConfig.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        },
        30000,
      );
      if (!res.ok) throw new Error(`proveedor LLM respondió ${res.status}`);
      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
        usage?: { input_tokens: number; output_tokens: number };
      };
      const llamadas: LlamadaHerramienta[] = [];
      let texto = "";
      for (const bloque of data.content) {
        if (bloque.type === "text" && bloque.text) texto += bloque.text;
        if (bloque.type === "tool_use" && bloque.name) {
          llamadas.push({
            name: bloque.name as NombreHerramienta,
            args: (bloque.input ?? {}) as Record<string, unknown>,
            id: bloque.id,
          });
        }
      }
      return {
        texto,
        llamadas,
        tokensUsados: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      };
    },
  };
}

/** Implementación para la API de chat completions con tool calls (OpenAI-compatible). */
function crearOpenAI(): AdaptadorLLM {
  const modelo = llmConfig.model || "gpt-4o-mini";
  return {
    nombre: () => "openai",
    modelo: () => modelo,
    async enviar(mensajes, herramientas, systemPrompt) {
      if (!llmConfig.apiKey) throw new Error("LLM_API_KEY no configurada");
      const msgs = [{ role: "system", content: systemPrompt }, ...mensajes.map((m) => m.role === "tool"
        ? { role: "tool", tool_call_id: m.toolCallId, content: m.content }
        : m.toolCalls
          ? { role: "assistant", content: m.content || null, tool_calls: m.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } })) }
          : { role: m.role, content: m.content })];
      const body = {
        model: modelo,
        messages: msgs,
        tools: herramientas.map((h) => ({
          type: "function",
          function: { name: h.name, description: h.description, parameters: h.parameters },
        })),
      };
      const res = await fetchConTimeout(
        `${llmConfig.baseUrl || "https://api.openai.com/v1"}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${llmConfig.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        30000,
      );
      if (!res.ok) throw new Error(`proveedor LLM respondió ${res.status}`);
      const data = (await res.json()) as {
        choices: Array<{
          message: {
            content?: string;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { total_tokens?: number };
      };
      const msg = data.choices[0]?.message;
      const llamadas: LlamadaHerramienta[] = (msg?.tool_calls ?? []).map((tc) => ({
        name: tc.function.name as NombreHerramienta,
        args: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
        id: tc.id,
      }));
      return {
        texto: msg?.content ?? "",
        llamadas,
        tokensUsados: data.usage?.total_tokens ?? 0,
      };
    },
  };
}

/**
 * Adaptador de demostración sin llamadas de red. Interpreta instrucciones simples
 * del usuario y produce tool calls deterministas para poder probar el ciclo sin clave.
 */
function crearMock(): AdaptadorLLM {
  return {
    nombre: () => "mock",
    modelo: () => "mock-1",
    async enviar(mensajes, herramientas) {
      const ultimo = [...mensajes].reverse().find((m) => m.role === "user");
      if (herramientas.length === 0) {
        return {
          texto: "El modo de demostración no puede responder preguntas generales; configura un proveedor LLM para recibir una respuesta.",
          llamadas: [],
          tokensUsados: 10,
        };
      }
      const texto = (ultimo?.content ?? "").toLowerCase();
      const casoMatch = texto.match(/([a-z]{2}-[a-z0-9-]+(?:-[a-z0-9-]+)*)/);
      const caso = casoMatch?.[1] ?? "co-industrias-delta";
      const desdeUltimoUsuario = [...mensajes].reverse().findIndex((m) => m.role === "user");
      const llamadasTurno = desdeUltimoUsuario >= 0 ? mensajes.slice(mensajes.length - desdeUltimoUsuario).filter((m) => m.role === "tool") : [];
      const hechas = new Set(llamadasTurno.map((m) => m.toolName));
      if (!hechas.has("proveedor_leer_solicitud")) {
        return {
          texto: `Procesando el caso ${caso}.`,
          llamadas: [{ name: "proveedor_leer_solicitud", args: { caso } }],
          tokensUsados: 10,
        };
      }
      const leer = llamadasTurno.find((m) => m.toolName === "proveedor_leer_solicitud");
      const datos = leer ? JSON.parse(leer.content.replace(/^proveedor_leer_solicitud → /, "")) as { ok: boolean; data?: { campos: string[] }; error?: string } : null;
      if (!datos?.ok || !datos.data) return { texto: `No pude leer el caso ${caso}: ${datos?.error ?? "error"}.`, llamadas: [], tokensUsados: 10 };
      if (!hechas.has("proveedor_mapear_campos")) return { texto: "Mapeando los campos solicitados.", llamadas: [{ name: "proveedor_mapear_campos", args: { caso, campos: datos.data.campos } }], tokensUsados: 10 };
      const mapear = llamadasTurno.find((m) => m.toolName === "proveedor_mapear_campos");
      const mapeo = mapear ? JSON.parse(mapear.content.replace(/^proveedor_mapear_campos → /, "")) as { ok: boolean; data?: unknown; error?: string } : null;
      if (!mapeo?.ok || !mapeo.data) return { texto: `No pude mapear los campos: ${mapeo?.error ?? "error"}.`, llamadas: [], tokensUsados: 10 };
      if (!hechas.has("proveedor_generar_formulario")) return { texto: "Generando el formulario.", llamadas: [{ name: "proveedor_generar_formulario", args: { caso, mapeo: mapeo.data } }], tokensUsados: 10 };
      if (!hechas.has("proveedor_armar_paquete")) return { texto: "Armando el paquete.", llamadas: [{ name: "proveedor_armar_paquete", args: { caso } }], tokensUsados: 10 };
      const paquete = llamadasTurno.find((m) => m.toolName === "proveedor_armar_paquete");
      const estado = paquete ? JSON.parse(paquete.content.replace(/^proveedor_armar_paquete → /, "")) as { ok: boolean; data?: { listo_para_firma: boolean; ruta: string; checklist: string[] } } : null;
      const grupos = mapeo.data as { llenos: unknown[]; faltantes: unknown[]; requiere_confirmacion: unknown[] };
      return { texto: `Caso ${caso}: ${grupos.llenos.length} llenos, ${grupos.faltantes.length} faltantes y ${grupos.requiere_confirmacion.length} por confirmar. Paquete: ${estado?.data?.ruta ?? "no disponible"}; listo para firma: ${estado?.data?.listo_para_firma ? "sí" : "no"}. ${estado?.data?.checklist?.join("; ") ?? ""}`, llamadas: [], tokensUsados: 10 };
    },
  };
}

export function crearAdaptador(): AdaptadorLLM {
  switch (llmConfig.provider) {
    case "anthropic":
      return crearAnthropic();
    case "openai":
      return crearOpenAI();
    default:
      return crearMock();
  }
}