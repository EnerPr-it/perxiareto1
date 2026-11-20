/**
 * Módulo reutilizable: las MISMAS herramientas que usa la aplicación.
 * No es una copia: re-exporta la implementación única de src/tools/proveedor.ts,
 * de modo que servidor y módulo nunca divergen.
 */
export {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
  herramientas,
  type NombreHerramienta,
} from "../../src/tools/proveedor.ts";

export type {
  CampoMapeado,
  Contexto,
  Mapeo,
  ToolResult,
  EstadoCampo,
} from "../../src/tools/types.ts";