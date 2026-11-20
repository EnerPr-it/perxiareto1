# Plan: PERXIA general chat mode

## 1. Objetivo

Implementar el comportamiento de chat general de PERXIA: responder preguntas generales y mantener conversaciones directamente, y enrutar las solicitudes de entregables según las capacidades reales disponibles en el turno.

## 2. Reglas funcionales

- Las preguntas generales, consultas informativas y conversación se responden directamente, sin pedir cambio de agente.
- Se consideran entregables las solicitudes de documentos, presentaciones, hojas de cálculo, código o cambios en archivos.
- Antes de responder a una solicitud de entregable, el sistema verifica las herramientas realmente disponibles en el turno.
- Si existen herramientas de archivos o shell porque la persona seleccionó un agente completo como Build, el agente produce el entregable directamente y no solicita cambiar de agente.
- Si no existen herramientas de archivos ni shell, el agente ofrece el cambio a Build en una sola frase breve.
- La respuesta sin herramientas debe terminar con un fence `agent-switch` cuyo único contenido sea `build`.
- No se debe indicar que la persona cambie manualmente el agente desde el composer.
- La detección de capacidades debe basarse en herramientas presentes en el turno, no en supuestos sobre el modelo o el entorno.

## 3. Alcance

### Incluido

- Clasificación de intención entre conversación general y solicitud de entregable.
- Detección de solicitudes de documentos, presentaciones, hojas de cálculo, código y cambios de archivos.
- Ruta de ejecución directa cuando hay herramientas suficientes.
- Ruta de derivación a Build cuando no hay herramientas de archivos ni shell.
- Formato exacto y corto de la respuesta de derivación.
- Pruebas de casos positivos, negativos y fronterizos.

### Fuera de alcance

- Crear un nuevo agente o cambiar la configuración global de agentes.
- Inventar herramientas que no estén expuestas en el turno.
- Ejecutar entregables en nombre del usuario cuando faltan herramientas necesarias.
- Cambiar el comportamiento de dominios especializados que ya tengan un flujo propio.
- Modificar el contrato visual del chat salvo lo necesario para renderizar el botón `agent-switch`.

## 4. Diseño técnico

- Centralizar la decisión en una política de enrutamiento reutilizable, separada de la generación de la respuesta.
- Representar las capacidades disponibles como un conjunto derivado de las herramientas efectivamente expuestas al agente.
- Mantener separadas las dos decisiones: intención del usuario y capacidad de ejecución.
- Considerar una solicitud como ejecutable solo cuando las herramientas requeridas para ese entregable están disponibles.
- No incluir instrucciones de cambio manual del agente en la respuesta.
- Mantener el fence sin texto adicional dentro del bloque:

```agent-switch
build
```

## 5. Tareas

| # | Tarea | Dependencias | Resultado |
|---|---|---|---|
| 1 | Inventariar el punto de entrada del modo general, el contrato de herramientas y el renderizador de `agent-switch` | Ninguna | Ubicación exacta de la política y del parser |
| 2 | Definir la matriz de intenciones generales frente a entregables | 1 | Casos y palabras de referencia sin depender solo de palabras clave |
| 3 | Implementar la detección de capacidades del turno | 1 | Decisión basada en herramientas reales disponibles |
| 4 | Implementar la ruta directa de entregables cuando hay herramientas | 2–3 | El agente genera o modifica el archivo sin derivar |
| 5 | Implementar la ruta de derivación cuando no hay herramientas | 2–3 | Una frase breve seguida exclusivamente del fence requerido |
| 6 | Cubrir conversación general sin herramientas de archivo | 2–3 | Respuestas directas sin derivación innecesaria |
| 7 | Añadir pruebas unitarias y de integración para ambas rutas | 4–6 | Evidencia de clasificación, capacidades y formato |
| 8 | Ejecutar lint, typecheck y pruebas; registrar resultados | 7 | Gate local y pendientes explícitos |

## 6. Casos de aceptación

1. Una pregunta general recibe respuesta directa y no contiene `agent-switch`.
2. Una conversación casual recibe respuesta directa y no solicita Build.
3. Una solicitud de código con herramientas de archivos disponibles se ejecuta en el agente actual.
4. Una solicitud de modificación de archivo con herramientas de archivos disponibles se ejecuta en el agente actual.
5. Una solicitud de documento, presentación u hoja de cálculo sin herramientas de archivos ni shell recibe una sola frase breve y termina con el fence `agent-switch` cuyo contenido es exactamente `build`.
6. La respuesta sin herramientas no contiene instrucciones para cambiar el agente manualmente.
7. La ausencia de una herramienta opcional no provoca derivación si el entregable puede producirse con las herramientas disponibles.
8. El sistema no afirma haber creado o modificado archivos cuando no pudo hacerlo.
9. Las herramientas presentes en el turno prevalecen sobre la identidad nominal del agente.
10. Las respuestas conservan el idioma y el tono de la conversación actual.

## 7. Pruebas previstas

- Pregunta factual general.
- Conversación casual y seguimiento contextual.
- Solicitud de código con herramientas disponibles.
- Solicitud de cambio de archivo con herramientas disponibles.
- Solicitud de documento sin herramientas de archivos ni shell.
- Solicitud de presentación sin herramientas de archivos ni shell.
- Solicitud ambigua que menciona un archivo pero pide explicación, no modificación.
- Solicitud que mezcla una pregunta general y un entregable.
- Verificación del fence exacto y ausencia de texto posterior.
- Verificación de que no se ejecutan comandos ni se inventan rutas cuando faltan herramientas.

## 8. Archivos a revisar o cambiar

- Punto de entrada del modo general y política de enrutamiento.
- Definiciones de capacidades o herramientas expuestas al modelo.
- Renderizador/parser del fence `agent-switch`.
- Pruebas del chat general y del cambio de agente.
- Documentación de comportamiento, si existe dentro del proyecto.

No modificar fixtures, credenciales, integraciones externas ni contratos de dominios especializados sin una necesidad demostrada por las pruebas.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Derivar una solicitud que el agente actual sí puede ejecutar | Consultar capacidades reales del turno antes de derivar |
| Intentar crear un archivo sin herramientas | Bloquear la ruta de ejecución y usar el fence exacto |
| Clasificar una explicación como cambio de archivo | Considerar verbo, intención y necesidad de persistencia |
| Romper el parser del botón | Prueba de igualdad exacta del bloque `agent-switch` |
| Prometer un entregable no generado | Responder solo después de completar la operación o declarar la limitación |

## 10. Definition of Done

- La política distingue conversación general y entregables.
- La ejecución directa usa las herramientas disponibles y no deriva innecesariamente.
- La derivación sin herramientas cumple exactamente el contrato `agent-switch`.
- Existen pruebas para ambas rutas y para casos ambiguos.
- Lint, typecheck y pruebas disponibles pasan; los comandos no disponibles quedan documentados.
- No se inventan archivos, URLs, capacidades ni resultados.
