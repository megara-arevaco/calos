# Arquitectura de Calos

Calos sigue la organización de `/home/baul/Projects/nemeton`, adaptada al dominio nutricional. La referencia es su implementación: `packages/core`, `apps/desktop/src/main/context.ts`, `main/ipc/handle.ts`, `shared/ipc-contracts.ts`, `renderer/components/*/*.hook.ts` y `renderer/queries`.

## Límites de responsabilidad

- `packages/core/src/nutrition`: tipos y reglas nutricionales, catálogo USDA, alimentos personalizados, almacenamiento y servicio del asistente. No importa Electron ni React. `nutrition/index.ts` expone la API pública del dominio.
- `nutrition/assistant`: esquemas de respuestas, instrucciones, construcción del contexto, resolución de fuentes y reglas de corrección. `assistant.ts` coordina interpretación, validación, cálculo y escritura. El cliente de OpenRouter se puede sustituir en pruebas.
- `packages/core/src/shared/persistence.ts`: lectura limitada, escritura atómica y bloqueos por ruta normalizada, incluidos servicios que llaman a otros servicios dentro del mismo bloqueo. Un error de lectura no se trata como un diario vacío.
- `apps/desktop/src/main`: composición de dependencias, configuración privada, ventanas y acceso a servicios de core. Los handlers reciben un `MainContext` explícito.
- `apps/desktop/src/shared/ipc-contracts.ts`: única definición de canales y argumentos IPC. El preload usa sus tipos; main valida los argumentos y el origen antes de ejecutar cada handler.
- `apps/desktop/src/preload`: API limitada de `window.calos`. No expone credenciales ni operaciones genéricas de Electron o del sistema de archivos.
- `apps/desktop/src/renderer/queries`: lecturas y mutaciones IPC con React Query, claves centralizadas e invalidación tras cambios. Las mutaciones no se reintentan automáticamente para evitar duplicar registros.
- `renderer/components/<Nombre>`: componente de presentación, hook de interacción cuando corresponde y `index.ts` como entrada pública. Los hooks mantienen estado de interfaz; los datos persistidos pertenecen a la caché de consultas. Navegación y selección de fecha viven en `App.hook.ts`.
- `renderer/shared`: presentación y utilidades de interfaz. El renderer solo importa tipos de core y no importa Electron ni módulos de Node.

## Decisiones conservadas

El diario mantiene su formato. `LocalProfiles` conserva un registro de perfiles y un archivo por UUID; la migración copia el diario antiguo antes de publicar el registro y no modifica el original. Cada IPC recibe y valida el perfil, y cada clave de consulta incluye su UUID. Al seleccionar otra persona, el workspace se vuelve a montar y descarta el chat y la foto pendientes. Una petición en curso sigue vinculada al perfil que la inició. Los nuevos registros usan timestamps ISO con desplazamiento local para conservar el día del diario; los registros históricos mantienen su fecha guardada. La versión empaquetada carga y confía exclusivamente en su documento local, ignorando la URL de desarrollo. Fotos legibles, datos escritos del usuario, referencias personales y USDA conservan su precedencia. `estimate.ts` valida valores aproximados por 100 g y construye una fuente «Estimación» con sus suposiciones. Se usa cuando no hay una referencia exacta; los avisos del chat se generan después de guardar y el diario mantiene su etiqueta visible. Si quedan nutrientes estimados tras una corrección parcial, la procedencia continúa siendo aproximada. El contexto se construye en core con datos recién leídos; el renderer solo indica pestaña y fecha. El chat, los borradores y los formularios permanecen montados al cambiar de pestaña.

No se trasladan a Calos servicios propios de juegos, sincronización, backups, temas o distribución de Nemeton. Se comparten los patrones de separación y sus comprobaciones, no funciones ajenas al producto.

Las correcciones usan identificadores de los registros del contexto, validan que los datos no hayan cambiado durante la consulta al modelo y se escriben como una única operación atómica. Las referencias personales actualizan también sus consumos vinculados. Las respuestas que confirman cambios se construyen con el resultado persistido; una respuesta libre del modelo no sirve como confirmación de escritura. La mutación del chat invalida el diario y el historial completos para cubrir cambios de fecha y referencias compartidas.

El flujo `assistant/plate.ts` usa un esquema independiente de la lectura de etiquetas.
Mantiene un borrador de ingredientes, pesos, procedencia y preguntas en la interfaz,
que se valida por IPC. Cada turno incluye el borrador y la imagen en OpenRouter.
Una llamada independiente `plate_answers` verifica las respuestas a preguntas pendientes antes de registrar.
Solo se resuelven nutrientes y se guarda cuando hay ingredientes con pesos y no
quedan preguntas. La fuente conserva `photoEstimate` incluso si el cálculo procede
de USDA; identificar visualmente un ingrediente no se presenta como exacto.

`assistant/volumes.ts` conserva volúmenes explícitos sin etiqueta y estima la
densidad mediante una respuesta estructurada independiente. Valida índices,
densidades y pesos antes de resolver o escribir ningún consumo. `volumeEstimate`
conserva los ml, el factor y el supuesto; el recibo y el diario señalan la conversión
aproximada aunque los nutrientes procedan de USDA. Las etiquetas por 100 ml no
pasan por esta conversión. El modo sin estimaciones pide solo los datos del líquido.

`plan-schema.ts` valida objetivos y macros. `dailyGoal` sigue siendo la fuente
que consume el diario; `objectives` conserva objetivo, peso/fecha opcionales,
hábitos y notas. El objetivo textual del perfil se sincroniza al guardar.
`saveNutritionPlan` compara el plan anterior dentro del bloqueo de archivo y
escribe todos los campos atómicamente; no acepta propuestas obsoletas.

`action=coach` deriva a `assistant/coach.ts`, independiente de las mutaciones
nutricionales. El contexto de interpretación ya incluye el plan entero, incluso
en pestañas de medidas. El flujo de consejo recibe el día seleccionado y una
ventana de 28 días, no todos los días del modo historial. La respuesta estructurada
incluye `changedFields`; el programa mezcla solo los campos declarados con el
plan anterior o borrador. El renderer conserva el borrador para continuar la
conversación y lo descarta al cambiar de perfil. La aplicación del plan tiene
su IPC validado y sus consultas con claves de perfil.

## Comprobaciones

`pnpm test` ejecuta únicamente la suite E2E de Playwright sobre Electron compilado.
Cada prueba aísla los datos de usuario y sustituye la red de OpenRouter desde un
arranque externo a la aplicación distribuida. No se crean nuevos tests unitarios.

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` y `pnpm build` deben pasar. ESLint y Prettier siguen las decisiones de Nemeton: bloques con llaves, separación entre declaraciones, dos espacios, comillas dobles y ancho de 88 caracteres. Los datos generados y privados se excluyen del formato.
