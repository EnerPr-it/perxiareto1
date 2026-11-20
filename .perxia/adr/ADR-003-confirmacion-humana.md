# ADR-003: Exigir confirmación humana inmediata para simular envío
- **Estado**: aceptado
- **Fecha** · **Decisores** · **Etiquetas**: 2026-11-20 · Arquitectura del reto · seguridad, integridad, usabilidad

## Contexto

El sistema prepara formularios y soportes, pero el representante legal firma fuera del agente y el reto prohíbe el envío real. La única acción externa simulada es crear `ENVIO-SIMULADO.md`. El PRD exige una confirmación explícita en el turno inmediatamente anterior.

## Decisión

El backend mantendrá un estado de confirmación asociado a `sessionId` y `caso`, con referencia al turno que presentó la pregunta. `proveedor_simular_envio` solo aceptará `confirmado: true` cuando esa confirmación corresponda al mismo caso y al turno anterior. Cualquier otra combinación devolverá un error legible y no escribirá el archivo.

## Alternativas consideradas

- **Confirmación implícita por frases como “procesa el caso”**: reduce fricción, pero puede ejecutar una acción no pretendida. Se descarta por seguridad.
- **Confirmar una vez para toda la sesión**: mejora fluidez, pero amplía el alcance de una autorización y puede afectar otro caso. Se descarta por integridad.
- **Enviar realmente al cliente**: fuera de alcance y requeriría identidad, secretos, auditoría y controles adicionales. Se descarta.

## Consecuencias

Positivas: control explícito, prevención de acciones accidentales y estado visible en el frontend.

Negativas: requiere un turno adicional y persistencia mínima de estado de sesión; una sesión reiniciada debe pedir confirmación de nuevo.

## Verificación

Pruebas negativas deben intentar simular sin confirmación, con confirmación de otro caso y con confirmación antigua; todas deben rechazar y no crear `ENVIO-SIMULADO.md`. Una prueba positiva debe crear únicamente ese archivo después de la confirmación correcta.
