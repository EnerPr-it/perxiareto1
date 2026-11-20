# Validación

## Pruebas ejecutadas

- `npm run typecheck` → sin errores.
- `npm test` → 23/23 pruebas locales (HU-1 a HU-5, chat mock, esquema de herramientas, XLSX por celda, mapeo adulterado, paquete y rutas inválidas).
- `npm run demo` → 4 casos procesados; resumen correcto; verificación de confirmación y caso inexistente.
- Servidor: `GET /api/health` → `{ ok, provider: mock, model: mock-1 }`.
- `POST /api/chat` con "Procesa el caso co-industrias-delta" → reply, 1 toolCall visible, sessionId.
- `GET /api/sessions/:id` → historial con 4 mensajes.
- UI en panel del navegador: carga, envío de mensaje, tool call visible y respuesta del asistente.
- `modulo/tools/proveedor.ts` importa y exporta las 5 herramientas + registro.

## Qué cubren las pruebas

- HU-1: lectura de solicitud, campos, soportes y caso inexistente sin excepción.
- HU-2: campo sin fuente queda `faltante` (nunca inventado); RTN/RUC extranjero queda `requiere_confirmacion`.
- HU-3: XLSX en ruta contractual; portal produce `valores-portal.md`.
- HU-4: soporte vencido y soporte ausente bloquean `listo_para_firma`; simulación sin confirmación falla y no escribe; con confirmación escribe.
- HU-5: todas las herramientas devuelven JSON `{ ok }` y no lanzan ante casos inexistentes.

## Qué NO se probó

- Ciclo conversacional con un proveedor LLM real (solo `mock`). El adaptador `anthropic`/`openai` no se ejecutó con clave.
- Contenido y orden del PDF generado contra la plantilla del cliente. El XLSX sí se verifica celda a celda en una plantilla real.
- Despliegue con link público.
- Flujo de confirmación completo a través del chat con modelo real.
- Pruebas de arquitectura (fitness functions) descritas en los ADRs: no están automatizadas todavía.

## Modo general local (2026-11-20)

- `npm test` → 16/16 pruebas; cinco nuevas cubren clasificación general/proveedor, derivación exacta sin herramientas, capacidades disponibles y aislamiento de herramientas de proveedor.
- `npm run typecheck` → sin errores. No hay script `lint` en `package.json`.
- No se probó respuesta general con LLM real, generación de entregables con herramientas de archivos ni cambio real de agente: esta app independiente no contiene el host de PERXIA ni un agente Build.

## Hallazgos

- `listo_para_firma = false` en todos los casos por la Cámara de Comercio vencida (vigencia 2026-09-30 frente a fecha de ejecución). Es el comportamiento correcto de RN3, no un defecto.
- La prueba de la HU-4 dependía de estado residual de `out/`; se corrigió limpiando el archivo antes de comprobar.