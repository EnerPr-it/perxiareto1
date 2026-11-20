# Estado del proyecto

Etapa actual: implementación local reforzada sobre Node 20+/tsx. Herramientas tipadas, ciclo con confirmación vinculada al caso y turno, adaptadores LLM, API, chat y demo. `npm test` 23/23, `npm run typecheck` y `npm run demo` correctos.

Decisiones: las herramientas siguen siendo la fuente de valores; casos y soportes se validan contra rutas permitidas; el mapeo se vuelve a comprobar contra maestro antes de escribir; la confirmación de envío se conserva en sesión y no se expone como tool call del modelo.

Sigue: configurar y probar proveedor/modelo real, extraer/verificar PDF, desplegar una URL pública o preparar defensa local, y automatizar fitness functions. El modo general/Build sigue siendo adicional al PRD y no puede cambiar de agente desde esta app independiente.
