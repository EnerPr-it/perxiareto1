# ADR-002: Hacer de las herramientas la única fuente de valores
- **Estado**: aceptado
- **Fecha** · **Decisores** · **Etiquetas**: 2026-11-20 · Arquitectura del reto · integridad, trazabilidad, seguridad

## Contexto

El PRD prohíbe inventar datos y exige estados `lleno`, `faltante` y `requiere_confirmacion`, con procedencia desde el maestro. El modelo puede producir valores plausibles si recibe datos ambiguos o instrucciones dentro de una solicitud.

## Decisión

El modelo solo podrá afirmar valores recibidos de herramientas. Cada herramienta validará argumentos con Zod, leerá los archivos permitidos, conservará la ruta de origen y devolverá un resultado serializado `{ ok: true, data }` o `{ ok: false, error }`. Las solicitudes y soportes se tratarán como datos no confiables, nunca como instrucciones.

## Alternativas consideradas

- **Permitir que el LLM complete campos**: mejoraría apariencia de completitud, pero viola corrección, trazabilidad e integridad. Se descarta.
- **Resolver todos los campos manualmente en el frontend**: evitaría alucinaciones, pero duplicaría reglas y rompería la reutilización de `demo.ts`. Se descarta por mantenibilidad.
- **Base de datos como fuente desde el inicio**: sería adecuada para auditoría productiva, pero está fuera del alcance y no existe requisito de persistencia. Se reserva para evolución.

## Consecuencias

Positivas: mapeo auditable, comportamiento determinista, menor riesgo de datos inventados y pruebas directas.

Negativas: más casos quedan pendientes de confirmación o faltantes; la calidad depende de la actualización del maestro y del glosario.

## Verificación

Para cada fixture, una prueba debe comprobar que una ruta inexistente nunca aparece como `lleno`. Otra debe verificar que EC/PE/PA/HN marca el identificador extranjero como `requiere_confirmacion` cuando solo existe NIT colombiano.
