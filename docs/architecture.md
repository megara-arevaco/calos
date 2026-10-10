# Arquitectura de Calos

Calos sigue la organización de `/home/baul/Projects/nemeton`, adaptada al dominio nutricional. La referencia es su implementación: `packages/core`, `apps/api/src/context.ts`, `apps/api/src/server.ts`, `packages/core/src/nutrition/rpc-contracts.ts`, `apps/web/src/components/*/*.hook.ts` y `apps/web/src/queries`.

## Límites de responsabilidad

- `packages/core/src/nutrition`: tipos y reglas nutricionales, catálogo USDA, alimentos personalizados, almacenamiento y servicio del asistente. No importa React. `nutrition/index.ts` expone la API pública del dominio.
- `nutrition/assistant`: esquemas de respuestas, instrucciones, construcción del contexto, resolución de fuentes y reglas de corrección. `assistant.ts` coordina interpretación, validación, cálculo y escritura. El cliente de OpenRouter se puede sustituir en pruebas.
- `packages/core/src/shared/persistence.ts`: lectura limitada, escritura atómica y bloqueos por ruta normalizada, incluidos servicios que llaman a otros servicios dentro del mismo bloqueo. Un error de lectura no se trata como un diario vacío.
- `apps/api/src`: composición de dependencias, configuración privada de OpenRouter, validación de origen y servidor HTTP. `start.ts` mantiene un lock de instancia en la raíz de datos para impedir dos APIs sobre la misma instalación; el ledger de cuota exige estructura, fecha y counters válidos y falla cerrado. Las acciones reciben un `ApiContext` explícito.
- `packages/core/src/nutrition/rpc-contracts.ts`: definición de operaciones y argumentos, validados con Zod antes de ejecutar cada acción.
- `packages/core/src/nutrition/api-types.ts`: interfaz tipada del cliente HTTP, sin credenciales ni acceso genérico al sistema de archivos.
- `apps/web/src/queries`: lecturas y mutaciones HTTP con React Query, claves centralizadas e invalidación tras cambios. Las mutaciones no se reintentan automáticamente para evitar duplicar registros.
- `apps/web/src/components/<Nombre>`: presentación, hook de interacción cuando corresponde e `index.ts` como entrada pública. Los datos persistidos pertenecen a la caché de consultas; navegación y fecha viven en `App.hook.ts`.
- `apps/web/src/shared`: presentación y cliente HTTP. La web solo importa tipos del núcleo y no importa módulos de Node.

## Decisiones conservadas

El diario mantiene su formato. `LocalProfiles` conserva un registro de perfiles y un archivo por UUID; la migración copia el diario antiguo antes de publicar el registro y no modifica el original. Cada operación HTTP recibe y valida el perfil, y cada clave de consulta incluye su UUID. Al seleccionar otra persona, el workspace se vuelve a montar y descarta el chat y la foto pendientes. Una petición en curso sigue vinculada al perfil que la inició. Los nuevos registros usan timestamps ISO con desplazamiento local para conservar el día del diario; los registros históricos mantienen su fecha guardada. Fotos legibles, datos escritos del usuario, referencias personales y USDA conservan su precedencia. `estimate.ts` valida valores aproximados por 100 g y construye una fuente «Estimación» con sus suposiciones. Se usa cuando no hay una referencia exacta; los avisos del chat se generan después de guardar y el diario mantiene su etiqueta visible. Si quedan nutrientes estimados tras una corrección parcial, la procedencia continúa siendo aproximada. El contexto se construye en core con datos recién leídos; el navegador solo indica pestaña y fecha. El chat, los borradores y los formularios permanecen montados al cambiar de pestaña.

No se trasladan a Calos servicios propios de juegos, sincronización, backups, temas o distribución de Nemeton. Se comparten los patrones de separación y sus comprobaciones, no funciones ajenas al producto.

Las correcciones usan identificadores de los registros del contexto, validan que los datos no hayan cambiado durante la consulta al modelo y se escriben como una única operación atómica. Las referencias personales actualizan también sus consumos vinculados. Las respuestas que confirman cambios se construyen con el resultado persistido; una respuesta libre del modelo no sirve como confirmación de escritura. La mutación del chat invalida el diario y el historial completos para cubrir cambios de fecha y referencias compartidas.

El flujo `assistant/plate.ts` usa un esquema independiente de la lectura de etiquetas.
Mantiene un borrador de ingredientes, pesos, procedencia y preguntas en la interfaz,
que se valida en la API HTTP. Cada turno incluye el borrador y la imagen en OpenRouter.
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
plan anterior o borrador. El navegador conserva el borrador para continuar la
conversación y lo descarta al cambiar de perfil. La aplicación del plan tiene
su contrato HTTP validado y sus consultas con claves de perfil.

## Comprobaciones

`pnpm test` compila la web y la API y ejecuta la suite E2E de Playwright en Chromium headless. Cada prueba aísla los datos del servidor en un directorio temporal y sustituye únicamente el proveedor OpenRouter. La interfaz, HTTP, cálculo y persistencia son reales. No se crean nuevos tests unitarios. La revisión de mejoras y el cierre de cuota amplían la suite a 55 casos E2E; la importación/exportación, el onboarding manual y la exclusión de instancia se ejercitan con datos temporales.

El onboarding ofrece dos rutas antes de existir un perfil: `profiles:create` guarda los datos y objetivos introducidos manualmente, sin llamar al proveedor; `profiles:onboarding` usa OpenRouter para proponer objetivos conversacionales y valida el perfil y la coherencia energética de los macros. Solo al aplicar la propuesta o enviar el formulario manual se crea el perfil.

`nutrition:food-save` valida y persiste registros manuales/editados con cantidad, comida, fecha, nutrientes para esa cantidad y fuente/evidencia explícitas. La edición incluye la entrada esperada para detectar conflictos. El contexto de chat usa la fecha seleccionada como destino de nuevas entradas y el recibo presenta las escrituras reales con acceso a edición.

`nutrition:delete` mueve las entradas a `deletedEntries` dentro del mismo archivo del perfil; `nutrition:restore` las recupera. `templates` guarda copias de referencias de comidas existentes, con nutrientes y procedencia, para repetir entradas o comidas sin OpenRouter. No escala porciones.

`nutrition:export` devuelve la instantánea de un perfil; `nutrition:import` valida un esquema estricto, IDs y rangos antes de reemplazar solo el archivo del perfil solicitado mediante escritura atómica. El CSV se produce en el cliente a partir de las comidas activas. El diálogo advierte que JSON sustituye todos los datos del perfil activo.

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` y `pnpm build` deben pasar. ESLint y Prettier siguen las decisiones de Nemeton: bloques con llaves, separación entre declaraciones, dos espacios, comillas dobles y ancho de 88 caracteres. Los datos generados y privados se excluyen del formato.
