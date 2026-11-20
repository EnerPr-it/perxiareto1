# Historias de usuario del PRD

| ID | Estado | Criterio pendiente |
|---|---|---|
| HU-1 Leer solicitud | implementada | Lectura probada; falta validar recuperación de plantilla corrupta y ambigüedad fiscal en esta salida. |
| HU-2 Mapear campos | implementada | Glosario, procedencia y regla fiscal probados; falta ciclo con LLM real. |
| HU-3 Generar formulario | implementada | XLSX verificado por celda; PDF generado pero su contenido no se extrajo en prueba; portal produce valores copiables. |
| HU-4 Armar paquete | implementada | Soportes, vigencia, formulario y confirmación en chat mock; falta ciclo con LLM real. |
| HU-5 Manejo de errores | implementada | Respuestas tipadas y caso inválido probados; falta probar fallo real del proveedor. |

23/23 pruebas locales; ninguna HU se marca validada de extremo a extremo hasta ejercitar el modelo real y comprobar el PDF.
