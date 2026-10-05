# Identidad de Calos

El símbolo une una «c» abierta, que recuerda al borde de un plato, y una semilla.
La forma conserva la lectura a tamaños pequeños y el verde de la interfaz.

- Verde oscuro: `#193C2E`.
- Blanco del símbolo: `#F2F7ED`.
- Semilla: `#B8DE78` sobre verde; `#739C3B` en la versión para fondos claros.

El original vectorial está en
`apps/desktop/src/renderer/public/branding/calos-icon.svg`.
`calos-mark.svg` es la versión sin fondo para superficies claras.
La app usa el SVG en la barra lateral y el favicon, y un PNG de 256 px en Electron.
El nombre mantiene la tipografía del producto.

Los PNG de 16, 32, 64, 256, 512 y 1024 px y el ICO se exportan desde el mismo SVG:

```bash
pnpm icons:export
```

El exportador usa Chromium incluido en Electron y requiere una sesión gráfica
(o `xvfb-run -a pnpm icons:export` en Linux sin escritorio). Las exportaciones
están versionadas; no hay que regenerarlas para desarrollar o compilar la app.
El ICO queda preparado para un futuro empaquetado de Windows.
