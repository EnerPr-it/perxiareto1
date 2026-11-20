import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del proyecto (carpeta que contiene src/). */
export const projectRoot = resolve(here, "..");

/**
 * Resuelve la raíz de datos. El PRD nombra `fixtures/reto-01/`, pero la entrega
 * coloca los archivos en la raíz. Se usa una sola raíz configurable sin duplicar.
 */
export function resolveDataRoot(): string {
  const fromEnv = process.env.PERIFERIA_DATA_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  const candidates = [
    join(projectRoot, "fixtures", "reto-01"),
    projectRoot,
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "glosario-campos.json"))) return candidate;
  }
  return projectRoot;
}

export const dataRoot = resolveDataRoot();

export const paths = {
  dataRoot,
  casos: join(dataRoot, "casos"),
  maestro: join(dataRoot, "repositorio", "maestro.json"),
  soportesIndex: join(dataRoot, "repositorio", "soportes", "index.json"),
  soportes: join(dataRoot, "repositorio", "soportes"),
  glosario: join(dataRoot, "glosario-campos.json"),
  out: join(projectRoot, "out"),
  prompt: join(projectRoot, "agent", "prompt.md"),
  knowledge: join(projectRoot, "src", "knowledge", "registro-proveedor.md"),
} as const;

export const limits = {
  maxIterations: Number.parseInt(process.env.MAX_ITERATIONS ?? "25", 10),
  maxTokensPerSession: Number.parseInt(
    process.env.MAX_TOKENS_PER_SESSION ?? "200000",
    10,
  ),
} as const;

export const llmConfig = {
  provider: (process.env.LLM_PROVIDER ?? "mock").toLowerCase(),
  apiKey: process.env.LLM_API_KEY ?? "",
  model: process.env.LLM_MODEL ?? "",
  baseUrl: process.env.LLM_BASE_URL ?? "",
} as const;