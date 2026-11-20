import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";

import { llmConfig, limits, projectRoot } from "./config.ts";
import { crearAdaptador } from "./llm/adapter.ts";
import { ejecutarTurno, type Sesion } from "./agent/cycle.ts";

const sesiones = new Map<string, Sesion>();
const webRoot = join(projectRoot, "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(data);
}

async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function servirEstatico(res: ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  try {
    const contenido = await readFile(join(webRoot, safe));
    res.writeHead(200, { "content-type": MIME[extname(safe)] ?? "application/octet-stream" });
    res.end(contenido);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  }
}

async function manejar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const ruta = url.pathname;

  if (ruta === "/api/health" && req.method === "GET") {
    const adaptador = crearAdaptador();
    return json(res, 200, {
      ok: true,
      provider: adaptador.nombre(),
      model: adaptador.modelo(),
    });
  }

  if (ruta === "/api/chat" && req.method === "POST") {
    let body: { sessionId?: string; message?: string };
    try {
      body = JSON.parse(await leerCuerpo(req)) as typeof body;
    } catch {
      return json(res, 400, { ok: false, error: "cuerpo JSON inválido" });
    }
    if (!body.message || typeof body.message !== "string") {
      return json(res, 400, { ok: false, error: "falta el campo message" });
    }
    const id = body.sessionId ?? randomUUID();
    let sesion = sesiones.get(id);
    if (!sesion) {
      sesion = { id, mensajes: [], tokensUsados: 0 };
      sesiones.set(id, sesion);
    }
    try {
      const resultado = await ejecutarTurno(sesion, body.message, { directory: projectRoot });
      return json(res, 200, {
        sessionId: id,
        reply: resultado.reply,
        toolCalls: resultado.toolCalls,
        needsConfirmation: resultado.needsConfirmation,
      });
    } catch {
      return json(res, 200, {
        sessionId: id,
        reply: "Ocurrió un problema. La sesión sigue activa.",
        toolCalls: [],
        needsConfirmation: false,
      });
    }
  }

  const sesionMatch = ruta.match(/^\/api\/sessions\/(.+)$/);
  if (sesionMatch && req.method === "GET") {
    const id = decodeURIComponent(sesionMatch[1]!);
    const sesion = sesiones.get(id);
    if (!sesion) return json(res, 404, { ok: false, error: "sesión no encontrada" });
    return json(res, 200, { sessionId: id, messages: sesion.mensajes });
  }

  if (ruta.startsWith("/api/")) {
    return json(res, 404, { ok: false, error: "ruta no encontrada" });
  }

  return servirEstatico(res, ruta);
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const server = createServer((req, res) => {
  manejar(req, res).catch(() => {
    if (!res.headersSent) json(res, 500, { ok: false, error: "error interno" });
  });
});

server.listen(port, () => {
  const adaptador = crearAdaptador();
  console.log(`Registro como proveedor escuchando en http://localhost:${port}`);
  console.log(`Proveedor: ${adaptador.nombre()} · modelo: ${adaptador.modelo()} · iteraciones máx: ${limits.maxIterations}`);
});

export { server };