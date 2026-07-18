// Fase 3 — "Sugerir actividades y tareas con IA" (ARQUITECTURA.md §5).
// Prompt, llamado a la API de Claude y parseo/validación seguros, separados
// de la UI para poder probarlos sin red.

export const AI_SYSTEM_PROMPT = `Eres un asistente de planificación de proyectos académicos para un investigador
en geología estructural (investigación, docencia, vinculación, administración
universitaria). A partir del objetivo y la descripción de un proyecto, propone
una descomposición en actividades y tareas concretas.

Reglas:
- Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin \`\`\` y sin
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
}`

export function buildUserPrompt(project) {
  const lines = [
    `Nombre del proyecto: ${project.name || '(sin nombre)'}`,
    `Objetivo: ${project.objective || '(sin objetivo especificado)'}`,
    `Descripción: ${project.description || '(sin descripción)'}`,
    `Deadline del proyecto: ${project.deadline || '(sin deadline)'}`,
    `Actividades ya existentes (no las repitas): ${
      project.activityOrder.length ? project.activityOrder.join(', ') : '(ninguna aún)'
    }`,
  ]
  return lines.join('\n')
}

// Extrae el primer bloque {...} balanceado, por si el modelo antepone texto
// o fences pese a la instrucción del prompt de sistema.
export function extractJsonBlock(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false
  const d = new Date(value + 'T00:00:00')
  return !Number.isNaN(d.getTime())
}

// Validación estructural manual (sin librería de esquema): campos
// desconocidos se descartan, tipos se coaccionan, lo inválido se descarta
// tarea por tarea en vez de invalidar toda la respuesta.
export function parseAISuggestions(rawText, { projectDeadline = null } = {}) {
  const jsonBlock = extractJsonBlock(rawText)
  if (!jsonBlock) return { ok: false, error: 'La respuesta no contiene un bloque JSON.' }

  let parsed
  try {
    parsed = JSON.parse(jsonBlock)
  } catch {
    return { ok: false, error: 'El bloque JSON no es válido.' }
  }

  if (!parsed || !Array.isArray(parsed.activities) || parsed.activities.length === 0) {
    return { ok: false, error: 'La respuesta no tiene el formato esperado (activities[]).' }
  }

  const activities = []
  for (const rawActivity of parsed.activities) {
    const name = typeof rawActivity?.name === 'string' ? rawActivity.name.trim() : ''
    if (!name || !Array.isArray(rawActivity.tasks)) continue

    const tasks = []
    for (const rawTask of rawActivity.tasks) {
      const taskName = typeof rawTask?.name === 'string' ? rawTask.name.trim() : ''
      if (!taskName) continue

      let suggestedDeadline = isValidDateOnly(rawTask.suggestedDeadline) ? rawTask.suggestedDeadline : null
      if (suggestedDeadline && projectDeadline && suggestedDeadline > projectDeadline) {
        suggestedDeadline = null
      }

      tasks.push({
        name: taskName,
        description: typeof rawTask.description === 'string' ? rawTask.description.trim() : '',
        suggestedDeadline,
        important: Boolean(rawTask.important),
        urgent: Boolean(rawTask.urgent),
      })
    }

    if (tasks.length > 0) activities.push({ name, tasks })
  }

  if (activities.length === 0) {
    return { ok: false, error: 'No se pudo extraer ninguna actividad/tarea válida de la respuesta.' }
  }

  return { ok: true, activities }
}

// ---- Proveedores ----------------------------------------------------------
// Los tres proveedores comparten la misma interfaz: reciben (systemPrompt,
// userPrompt) y devuelven el texto crudo de la respuesta. El parseo/
// validación es idéntico sea cual sea el proveedor.

// API de Claude. En el host de artifacts, `fetch` a api.anthropic.com está
// soportado sin exponer una key en el cliente (ARQUITECTURA.md §5). Fuera de
// ese host no hay backend propio: se usa una key de desarrollo opcional vía
// variable de entorno, solo para probar el flujo end-to-end.
async function callClaude(systemPrompt, userPrompt) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'La API de Claude no está configurada en este entorno (falta VITE_ANTHROPIC_API_KEY). ' +
        'Puedes cambiar a Gemini (gratis, con key propia) u Ollama local en el engranaje de IA.',
    )
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) throw new Error(`La API de Claude respondió con error ${response.status}.`)

  const data = await response.json()
  return data.content?.map((block) => block.text ?? '').join('') ?? ''
}

// Google Gemini: tiene capa gratuita generosa. La key se crea gratis en
// https://aistudio.google.com/apikey y se pega en el engranaje de IA (queda
// guardada en meta.ai.geminiKey, es decir en el storage personal del
// usuario — aceptable para una app de uso individual, pero no debe
// compartirse el respaldo JSON con la key adentro).
async function callGemini(systemPrompt, userPrompt, { geminiKey, geminiModel }) {
  if (!geminiKey) {
    throw new Error(
      'Falta la API key de Gemini. Créala gratis en aistudio.google.com/apikey y pégala en el engranaje de IA.',
    )
  }

  const model = geminiModel || 'gemini-2.0-flash'
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      }),
    },
  )

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new Error('Gemini rechazó la API key (¿está bien copiada?).')
    }
    if (response.status === 429) {
      throw new Error('Gemini alcanzó el límite gratuito por ahora; intenta en unos minutos.')
    }
    throw new Error(`Gemini respondió con error ${response.status}.`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

// Ollama local (https://ollama.com): gratis y privado, corre en la máquina
// del usuario. Requiere `ollama serve` y el modelo descargado. Si la app no
// está en localhost puede hacer falta OLLAMA_ORIGINS=* (CORS).
async function callOllama(systemPrompt, userPrompt, { ollamaUrl, ollamaModel }) {
  let response
  try {
    response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch {
    throw new Error(
      `No se pudo conectar a Ollama en ${ollamaUrl}. ¿Está corriendo ("ollama serve")? Si la app no está en ` +
        'localhost, puede que necesites iniciar Ollama con OLLAMA_ORIGINS=* para permitir la conexión.',
    )
  }

  if (!response.ok) {
    throw new Error(`Ollama respondió con error ${response.status}. ¿Descargaste el modelo "${ollamaModel}"?`)
  }

  const data = await response.json()
  return data.message?.content ?? ''
}

export async function callAI(systemPrompt, userPrompt, aiConfig) {
  if (aiConfig?.provider === 'ollama') return callOllama(systemPrompt, userPrompt, aiConfig)
  if (aiConfig?.provider === 'gemini') return callGemini(systemPrompt, userPrompt, aiConfig)
  return callClaude(systemPrompt, userPrompt)
}

export async function requestAISuggestions(project, aiConfig) {
  const rawText = await callAI(AI_SYSTEM_PROMPT, buildUserPrompt(project), aiConfig)
  const result = parseAISuggestions(rawText, { projectDeadline: project.deadline })
  if (!result.ok) throw new Error(result.error)
  return result.activities
}

// ---- Análisis de la bitácora de notas (Idea/Dato/Hipótesis/GAP) ----------
// A diferencia de las sugerencias de actividades, aquí la salida es texto
// libre para leer (no se inserta nada automáticamente), así que no se exige
// JSON: menos fricción y funciona bien incluso con modelos locales chicos.

export const NOTES_ANALYSIS_SYSTEM_PROMPT = `Eres un asesor de investigación para un académico en geología estructural.
Recibirás la bitácora de un proyecto: notas clasificadas como Idea (ocurrencias
por explorar), Dato (evidencia u observación concreta), Hipótesis (explicación
tentativa) y GAP (vacío de conocimiento detectado), junto con el objetivo del
proyecto y el estado de sus tareas.

Tu trabajo:
1. Conectar datos con hipótesis: ¿qué evidencia apoya o contradice cada hipótesis?
2. Señalar qué GAPs son abordables ahora y cuáles requieren datos nuevos.
3. Proponer 3 a 5 pasos concretos y accionables (verbo + entregable), indicando
   en qué notas te basas.
4. Si detectas ideas prometedoras sin desarrollar, dilo explícitamente.

Formato: texto plano en español, con secciones breves y viñetas. Sé específico
y crítico; no repitas las notas, analízalas. Máximo ~350 palabras.`

// `notes` es cualquier lista de notas Idea/Dato/Hipótesis/GAP a analizar (las
// de un proyecto, o una selección arbitraria desde la pestaña Notas incluyendo
// sueltas); `context` describe de dónde vienen para que el prompt tenga
// sentido sin acoplarse a la forma de Project.
export function buildNotesAnalysisPrompt(notes, tasks, context = {}) {
  const byCategory = { idea: [], dato: [], hipotesis: [], gap: [] }
  for (const note of notes) {
    ;(byCategory[note.category] ?? byCategory.idea).push(note.text)
  }

  const taskSummary = tasks.map((t) => `- [${t.status}] ${t.name}`).join('\n')

  return [
    `Alcance: ${context.label || 'notas seleccionadas'}`,
    context.objective ? `Objetivo: ${context.objective}` : null,
    '',
    `IDEAS:\n${byCategory.idea.map((t) => `- ${t}`).join('\n') || '(ninguna)'}`,
    `DATOS:\n${byCategory.dato.map((t) => `- ${t}`).join('\n') || '(ninguno)'}`,
    `HIPÓTESIS:\n${byCategory.hipotesis.map((t) => `- ${t}`).join('\n') || '(ninguna)'}`,
    `GAPS:\n${byCategory.gap.map((t) => `- ${t}`).join('\n') || '(ninguno)'}`,
    '',
    `Tareas relacionadas:\n${taskSummary || '(sin tareas)'}`,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export async function requestNotesAnalysis(notes, tasks, context, aiConfig) {
  if (notes.length === 0) {
    throw new Error('Agrega al menos una nota (Idea/Dato/Hipótesis/GAP) antes de pedir el análisis.')
  }
  const text = await callAI(NOTES_ANALYSIS_SYSTEM_PROMPT, buildNotesAnalysisPrompt(notes, tasks, context), aiConfig)
  if (!text.trim()) throw new Error('La IA devolvió una respuesta vacía; intenta de nuevo.')
  return text.trim()
}

// ---- Asistente de IA para reuniones -------------------------------------
// A partir de apuntes en bruto (dictados o escritos durante/después de la
// reunión), propone título, ideas principales, acuerdos y acciones a seguir
// ya estructurados. El usuario revisa/edita antes de guardar (los campos del
// modal quedan editables igual que siempre; esto solo los pre-rellena).

export const MEETING_ASSIST_SYSTEM_PROMPT = `Eres un asistente que sistematiza apuntes crudos de una reunión académica
(investigación en geología estructural) en un registro estructurado.

Reglas:
- Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin \`\`\` y sin
  texto fuera del JSON.
- "title": título breve de la reunión si se puede inferir; si no, cadena vacía.
- "mainIdeas": resumen en prosa breve de los puntos centrales discutidos.
- "agreements": qué se acordó explícitamente, en prosa breve.
- "actions": acciones a seguir mencionadas o claramente implícitas, cada una
  con "text" (qué hay que hacer), "assignee" (responsable si se menciona, si
  no cadena vacía) y "deadline" ("YYYY-MM-DD" si se menciona una fecha
  concreta, si no null).
- No inventes información que no esté en los apuntes.
- Idioma: español.

Formato exacto:
{
  "title": "string",
  "mainIdeas": "string",
  "agreements": "string",
  "actions": [{ "text": "string", "assignee": "string", "deadline": "YYYY-MM-DD" | null }]
}`

export function parseMeetingAssist(rawText) {
  const jsonBlock = extractJsonBlock(rawText)
  if (!jsonBlock) return { ok: false, error: 'La respuesta no contiene un bloque JSON.' }

  let parsed
  try {
    parsed = JSON.parse(jsonBlock)
  } catch {
    return { ok: false, error: 'El bloque JSON no es válido.' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Formato inesperado.' }

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions
        .map((a) => ({
          text: typeof a?.text === 'string' ? a.text.trim() : '',
          assignee: typeof a?.assignee === 'string' ? a.assignee.trim() : '',
          deadline: isValidDateOnly(a?.deadline) ? a.deadline : null,
        }))
        .filter((a) => a.text)
    : []

  return {
    ok: true,
    title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
    mainIdeas: typeof parsed.mainIdeas === 'string' ? parsed.mainIdeas.trim() : '',
    agreements: typeof parsed.agreements === 'string' ? parsed.agreements.trim() : '',
    actions,
  }
}

export async function requestMeetingAssist(rawNotes, aiConfig) {
  if (!rawNotes.trim()) {
    throw new Error('Dicta o escribe apuntes en bruto antes de pedir la sistematización.')
  }
  const rawText = await callAI(MEETING_ASSIST_SYSTEM_PROMPT, rawNotes, aiConfig)
  const result = parseMeetingAssist(rawText)
  if (!result.ok) throw new Error(result.error)
  return result
}
