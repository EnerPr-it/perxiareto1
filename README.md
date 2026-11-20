# Registro como Proveedor · Agente conversacional

Agente que automatiza la preparación del registro de Periferia IT Group como proveedor ante clientes: lee la solicitud y su plantilla, cruza los campos con el repositorio maestro, genera el formulario en el formato pedido y arma el paquete de soportes listo para firma. No firma ni envía nada real.

## Requisitos

- Node.js 20 o superior (probado en Node 22).
- Una clave de proveedor LLM solo si vas a usar el ciclo real (el demo no la necesita).

## Levantar en local

```bash
npm install
npm run dev
```

`npm run dev` levanta frontend y backend en un solo comando. El servidor lee variables de entorno del proceso; copiar `.env.example` a `.env` no las carga automáticamente. Antes de iniciar con un modelo real, define `LLM_PROVIDER`, `LLM_API_KEY` y `LLM_MODEL` en el entorno del proceso. No hay URL pública desplegada; para la defensa se requiere desplegar la app o ejecutarla en local según la alternativa del PRD.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `LLM_PROVIDER` | `anthropic`, `openai` o `mock`. Por defecto `mock`. |
| `LLM_API_KEY` | Clave del proveedor. Solo backend; nunca en el front ni en logs. |
| `LLM_MODEL` | Modelo del proveedor. |
| `LLM_BASE_URL` | URL base opcional para proveedores compatibles. |
| `MAX_ITERATIONS` | Tope de iteraciones por turno (25 por defecto). |
| `MAX_TOKENS_PER_SESSION` | Tope de tokens por sesión (200000 por defecto). |
| `PORT` | Puerto del servidor (3000 por defecto). |
| `PERIFERIA_DATA_ROOT` | Raíz de datos. Por defecto la raíz del proyecto. |

## Demo sin modelo

```bash
npm run demo
```

Ejecuta las herramientas sobre todos los casos de `casos/` y muestra un resumen por caso. No requiere ninguna clave. `out/` se limpia al inicio para que el resultado sea determinista (salvo timestamps).

## Pruebas

```bash
npm test          # pruebas de HU-1 a HU-5
npm run typecheck # verificación de tipos
```

## API

| Método | Ruta | Cuerpo / respuesta |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId?, message }` → `{ sessionId, reply, toolCalls[], needsConfirmation }` |
| `GET` | `/api/sessions/:id` | Historial completo de la sesión |
| `GET` | `/api/health` | `{ ok, provider, model }` sin exponer claves |

## Estructura

```
agent/prompt.md            # comportamiento del agente
src/server.ts              # API HTTP y ciclo
src/agent/cycle.ts         # bucle del agente con tope de iteraciones
src/llm/adapter.ts         # puerto del proveedor + implementaciones
src/tools/proveedor.ts     # herramientas tipadas (zod)
src/knowledge/             # conocimiento del proceso (dominio puro + markdown)
web/                       # frontend de chat
casos/ repositorio/        # fixtures (solo lectura)
out/                       # artefactos por caso (escrito en ejecución)
modulo/                    # agente empaquetado para otras plataformas
demo.ts                    # herramientas sin modelo
```

## Uso

1. Abre `http://localhost:3000`.
2. Escribe, por ejemplo: `Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles faltan y si el paquete está listo para firma. No envíes nada todavía.`
3. Revisa las llamadas a herramienta en el chat y el estado del paquete.
4. Un segundo mensaje de confirmación para el mismo caso habilita la simulación de envío (`ENVIO-SIMULADO.md`). Sin confirmación explícita en el turno siguiente, no se escribe. Con `mock`, el chat recorre las cuatro herramientas de preparación sin red; un proveedor real sigue pendiente de prueba.

## Datos

Los fixtures viven en `casos/` y `repositorio/`; el PRD los nombra bajo `fixtures/reto-01/`. La raíz es configurable con `PERIFERIA_DATA_ROOT` y se resuelve sin duplicar los originales.

## Módulo reutilizable (`modulo/`)

`modulo/agent.md`, `modulo/tools/proveedor.ts` y `modulo/skill/registro-proveedor/SKILL.md` permiten integrar el agente en otras plataformas sin el servidor. `proveedor.ts` re-exporta las mismas herramientas que usa la aplicación, así que no hay copias divergentes.