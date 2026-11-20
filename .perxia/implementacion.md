# Implementación

Aplicación funcional del reto, alineada con `SOLUCION.md` y los ADRs. Cubre HU-1 a HU-5 a nivel de herramientas, API y chat.

## Qué se implementó

- `src/config.ts`: raíz de datos configurable (`PERIFERIA_DATA_ROOT`) que resuelve `fixtures/reto-01/` o la raíz actual sin duplicar. Límites de iteraciones/tokens.
- `src/knowledge/registro-proveedor.ts`: dominio puro (reglas de país, vigencias, lectura de rutas del maestro, bloqueo de firma).
- `src/tools/proveedor.ts`: las 5 herramientas tipadas con zod, con envoltorio que captura excepciones, valida argumentos y registra `log.jsonl`. Devuelven `{ ok: true, data }` o `{ ok: false, error }`; nunca lanzan.
- `src/llm/adapter.ts`: puerto del proveedor con implementaciones `anthropic`, `openai` y `mock` (sin red). Cambiar de proveedor no toca el ciclo.
- `src/agent/cycle.ts`: ciclo prompt → modelo → herramientas → respuesta, con tope de iteraciones y de tokens, validación zod de argumentos y detección de confirmación.
- `src/server.ts`: API `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health`, sesiones en memoria y servido del frontend.
- `web/`: chat con historial, tool calls colapsables, resaltado de confirmación y panel de estado, según `.perxia/design-system.md`.
- `agent/prompt.md` y `src/knowledge/registro-proveedor.md`: comportamiento y conocimiento separados de la ejecución.
- `demo.ts`: ejecuta las herramientas sobre todos los casos sin modelo ni clave.
- `modulo/`: `agent.md`, `tools/proveedor.ts` (re-exporta las mismas herramientas) y `skill/registro-proveedor/SKILL.md`.

## Decisiones tomadas al implementar

- Runtime: Node 20+ con `tsx` (no había bun en la máquina). Se mantiene compatibilidad con bun por usar API estándar.
- Formatos: `exceljs` para XLSX (respeta hoja/celda de `plantilla-celdas.json`) y `pdfkit` para PDF generado (no AcroForm), como acepta el PRD.
- Confirmación: verificada en el ciclo; `proveedor_simular_envio` rechaza sin `confirmado: true`. El portal nunca se envía.
- El módulo reutilizable re-exporta `src/tools/proveedor.ts` para que no existan copias divergentes (requisito del bonus).

## Ajustes de cierre del PRD (2026-11-20)

- `src/tools/proveedor.ts`: valida rutas de casos/soportes; contrasta el mapeo contra el maestro antes de escribir formularios; incluye el formulario en el paquete o bloquea por ausencia; normaliza errores internos.
- `src/agent/cycle.ts` y `src/llm/adapter.ts`: esquemas JSON con tipos reales; resultados ligados a identificadores de tool calls; confirmación de caso solo en el turno siguiente y herramienta de simulación no expuesta al LLM. El mock recorre lectura, mapeo, formulario y paquete.
- `web/app.js`: reemplaza interpolación HTML del checklist por nodos de texto.
- `src/tools/proveedor.test.ts` y `src/agent/general-chat.test.ts`: pruebas de celdas XLSX, mapeo adulterado, paquete, ruta, esquema y confirmación en chat mock.
- `SOLUCION.md` y `README.md`: alcance pendiente, diseño del portal, cobertura y estado real de proveedor/despliegue.

## Pendientes

- Elegir proveedor LLM real y modelo: el adaptador está listo, pero solo `mock` funciona sin clave. Falta `LLM_API_KEY`, `LLM_MODEL` y una corrida real del ciclo con modelo para validar el comportamiento conversacional completo (el mock solo demuestra el bucle).
- Despliegue con link público (Vercel/Render/etc.) o defensa en local.
- `ENVIO-SIMULADO.md` se probó con la herramienta; falta probarlo vía chat con confirmación real de un proveedor no-mock.
- El modo general local se implementó en `src/agent/general-chat.ts` y `src/agent/cycle.ts`: preguntas generales no exponen herramientas de proveedor; los entregables sin herramientas de archivos/shell devuelven el fence `agent-switch`; los casos de proveedor conservan su ruta. El mock declara que no puede responder preguntas generales. `web/app.js` muestra que Build no está disponible en esta app independiente, sin simular un cambio de agente. Pendiente integrar con el host de PERXIA para que el botón real pueda cambiar de agente y reenviar la solicitud.
