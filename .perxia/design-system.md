# Sistema visual · Registro como proveedor

Contrato para la futura interfaz de chat; fuente visual: identidad Periferia IT Group de la skill `perxia-design`, sin identidad propia detectada en el repositorio. Propuesta de diseño en `design/registro-proveedor/canvas.html`, no frontend implementado.

- Marca: lockup oficial en sidebar oscuro y cabecera clara; no sustituir por texto.
- Color: ink `#212121`, primario `#15601d`, acento sobre oscuro `#6dfd8c`, soft `#bfe8c0`, mist `#ccffd6`, superficie `#ffffff`, fondo propuesto `#f6faf6`. Verde vibrante nunca texto sobre claro.
- Tipo: Outfit Bold para títulos (34/19 px en tablero); Montserrat para cuerpo 14/1.6 y metadatos 12/1.6. Fallbacks solo si las fuentes no están disponibles.
- Espaciado: 4/8/12/16/24/32 px; tres columnas en mockup de 1200 px: casos 250, chat flexible y resumen 292. Bordes de tarjetas 16–20 px; botones píldora 999 px; borde suave `#bfe8c0`, sin sombra obligatoria.
- Estados de flujo: `lleno`, `faltante`, `requiere_confirmacion` y bloqueos de soportes se explican con texto, no solo color. La llamada de herramienta muestra nombre, argumentos y resultado resumidos. La aprobación es un bloque prioritario e inequívoco.
- Interacción: hover de enlaces en verde profundo y subrayado; foco visible con contorno 3 px `#15601d`; deshabilitado con texto de razón, nunca solo opacidad. Ninguna acción externa por defecto.
- Accesibilidad: contraste mínimo 4,5:1 para texto; etiquetas legibles y controles con nombre accesible al implementarse. Maqueta visual sin lógica funcional ni verificación E2E.

Decisión: interfaz clara para lectura extensa, riel oscuro para orientación, revisión en mist; el usuario debe distinguir resultados demostrados de valores que requieren validación. No hay Figma, PDF ni tokens externos aportados por el usuario, por lo que no existe un contrato de origen adicional.
