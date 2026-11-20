/** Contrato común de toda herramienta: nunca lanza, siempre devuelve JSON. */
export type ToolError = { ok: false; error: string };
export type ToolResult<T> = { ok: true; data: T } | ToolError;

export type EstadoCampo = "lleno" | "faltante" | "requiere_confirmacion";

export interface CampoMapeado {
  etiqueta: string;
  estado: EstadoCampo;
  ruta?: string | null;
  valor?: string | null;
  nota?: string | null;
}

export interface Mapeo {
  llenos: CampoMapeado[];
  faltantes: CampoMapeado[];
  requiere_confirmacion: CampoMapeado[];
}

export interface Contexto {
  directory: string;
  sessionId: string;
}

import type { ZodTypeAny } from "zod";

/** Argumentos de una herramienta: un esquema zod por campo. */
export type ArgsTool = Record<string, ZodTypeAny>;

/** Una herramienta expuesta al modelo. execute devuelve string JSON. */
export interface Herramienta<A> {
  description: string;
  args: ArgsTool;
  execute(args: A, ctx: Contexto): Promise<string>;
}