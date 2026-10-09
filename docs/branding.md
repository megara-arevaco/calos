# Identidad de Calos

El símbolo une una «c» abierta, que recuerda al borde de un plato, y una semilla.
La forma conserva la lectura a tamaños pequeños y el verde de la interfaz.

- Verde oscuro: `#193C2E`.
- Blanco del símbolo: `#F2F7ED`.
- Semilla: `#B8DE78` sobre verde; `#739C3B` en la versión para fondos claros.

El original vectorial está en
`apps/web/public/branding/calos-icon.svg`.
`calos-mark.svg` es la versión sin fondo para superficies claras.
La web usa el SVG en la barra lateral y el favicon.
El nombre mantiene la tipografía del producto.

Los PNG de 16, 32, 64, 256, 512 y 1024 px y el ICO se exportan desde el mismo SVG:

```bash
pnpm icons:export
```

El exportador usa Chromium con Playwright en modo headless. Instálalo con
`pnpm --filter @calos/web exec playwright install chromium`. Las exportaciones
mantienen el fondo transparente y proceden del original vectorial.
