# Pruebas

- No crear tests unitarios. Validar los cambios con pruebas E2E.
- Ejecutar la aplicación web real con Playwright, API HTTP y datos temporales aislados.
- Simular únicamente el proveedor externo OpenRouter; conservar la interfaz, API HTTP,
  cálculo y persistencia reales.

# Modelo del asistente

- El asistente de Calos debe usar modelos disponibles en OpenRouter y realizar las
  peticiones a través de su API, también para imágenes y conversaciones sobre platos.
- Se puede cambiar el modelo dentro de OpenRouter; mantener la clave en el servidor
  de la API y fuera del navegador.
