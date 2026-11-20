# Arquitectura base · Registro como proveedor

## Estado

Propuesta base alineada con `PRD-01-agente-registro-proveedor 3_0452.md`. No se agregan integraciones ni despliegues fuera del alcance del reto.

## Decisión principal

Monolito modular TypeScript con frontend de chat, backend HTTP, ciclo del agente, adaptador LLM y herramientas tipadas. El sistema lee archivos locales y escribe bajo `out/`.

## Límites

- El frontend no lee fixtures, no conoce secretos y no ejecuta herramientas.
- El backend orquesta, mantiene sesiones y normaliza errores; no contiene reglas específicas de campos.
- Las herramientas son la única fuente de valores afirmables y no lanzan excepciones al agente.
- El LLM es un adaptador reemplazable y no una fuente de datos.
- Los archivos de solicitud y soportes son datos no confiables.
- No se firma, envía correo real, cargan portales ni ingresan credenciales.

## Vistas

Las vistas C4 de contexto, contenedores y el ciclo de interacción están en `SOLUCION.md`. Se expresan en Mermaid porque el PRD exige documentar la arquitectura y no exige un formato gráfico propietario.

## Contratos

- Herramientas: `{ ok: true, data } | { ok: false, error }`, serializado como string.
- API: `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health`.
- Salida: `out/<caso>/` con formulario, paquete, checklist, borrador, logs y eventual `ENVIO-SIMULADO.md`.
- Confirmación: caso específico y turno inmediatamente anterior.

## Verificación

- Fitness function de dependencias: frontend no importa herramientas ni acceso a archivos; dominio/reglas no importa HTTP ni proveedor LLM.
- Fitness function de seguridad: ninguna salida de log o API contiene claves; los borradores no contienen cuentas bancarias.
- Fitness function de control: sin confirmación válida no existe `ENVIO-SIMULADO.md`.
- Fitness function de trazabilidad: cada herramienta produce un registro `log.jsonl` con `ts`, herramienta, `ok` y resumen.
- Fitness function de determinismo: `demo.ts` produce el mismo resultado funcional para cada fixture.

## Pendientes para Implementación

- Crear `agent/prompt.md`, `src/knowledge/`, `src/llm/`, `src/tools/`, `src/server.ts`, `web/` y `demo.ts`.
- Fijar proveedor LLM y límites concretos de tokens/timeout.
- Implementar pruebas para HU-1 a HU-5 y las fitness functions.
