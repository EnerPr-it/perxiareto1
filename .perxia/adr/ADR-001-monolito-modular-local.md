# ADR-001: Usar un monolito modular local
- **Estado**: aceptado
- **Fecha** · **Decisores** · **Etiquetas**: 2026-11-20 · Arquitectura del reto · estructura, mantenibilidad, portabilidad

## Contexto

El PRD exige frontend, backend, ciclo del agente, herramientas, adaptador LLM y sesiones, pero excluye autenticación, multiusuario, base de datos e integraciones reales. El volumen esperado es de 8–12 solicitudes mensuales. La solución debe poder ejecutarse localmente con un comando y permitir importar las herramientas desde `demo.ts`.

## Decisión

Usaremos un monolito modular TypeScript ejecutable con Bun o Node 20+. Separaremos web, servidor, ciclo, adaptador LLM, herramientas, conocimiento, fixtures y salidas por contratos de módulo.

## Alternativas consideradas

- **Microservicios**: mejorarían el aislamiento de despliegue, pero añadirían latencia, operación y contratos distribuidos sin una necesidad de volumen o disponibilidad. Se descartan por eficiencia, mantenibilidad y time-to-market.
- **Frontend con lógica directa sobre archivos**: reduciría piezas, pero rompería la separación de seguridad y permitiría que el cliente leyera fixtures o conociera reglas internas. Se descarta por seguridad y trazabilidad.
- **Servidor monolítico sin módulos**: sería rápido inicialmente, pero acoplaría HTTP, LLM y reglas de negocio, dificultando pruebas y reemplazo del proveedor. Se descarta por mantenibilidad.

## Consecuencias

Positivas: ejecución simple, bajo costo, herramientas reutilizables en `demo.ts`, pruebas locales y evolución gradual.

Negativas: una instancia concentra el flujo y no resuelve concurrencia distribuida ni alta disponibilidad. Esa deuda es aceptable para el reto y debe revisarse antes de producción.

## Verificación

Una prueba de arquitectura impedirá imports desde `web` hacia `src/tools` o fixtures. `demo.ts` debe ejecutar sin clave LLM. La API debe responder `/api/health` sin exponer secretos.
