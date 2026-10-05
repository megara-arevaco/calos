# Calos

Diario nutricional de escritorio con historiales de cintura y peso. Las comidas y medidas se guardan localmente. El asistente interpreta los mensajes mediante OpenRouter. La app calcula calorías y macronutrientes con USDA, etiquetas o datos personales; si no hay una referencia exacta, permite registrar una estimación identificada como aproximada.

## Desarrollo y configuración

```bash
pnpm install
cp .env.example .env
```

Edita `.env` en la raíz del proyecto:

```dotenv
OPENROUTER_API_KEY=tu_clave_de_openrouter
OPENROUTER_MODEL=google/gemini-3-flash-preview
```

Obtén una clave en https://openrouter.ai/settings/keys y añade saldo si tu modelo lo requiere. El modelo por defecto es [Gemini 3 Flash Preview en OpenRouter](https://openrouter.ai/google/gemini-3-flash-preview), una versión preview con soporte de imágenes y respuestas JSON estructuradas; puedes sustituirlo por otro que admita `response_format: json_schema`. Para registros con USDA, la app suele realizar dos peticiones: interpretación y selección del alimento. Puede necesitar peticiones adicionales para estimar un plato sin referencia o recuperar una selección parcial. Los registros basados únicamente en una etiqueta y las aclaraciones normalmente necesitan una sola.

```bash
pnpm dev
```

Reinicia la app después de cambiar la configuración. Las variables del entorno tienen prioridad sobre el archivo. `CALOS_ENV_FILE=/ruta/al/archivo.env` permite usar un archivo concreto. En una app empaquetada, crea `openrouter.env` en el directorio de datos de usuario de Calos; durante el desarrollo ese archivo también tiene prioridad sobre `.env`.

La clave se lee exclusivamente en el proceso principal de Electron. No se expone a la interfaz ni se incluye en la compilación. `.env` está excluido del control de versiones. Sin clave, el chat muestra instrucciones de configuración y no registra valores de prueba.

## Perfiles locales

No se necesita cuenta ni contraseña. Al abrir Calos por primera vez, el onboarding
pide nombre, edad, altura, peso, objetivo y actividad. Después puedes indicar un
objetivo calórico, preferencias alimentarias y cómo quieres que responda el
asistente. Estos datos personalizan el contexto y el system prompt de ese perfil.
El objetivo calórico inicial es editable; no se presenta como una recomendación
calculada a partir de tus datos.

«Perfil activo» permite cambiar de persona y «Nuevo perfil» abre otro onboarding.
Cada perfil tiene su diario, referencias personales, medidas y objetivo separados.
Al cambiar de perfil se vacían la conversación, el borrador y la foto pendientes;
los registros guardados se conservan. La selección permanece tras reiniciar.
El diario de instalaciones anteriores se migra a «Mi perfil», conservando el
archivo original.

## Acompañamiento nutricional y objetivos

La sección **Asistente** permite revisar el objetivo del onboarding y editar
calorías, macros, peso objetivo opcional, fecha orientativa y hábitos. Estos datos
son propios de cada perfil y se conservan tras reiniciar. Al guardar objetivos,
el diario y sus indicadores se actualizan; los alimentos registrados no cambian.
El onboarding también permite configurar estos valores desde el principio.

Puedes pedir «revisa mi semana y dame tres mejoras», «ayúdame a definir objetivos»
o «propón 2100 kcal y preparar dos cenas caseras a la semana». El flujo de
acompañamiento usa el perfil, las preferencias, el plan y hasta 28 días recientes
de comidas, además de los últimos 60 registros de peso y cintura. Distingue días
registrados de días sin datos y pide lo relevante que falte. No trata los valores
iniciales como un cálculo personalizado de necesidades ni el objetivo calórico
como un gasto de mantenimiento verificado.

Los consejos no escriben alimentos ni medidas. Para cambiar objetivos, muestra
una propuesta que puedes ajustar en varios mensajes, aplicar o descartar. Solo
«Aplicar objetivos» guarda el plan; un recibo de la aplicación confirma la escritura.
El programa conserva los campos que la propuesta no declara cambiar y rechaza
una propuesta si los objetivos guardados han cambiado mientras tanto.

El modelo recibe referencias generales del [NHS sobre alimentación equilibrada](https://www.nhs.uk/better-health/lose-weight/healthy-eating-when-trying-to-lose-weight/)
y [cambios sostenibles de hábitos](https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/tips-to-help-you-lose-weight/).
Su respuesta sigue siendo generada por el modelo: no es una revisión clínica ni
una evaluación de la ingesta completa cuando faltan registros.

## Fotos de platos

Pulsa «Foto de plato», adjunta una imagen y describe lo que has comido, o envíala
sola. El modelo identifica posibles ingredientes y propone pesos aproximados.
Si no tiene claro un ingrediente, la preparación o cuánto has consumido, pregunta
por esos puntos. Puedes corregir la propuesta y responder en varios mensajes;
la imagen y el borrador se mantienen hasta guardar, cancelar o quitar la foto.
No se registra una propuesta mientras queden cantidades pendientes o preguntas.
Antes de guardar una aclaración, una comprobación adicional verifica qué preguntas
responde el mensaje; una respuesta parcial conserva las demás pendientes.

Los nutrientes se calculan con referencias USDA o, si falta una compatible, con
una estimación identificada. El diario conserva el aviso de identificación visual,
los pesos estimados y las suposiciones. Una foto no proporciona pesos exactos.
«Adjuntar etiqueta» conserva su flujo específico de lectura de valores impresos.

## Dataset y cálculo

Se incluye **USDA FoodData Central, SR Legacy, abril de 2018**, con 7.793 alimentos. Es una versión fija y final del dataset, adecuada para alimentos genéricos; no representa un catálogo actualizado de productos de supermercados españoles.

- Fuente oficial y descargas: https://fdc.nal.usda.gov/download-datasets/
- Licencia: CC0 1.0 / dominio público, https://fdc.nal.usda.gov/
- Energía en kcal y proteínas, carbohidratos y grasas en gramos, todos por 100 g de parte comestible.
- Las raciones conservan la cantidad y el peso oficial USDA. Las unidades se convierten usando esa ración; no se pide al modelo inventar un peso.

El modelo interpreta cantidades y preparación, genera búsquedas en inglés y selecciona un registro entre los candidatos locales. Para alimentos con una fuente exacta, el modelo no proporciona las calorías: la app calcula `valor por 100 g × gramos / 100`, redondea energía a kcal y macros a una décima. Cada registro conserva el identificador FDC, descripción original, peso y ración usada, visibles en «Referencia USDA».

Si falta la cantidad consumida, el asistente pregunta solo por ese dato. Para platos sin receta exacta o alimentos sin una referencia compatible, puede usar una composición típica y registrar valores aproximados. Las suposiciones se conservan y se muestran en el diario; no se atribuyen a USDA, a una etiqueta ni a datos tuyos. Si pides «sin estimaciones» o «valores exactos», solicita la información necesaria y conserva esa preferencia durante la aclaración. Usa los últimos diez mensajes para continuar una petición pendiente sin repetir preguntas ya contestadas. La selección semántica depende del modelo y puede necesitar corrección: revisa la referencia y pide una corrección si no corresponde. No hay búsqueda de productos por código de barras. Una receta no detallada se puede estimar, pero no se presenta como un cálculo exacto.

Puedes corregir una comida desde el chat: «el atún era en lata al natural» o «fueron 200 g, no 300». Se actualiza el registro existente, conservando su identidad y fecha salvo que pidas cambiarla. El diario, sus totales, el historial y el contexto de la conversación se refrescan tras guardar. Una corrección de nutrientes afecta al consumo indicado; si pides corregir una referencia personal guardada, se recalculan todos sus consumos. La confirmación del chat se genera después de la escritura. Las fotos siguen teniendo precedencia; «sin aceite» no se interpreta como una cifra de grasa igual a cero.

## Estimaciones de platos

Puedes escribir «añade de cena 300 g de risotto de setas». Si no hay una fuente
exacta, el asistente puede estimar su composición típica por 100 g y la app calcula
los valores de la cantidad consumida. Al guardar, el chat avisa de que son **valores
aproximados** y explica las suposiciones. En el diario aparece siempre «Valores
aproximados · estimación del asistente»; puedes abrir la fuente para ver el motivo,
los valores por 100 g y la composición supuesta. Esa procedencia sobrevive al
reinicio y a las correcciones de cantidad. Una corrección parcial de nutrientes
mantiene el aviso mientras queden nutrientes estimados.

Las fotos de etiquetas, los valores que aportes y las referencias personales tienen
prioridad. No se completa una etiqueta ilegible con cifras estimadas. Las
estimaciones no se guardan automáticamente como referencias personales exactas.
Puedes aportar ingredientes o valores nutricionales para corregir un registro.
Para evitar aproximaciones en una conversación, indica «sin estimaciones»; puedes
volver a permitirlas escribiendo «puedes estimar».

## Cantidades en gramos y mililitros

El chat acepta `86gr`, `86 g`, `350ml` y cantidades en litros. Un volumen
explícito no se trata como una cantidad ausente. Si el cálculo necesita gramos y
no hay etiqueta, OpenRouter estima una densidad típica: el diario conserva los
mililitros originales y muestra la conversión como aproximada, con el factor y
el supuesto. No se equiparan automáticamente gramos y mililitros. Como referencia,
la [FAO](https://www.fao.org/4/t1265e/t1265e05.htm) describe densidades habituales
de leche entre 1,028 y 1,034 g/ml, dependiendo de su composición.

Una etiqueta legible con valores por 100 ml se usa directamente, sin estimar
la densidad. Si solicitas «sin estimaciones», el asistente pide solo el peso o
la etiqueta del líquido que necesita la conversión, conservando las cantidades
de los demás alimentos. Las correcciones de volumen actualizan el consumo
existente y mantienen el aviso; no crean otra comida.

## Alimentos personalizados y datos escritos

Puedes registrar comidas aportando sus valores por una cantidad de referencia, sin foto: «Guarda 100 g de trinxat y guárdalo en mi base de datos: proteínas 3–5 g, carbohidratos 12–18 g, grasas 5–8 g, calorías 120–150 kcal». Se guarda una referencia personal reutilizable con los rangos originales y un consumo de 100 g. Para los totales se usa el punto medio: 135 kcal, P 4 g, C 15 g y G 6,5 g. La respuesta y la fuente «Datos del usuario» indican que es una estimación.

Si solo quieres crear una referencia, escribe «Guarda este alimento en mi base de datos, sin registrar consumo: …; valores por 100 g: …». En siguientes mensajes puedes registrar otros pesos del mismo alimento sin volver a escribir sus nutrientes. Los cálculos los hace la app, con los valores guardados. La foto de etiqueta tiene prioridad; después se usan los valores explícitos del usuario o su referencia personal, y finalmente USDA. Los nutrientes incompletos requieren aclaración y una comida con varios alimentos se guarda solo si se han validado todos.

## Fotos de etiquetas: prioridad sobre USDA

Usa «Adjuntar etiqueta» en el chat para enviar una imagen JPG, PNG o WebP de hasta 6 MB e indica cuánto has consumido. La foto se envía al modelo de OpenRouter; no se guarda en el diario. Necesitas un modelo que admita imágenes además de respuestas JSON.

**Para el producto fotografiado, la etiqueta tiene prioridad sobre el dataset.** La app conserva los nutrientes transcritos y la base impresa (100 g, 100 ml o ración), calcula según tu cantidad y muestra «Etiqueta de la foto» como fuente. No mezcla nutrientes faltantes con valores USDA. Si solo aparece energía en kJ, la convierte a kcal con `kJ / 4,184`.

Si la foto es ilegible, faltan calorías o macros, o la cantidad no corresponde a la unidad de la etiqueta, pide aclaración sin guardar nada. La foto permanece adjunta durante las aclaraciones y se retira al guardar. Puedes quitarla manualmente. Para los demás alimentos de la misma comida se usan sus datos escritos o referencias personales, y USDA cuando no existen. La transcripción depende del modelo: revisa los valores de la etiqueta que aparecen en el registro.

El dataset compactado y su SHA-256 de origen están en `packages/core/src/nutrition/data/usda-sr-legacy.json`. Para regenerarlo desde el archivo oficial:

```bash
python3 scripts/import-usda.py
# También puedes reutilizar una descarga:
python3 scripts/import-usda.py /ruta/FoodData_Central_sr_legacy_food_json_2018-04.zip
```

El importador solo incorpora alimentos con los cuatro valores nutricionales presentes; no convierte nutrientes ausentes en cero.

## Datos y privacidad

Los datos se guardan en el directorio de usuario de la aplicación: `profiles.json` contiene el listado y la selección, y `profiles/<id>/nutrition.json` contiene los datos de cada persona. Los historiales de cintura y peso se guardan localmente. Al usar el chat se envían a OpenRouter el perfil activo (nombre, edad, altura, peso, actividad, objetivo, preferencias e instrucciones del asistente), el mensaje, la foto adjunta si la hay, hasta diez mensajes anteriores, los objetivos y hábitos, las referencias de alimentos personales y los candidatos de alimentos que necesita el modelo. El peso del perfil enviado al LLM es el registro con la fecha más reciente, leído de nuevo en cada mensaje; si no hay registros de peso, se usa el peso informado en el perfil. El chat recibe las comidas y totales del día abierto. Al consultar una fecha del historial, también recibe los días del historial de comidas para poder compararlos. La fecha seleccionada se valida en el proceso principal y los datos se leen del almacenamiento local en cada mensaje; en las pestañas Cintura y Peso se envía el historial de la medida correspondiente, su unidad, el último registro y el cambio desde el primero, junto con la identificación de la pestaña activa. El asistente permite consultar la evolución; las medidas se guardan o editan desde los formularios. El uso de OpenRouter puede generar costes según el modelo elegido.

## Arquitectura y comprobaciones

- `packages/core`: dataset, búsqueda, cliente OpenRouter, interpretación, cálculo y almacenamiento JSON atómico.
- `apps/desktop/src/main`: configuración privada y handlers IPC validados.
- `apps/desktop/src/preload`: API mínima expuesta al renderer.
- `apps/desktop/src/renderer`: diario por fecha, chat e historiales con gráficas de cintura y peso.

```bash
pnpm test
pnpm typecheck
pnpm build
```

`pnpm test` y `pnpm test:e2e` compilan la app y ejecutan las pruebas E2E de
Electron con Playwright. No hace falta descargar navegadores: se utiliza el Electron
del proyecto. En Linux se necesita una sesión gráfica o Xvfb:

```bash
# Para servidores Linux sin escritorio (instalar Xvfb previamente):
xvfb-run -a pnpm test:e2e
# Abrir el informe después de ejecutar las pruebas:
pnpm --filter @calos/desktop exec playwright show-report
```

La suite está en `apps/desktop/e2e`. Cubre crear, editar, validar y eliminar medidas
de peso y cintura, orden por fecha, evolución y persistencia tras reiniciar. También
prueba registro USDA por chat, corrección de cantidades, consulta del historial,
eliminación de comidas, aclaraciones, consultas sin escritura, errores del proveedor y configuración sin clave. La suite también comprueba edición y persistencia de objetivos, consejo sin escrituras, propuestas y aceptación, conservación de campos y rechazo de planes obsoletos, onboarding, aislamiento de perfiles y prompts, migración de datos anteriores, aclaraciones y registro de fotos de platos, estimaciones de platos, avisos y persistencia, correcciones, prioridad de etiquetas, peticiones de precisión y ausencia de escrituras parciales.

Cada prueba usa un directorio temporal de datos que se elimina al terminar. El
arranque de pruebas bloquea la red del proceso principal y simula únicamente las
respuestas HTTP de OpenRouter; la interfaz, el preload, los handlers IPC, el cálculo
USDA y el almacenamiento son reales. No se utiliza tu `.env`, tu clave ni tu diario,
y no se requiere saldo. Estas pruebas no validan la calidad de interpretación del
modelo real. Los tests anteriores se conservan como referencia, pero no se ejecutan
con `pnpm test`; las nuevas pruebas deben ser E2E.

Los informes y trazas quedan en `apps/desktop/playwright-report` y
`apps/desktop/test-results`, excluidos del control de versiones. Los fallos incluyen
una captura de pantalla. TypeScript, ESLint y Prettier comprueban también la suite.
La configuración de GitHub Actions en `.github/workflows/e2e.yml` ejecuta estas
comprobaciones con Xvfb y conserva los artefactos de las pruebas.

La organización y los límites entre capas se describen en [docs/architecture.md](docs/architecture.md), siguiendo los patrones de Nemeton.
