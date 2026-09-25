# Calos

Diario nutricional local. La app guarda cada comida, calcula calorías y macros diarios, y ofrece un chat preparado para delegar la interpretación al LLM local que se conectará más adelante.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Los datos se guardan en el directorio de usuario de la aplicación, en `nutrition.json`; no se envían a ningún servicio externo.

## Arquitectura

- `packages/core`: dominio nutricional, cálculos y almacenamiento JSON atómico.
- `apps/desktop/src/main`: Electron, persistencia y handlers IPC validados.
- `apps/desktop/src/preload`: API mínima y segura expuesta al renderer.
- `apps/desktop/src/renderer`: interfaz React.

El parser temporal del chat está aislado en `packages/core/src/nutrition/assistant.ts`. El siguiente paso será sustituirlo por un adaptador para el LLM local sin cambiar la UI ni la base de datos.
