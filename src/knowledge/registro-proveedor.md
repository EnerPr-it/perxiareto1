# Conocimiento del proceso · Registro como proveedor

Proceso: preparar el registro de Periferia IT Group como proveedor ante clientes, a partir de una solicitud recibida por correo y de un repositorio interno de datos y soportes.

## Fuente de datos

- Solicitudes y plantillas: `casos/<caso>/`.
- Datos maestros: `repositorio/maestro.json`.
- Catálogo de soportes: `repositorio/soportes/index.json`.
- Sinónimos de etiquetas: `glosario-campos.json`.
- Salida: `out/<caso>/`.

El PRD menciona `fixtures/reto-01/`, pero la entrega coloca los archivos en la raíz. Se resuelve con una raíz configurable (`PERIFERIA_DATA_ROOT`) sin duplicar los originales.

## Estados de mapeo

- `lleno`: existe una ruta en el maestro y un valor.
- `faltante`: no existe la etiqueta en el glosario o no hay valor en el maestro.
- `requiere_confirmacion`: mapeo con confianza baja o regla de país.

## Reglas de país

- CO → NIT; EC, PE, PA → RUC; HN → RTN.
- El maestro solo tiene NIT colombiano. Para otros países, un identificador fiscal se propone con el NIT y se marca `requiere_confirmacion` («identificador extranjero»).

## Vigencias y bloqueos

- `vigencia_hasta` se evalúa contra la fecha de ejecución.
- Un soporte vencido o ausente bloquea `listo_para_firma`.
- Un campo faltante se reporta pero no bloquea la firma.
- `null` en vigencia significa «sin fecha de vencimiento registrada», no una equivalencia.

## Salidas

- `formulario.xlsx` (P0) o `formulario.pdf` (P1).
- `valores-portal.md` (P2) para copia manual; el portal no se automatiza.
- `paquete/` con `checklist.md` y `borrador-correo.md`.
- `log.jsonl` con `{ ts, herramienta, ok, resumen }`.
- `ENVIO-SIMULADO.md` solo con confirmación explícita.