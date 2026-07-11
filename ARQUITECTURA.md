# Documento de Arquitectura — Gestor de Tareas y Proyectos para Investigador Académico

**Tipo de aplicación:** React de un solo archivo (artifact-style), sin backend externo, persistencia vía `window.storage` (clave-valor, `shared: false` en todas las claves).
**Usuario objetivo:** un investigador individual en geología estructural (uso personal, sin multiusuario, sin auditoría).
**Estado:** documento de diseño previo a implementación. No contiene código final.

---

## 1. Modelo de datos (entidades)

### Decisión previa: ¿"Actividad" como entidad propia o como agrupación dentro de las tareas?

**Opción A — Entidad propia (`Activity` con su propia clave/colección):**
- Pros: permite metadatos propios (deadline de actividad, descripción, orden explícito); el Gantt puede dibujar barras de actividad como agregación de sus tareas.
- Contras: tercera colección que mantener sincronizada (borrar actividad → reasignar/huérfanas sus tareas); más llamadas a storage; más UI (CRUD de actividades separado); para un usuario individual el beneficio de metadatos propios es marginal.

**Opción B — Campo de agrupación en la tarea (`task.activity: string` dentro del proyecto):**
- Pros: cero sincronización extra; crear una actividad = escribir un nombre nuevo en el campo; el Gantt y la vista de proyecto agrupan con `lodash.groupBy(tasks, 'activity')`; renombrar es un `map` sobre las tareas del proyecto; el volumen esperado (decenas de tareas por proyecto) hace trivial la agregación en memoria.
- Contras: una actividad sin tareas "no existe" (mitigable: lista opcional `project.activityOrder: string[]` que también registra actividades vacías y su orden de despliegue); no puede tener descripción propia (aceptable: la descripción vive en el proyecto).

**Recomendación: Opción B**, con el refinamiento `project.activityOrder: string[]`. La sugerencia de IA inserta actividades escribiendo en `activityOrder` y creando tareas con ese `activity`. Es el diseño con menos estados inconsistentes posibles, que es el criterio dominante en una app sin backend ni migraciones.

### Esquema de entidades

```
Project
├── id: string                  // "p_" + timestamp base36 + sufijo aleatorio
├── name: string
├── description: string
├── objective: string           // insumo principal del prompt de IA
├── collaborators: string       // texto libre
├── deadline: string | null     // ISO 8601 "YYYY-MM-DD"
├── startDate: string | null    // para el rango del Gantt; default: createdAt
├── colorTag: "investigacion" | "docencia" | "vinculacion" | "administracion" | "varios"
├── importance: 1 | 2 | 3       // baja / media / alta
├── completionOverride: number | null  // null = calcular automático desde tareas
├── activityOrder: string[]     // nombres de actividades y su orden (puede incluir vacías)
├── archived: boolean
├── createdAt: string           // ISO 8601 con hora
└── updatedAt: string

Task
├── id: string                  // "t_" + timestamp base36 + sufijo aleatorio
├── name: string
├── description: string
├── deadline: string | null     // ISO "YYYY-MM-DD"
├── startDate: string | null    // opcional; para barra de Gantt. Fallback: createdAt
├── projectId: string | null    // null = tarea suelta (válido; aparece en matriz y calendario)
├── activity: string | null     // agrupación dentro del proyecto (Opción B)
├── assignee: string            // texto libre ("yo", "tesista X", …)
├── important: boolean          // eje vertical Eisenhower
├── urgent: boolean             // eje horizontal Eisenhower
├── status: "not_started" | "in_progress" | "done"   // máquina de estados §4
├── checklist: ChecklistItem[]  // embebida, no es entidad con clave propia
├── attachments: Attachment[]
├── order: number               // orden manual dentro del cuadrante
├── createdAt: string
└── updatedAt: string

ChecklistItem (embebido en Task)
├── id: string
├── text: string
└── status: "not_started" | "in_progress" | "done"

Attachment (embebido en Task o Project)
├── id: string
├── label: string               // nombre visible, ej. "Croquis afloramiento — Goodnotes"
├── ref: string                 // URL o nombre de archivo; NO se llama a ningún conector
└── kind: "goodnotes" | "url" | "file"
```

Notas de diseño:
- **Eisenhower se deriva de dos booleanos** (`important`, `urgent`), no de un enum de cuadrante: mover una tarjeta entre cuadrantes es togglear un booleano, y futuros filtros ("todo lo importante") son triviales.
- **Checklist y attachments son embebidos**: se leen/escriben siempre junto con su tarea; darles clave propia solo multiplicaría llamadas a storage.
- **`updatedAt`** existe únicamente para ordenar/desempatar (requisito explícito: sin log de auditoría).
- **Actividad** no es entidad persistida; ver decisión arriba.

Diagrama de relaciones:

```
Project 1 ──── * Task            (task.projectId, nullable)
Project        activityOrder[]   (nombres; agrupación lógica)
Task    1 ──── * ChecklistItem   (embebido)
Task    1 ──── * Attachment      (embebido)
```

---

## 2. Esquema de claves de `window.storage` y justificación

### Alternativas evaluadas

**(a) Una clave por entidad + índice** (`tasks:<id>`, `tasks-index`): escala a miles de registros y minimiza el tamaño de cada escritura, pero el arranque cuesta N+1 lecturas (o un `list` + N `get`), y el índice puede desincronizarse de las entidades (dos escrituras no atómicas por cada alta/baja).

**(b) Blob único por colección** (`app:tasks` = array completo): una lectura al arranque, una escritura por mutación, imposible desincronizar índice y datos. El costo es reescribir toda la colección en cada cambio.

**Volumen esperado** de un investigador individual: ~10–30 proyectos, ~100–500 tareas activas (con checklist embebida, ~0.5–1 KB por tarea serializada) → el blob de tareas ronda 100–500 KB en el peor caso razonable. Muy por debajo de límites típicos de valores clave-valor (orden de MB), y serializar/parsear eso es <10 ms.

**Recomendación: (b), blobs por colección**, con archivado para acotar el crecimiento:

| Clave | Contenido | Cuándo se escribe |
|---|---|---|
| `app:meta` | `{ schemaVersion: 1, lastTab, ganttZoom }` | cambios de preferencia de UI (debounced) |
| `app:projects` | `Project[]` completo | cualquier mutación de proyecto |
| `app:tasks` | `Task[]` de proyectos activos + tareas sueltas | cualquier mutación de tarea |
| `app:archive:<year>` | `{ projects: Project[], tasks: Task[] }` archivados ese año | al archivar; solo se lee bajo demanda |

Todas con `shared: false`. Justificación del reparto:
- `projects` y `tasks` en claves **separadas** porque mutan de forma independiente (editar una tarea no debe reescribir proyectos) — "agrupar lo que se actualiza junto".
- `app:archive:<year>` saca del blob caliente lo terminado: mantiene `app:tasks` acotado indefinidamente sin índice por entidad.
- `schemaVersion` en `app:meta` habilita migraciones futuras (al cargar: si `schemaVersion < actual`, transformar y reescribir).

### Disciplina de escritura
- Todo el estado vive en React (reducer, §3); cada mutación aplica al estado y dispara una **escritura debounced (~500 ms)** de la colección afectada. Ediciones rápidas de checklist no generan una escritura por tecla.
- Al guardar desde el modal (acción explícita del usuario) se hace **flush inmediato** sin debounce.
- Lectura solo al montar la app (2 `get`: `app:projects`, `app:tasks`, más `app:meta`). Clave ausente ⇒ colección vacía (primer uso).
- Manejo de error: si un `set` falla, mostrar toast persistente "cambios sin guardar" con botón de reintento; nunca fallar silenciosamente.

---

## 3. Árbol de componentes React

Un solo archivo; los "componentes" son funciones dentro del archivo. Estado global en un `useReducer` + Context (sin librerías de estado).

```
<App>                                  // useReducer(appReducer), carga inicial de storage,
│                                      // efecto de persistencia debounced, Context.Provider
├── <TabBar/>                          // Tareas | Proyectos | Calendario/Gantt
│
├── <TasksTab>                         // pestaña por defecto
│   ├── <EisenhowerMatrix>
│   │   └── <Quadrant importante urgente color> ×4
│   │       ├── header (título, contador, botón "+")
│   │       └── <TaskCard/>*           // nombre, proyecto (chip color), deadline,
│   │                                  // mini-barra de checklist, estado
│   └── <VoiceInputButton/>            // Web Speech API; oculto/deshabilitado con
│                                      // tooltip si !window.SpeechRecognition (§7)
│
├── <ProjectsTab>
│   ├── <ProjectCard/>*                // nombre, colorTag, deadline, % cumplimiento (§4)
│   └── <ProjectDetail>                // panel/modal al abrir un proyecto
│       ├── <ProjectForm/>             // campos §Pestaña 2; % solo lectura + override
│       ├── <ActivityGroup/>*          // groupBy(tasks, 'activity') ∪ activityOrder
│       │   └── <TaskRow/>*            // click → abre <TaskModal>
│       └── <AISuggestButton/>         // dispara flujo IA (§5)
│           └── <AISuggestionsReview/> // lista editable aceptar/editar/descartar por ítem
│
├── <CalendarGanttTab>
│   ├── sub-tab switch (Calendario | Gantt)
│   ├── <CalendarView mode="month|week">
│   │   ├── <CalendarGrid/>            // celdas con puntos/chips por deadline
│   │   ├── <DayDetailPopover/>        // tareas/proyectos que vencen ese día
│   │   └── <IcsExportButton/>         // genera .ics en cliente y descarga (Blob URL)
│   └── <GanttView zoom={project|week|month|semester}>
│       ├── <GanttToolbar/>            // selector de proyecto + 4 niveles de zoom
│       ├── <GanttTimeAxis/>           // SVG: ticks según zoom
│       └── <GanttRow/>*               // SVG: barra por tarea, agrupadas por actividad
│           └── <GanttBar/>            // posición/ancho §Gantt abajo; color por status;
│                                      // etiqueta nombre + responsable; rombo = deadline
│
└── <TaskModal>                        // compartido por las 3 pestañas (portal)
    ├── campos: nombre, descripción, deadline, responsable
    ├── <ProjectSelect/>               // dropdown + "Crear nuevo proyecto" inline
    ├── <ActivitySelect/>              // datalist: actividades existentes del proyecto o texto nuevo
    ├── <ChecklistEditor/>             // ítems con ciclo de estado (§4)
    ├── <AttachmentsEditor/>           // label + ref manual (Goodnotes/URL); sin conectores
    └── <VoiceDictationButton/>        // dicta al campo nombre/descripción
```

**Gantt — cálculo de barras (SVG desde cero, sin recharts para esta vista):**
- Ventana temporal `[T0, T1]` según zoom: proyecto completo = `[min(startDate), max(deadline)]` del proyecto; semanal = lunes–domingo de la semana visible; mensual = mes visible; semestral/anual = 6–12 meses.
- Escala lineal días→px: `x(fecha) = ((fecha − T0) / (T1 − T0)) * anchoSVG` (implementable a mano o con `d3.scaleTime`, disponible).
- Barra de tarea: `x = x(startDate ?? createdAt)`, `width = max(x(deadline) − x, minPx)`; tareas sin fechas se listan fuera del lienzo ("sin programar"). Clipping a la ventana con marcadores «continúa ◄/►».
- Barra de actividad (fila resumen): envolvente `[min(start), max(deadline)]` de sus tareas.
- Colores por `status`: gris (`not_started`), ámbar (`in_progress`), verde (`done`); rombo en el deadline; texto truncado con tooltip.
- Scroll virtual innecesario al volumen esperado (≤ ~100 filas visibles).

**Calendario:** grilla mensual generada con date-math propia (`Date` nativo + helpers; sin librería de fechas). Export `.ics`: plantilla `VCALENDAR/VEVENT` (UID = id de entidad, `DTSTART;VALUE=DATE` = deadline, SUMMARY = nombre) → `Blob` → `<a download>`. Sin llamadas a Google/Microsoft; ese puente queda en la capa externa (conversación con conectores).

**Voz:** wrapper sobre `window.SpeechRecognition || window.webkitSpeechRecognition`, `lang: "es-CL"` (configurable), `interimResults: true` para feedback en vivo. Resultado final → abre `<TaskModal>` con `name` pre-rellenado en el cuadrante donde se invocó. Sin soporte (Firefox, algunos WebView): el botón se muestra deshabilitado con tooltip explicativo — fallback visible, no oculto.

---

## 4. Máquina de estados de la tarea y % de cumplimiento

### Estados y transiciones

```
                 start()                    complete()
 not_started ──────────────► in_progress ──────────────► done
      │  ▲                        ▲   │                    │
      │  └── reset()              │   └────── reopen() ────┘
      └────────── complete() ─────┴──── (atajo directo not_started → done)
```

- Toda transición es reversible (uso personal; equivocarse es normal). No hay estados terminales bloqueados.
- Mismo diagrama aplica a `ChecklistItem.status`.
- **Sincronización checklist → tarea (sugerida, no forzada):** si todos los ítems pasan a `done`, la UI ofrece marcar la tarea como `done` (no lo hace sola); si la tarea está `not_started` y un ítem pasa a `in_progress`/`done`, la tarea se promueve automáticamente a `in_progress` (esta sí es segura de automatizar).
- Cada transición actualiza `updatedAt`.

### % de cumplimiento del proyecto

Valor **derivado, nunca persistido** (se recalcula en render; el volumen lo permite):

```
tareas del proyecto (excluidas archivadas):
  peso(status): done = 1.0 · in_progress = 0.5 · not_started = 0.0
  refinamiento: si la tarea tiene checklist y status = in_progress,
                peso = fracción de ítems done (más granular que 0.5 fijo)

completion(project) =
    completionOverride            si ≠ null   (badge "manual" visible en UI)
    round(100 · Σ pesos / N)      si N > 0
    0                             si N = 0 ("sin tareas")
```

El override se limpia con un botón "volver a automático" (`completionOverride = null`). Guardar el valor calculado en el proyecto crearía un dato redundante que puede quedar obsoleto; por eso solo se persiste el override.

---

## 5. Función "Sugerir actividades y tareas con IA"

### Llamado

`fetch("https://api.anthropic.com/v1/messages", …)` con `model: "claude-sonnet-4-6"`, `max_tokens: 2000`, headers estándar del entorno de artifacts. Input del usuario: `project.name`, `objective`, `description`, `deadline`, más la lista de actividades ya existentes (para que no las duplique).

### Prompt de sistema (diseño)

```
Eres un asistente de planificación de proyectos académicos para un investigador
en geología estructural (investigación, docencia, vinculación, administración
universitaria). A partir del objetivo y la descripción de un proyecto, propone
una descomposición en actividades y tareas concretas.

Reglas:
- Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin ``` y sin
  texto fuera del JSON.
- Entre 2 y 6 actividades; cada una con 2 a 6 tareas.
- Tareas accionables y verificables (verbo + entregable), no genéricas.
- No repitas actividades que ya existen en el proyecto (se te da la lista).
- No inventes fechas: "suggestedDeadline" es null salvo que el objetivo o el
  deadline del proyecto permitan inferir un hito razonable (formato YYYY-MM-DD,
  nunca posterior al deadline del proyecto).
- "important"/"urgent" según criterio Eisenhower relativo al objetivo.
- Idioma: español.

Formato exacto:
{
  "activities": [
    {
      "name": "string",
      "tasks": [
        {
          "name": "string",
          "description": "string",
          "suggestedDeadline": "YYYY-MM-DD" | null,
          "important": boolean,
          "urgent": boolean
        }
      ]
    }
  ]
}
```

### Parseo seguro y flujo de revisión

1. Extraer el primer bloque `{…}` balanceado de la respuesta (defensa por si el modelo antepone texto o fences pese a la instrucción).
2. `JSON.parse` en `try/catch`; **validación estructural manual** (sin zod): `activities` es array no vacío; cada actividad tiene `name` string no vacío y `tasks` array; cada tarea tiene `name` string; coerción de tipos (`Boolean(t.important)`); `suggestedDeadline` debe pasar regex `^\d{4}-\d{2}-\d{2}$` y ser fecha válida, si no ⇒ `null`. Campos desconocidos se descartan.
3. Falla de red, JSON inválido o estructura inválida ⇒ mensaje de error con botón "reintentar"; **nunca** se inserta nada automáticamente.
4. Lo válido se muestra en `<AISuggestionsReview/>`: cada actividad/tarea con checkbox (aceptar), campos editables inline y descartar. Solo al confirmar se crean las `Task` reales (con `projectId`, `activity`, `status: "not_started"`) y se agregan los nombres nuevos a `activityOrder` — en una sola pasada del reducer ⇒ una sola escritura a storage.

---

## 6. Plan de construcción por fases

**Fase 0 — Núcleo de datos (sin UI significativa).** Reducer con todas las acciones (CRUD tarea/proyecto, transiciones de estado, checklist), capa de storage (carga inicial, persistencia debounced, `schemaVersion`), generación de IDs, helpers de fechas y de `completion()`. Criterio de salida: crear/editar/borrar entidades desde una UI mínima de prueba y que sobrevivan a recargar.

**Fase 1 — Tareas + Matriz Eisenhower (valor inmediato).** Matriz 2×2 con paleta (rojo `#dc2626` I+U · ámbar `#d97706` I+NU · azul `#2563eb` NI+U · gris `#6b7280` NI+NU, ajustada al validar contraste), botones "+", `<TaskModal>` completo (checklist, attachments, dropdown de proyecto con "crear nuevo" mínimo), mover entre cuadrantes. Al cierre de esta fase la app ya es usable a diario.

**Fase 2 — Proyectos.** `<ProjectsTab>` completo, `<ProjectDetail>` con agrupación por actividad, % de cumplimiento derivado + override, archivado.

**Fase 3 — IA.** Botón de sugerencias, llamado a la API, parseo seguro, pantalla de revisión/edición/inserción (§5).

**Fase 4 — Calendario + export .ics.** Vista mensual/semanal sobre datos propios; generador `.ics` por tarea/proyecto.

**Fase 5 — Gantt (lo más intensivo en UI custom, al final).** SVG: eje temporal con 4 zooms, filas por actividad/tarea, colores por estado, rombos de deadline, clipping. Se deja al final porque depende de que fechas y estados ya estén estables en el modelo.

**Fase 6 — Voz + pulido.** `<VoiceInputButton>` con fallback, atajos, estados vacíos, revisión de contraste/accesibilidad.

Cada fase termina en estado usable y persistente; el orden minimiza retrabajo (todo lo visual depende del modelo de la Fase 0).

---

## 7. Riesgos y limitaciones técnicas a comunicar antes de construir

1. **Web Speech API:** no funciona en Firefox ni en varios navegadores embebidos/iPad-WebView; en Chrome el audio se procesa en servidores de Google (privacidad); requiere permiso de micrófono y suele exigir HTTPS. Mitigación: botón con fallback visible y entrada por teclado siempre disponible. La calidad de reconocimiento en español con terminología geológica ("anticlinal", "cizalle") puede ser irregular — el texto siempre es editable antes de guardar.
2. **Sin integración nativa con Google Calendar/Outlook:** el calendario es interno; la sincronización real ocurre fuera del artifact (conversación con Claude + conectores). El export `.ics` es unidireccional y manual: cambios posteriores en la app no actualizan el evento ya importado (re-importar el UID puede duplicar según el cliente de calendario).
3. **Goodnotes/iPad:** `attachments` guarda solo referencias de texto (URL/nombre); no hay validación de que el enlace exista ni previsualización. Vincular es un acto manual del usuario.
4. **Límites de `window.storage`:** los valores tienen tamaño máximo finito (orden de cientos de KB a pocos MB según plataforma). El diseño de blob único (§2) es válido al volumen esperado, pero un uso extremo (miles de tareas con descripciones largas) podría acercarse al límite. Mitigación: archivado anual a `app:archive:<year>` + aviso en UI si el blob serializado supera un umbral (~300 KB).
5. **Sin sincronización multi-dispositivo garantizada en tiempo real:** dos sesiones abiertas del artifact pueden pisarse escrituras (última escritura gana; no hay merge). Recomendación de uso: una sesión activa a la vez.
6. **Llamado a la API de Claude (Fase 3):** consume cuota, tiene latencia de segundos y puede fallar o devolver JSON malformado; el flujo de revisión previa a la inserción (§5) hace que ningún fallo corrompa datos.
7. **Un solo archivo JSX:** el tamaño del artifact crecerá (~2–3 mil líneas al final); el plan por fases mantiene cada iteración manejable, pero no habrá code-splitting ni tests automatizados dentro del artifact.
8. **Zonas horarias:** deadlines como fecha pura (`YYYY-MM-DD`) interpretada en hora local, para evitar el clásico corrimiento de un día por UTC; el `.ics` usa `VALUE=DATE` (evento de día completo) por la misma razón.
9. **Sin papelera:** borrar es definitivo (no hay auditoría ni versiones). Mitigación barata: confirmación al borrar proyectos con tareas, y preferir "archivar" sobre "borrar".
