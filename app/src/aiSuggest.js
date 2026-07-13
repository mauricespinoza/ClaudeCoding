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

// Llamado real a la API de Claude. En el host de artifacts, `fetch` a
// api.anthropic.com está soportado sin exponer una key en el cliente
// (ARQUITECTURA.md §5). Fuera de ese host (este repo, desarrollo local) no
// hay backend propio: se usa una key de desarrollo opcional vía variable de
// entorno, solo para probar el flujo end-to-end; nunca debe usarse así en
// producción real.
async function requestFromClaude(project) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'La API de Claude no está configurada en este entorno de desarrollo (falta VITE_ANTHROPIC_API_KEY). ' +
        'En el host de artifacts este llamado se resuelve sin exponer una key en el cliente.',
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
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(project) }],
    }),
  })

  if (!response.ok) {
    throw new Error(`La API de Claude respondió con error ${response.status}.`)
  }

  const data = await response.json()
  return data.content?.map((block) => block.text ?? '').join('') ?? ''
}

// Alternativa gratuita y sin registro: un modelo corriendo localmente vía
// Ollama (https://ollama.com), gratis y privado (no sale de la máquina del
// usuario). Requiere tener Ollama instalado, corriendo (`ollama serve`) y el
// modelo descargado (`ollama pull llama3.1`). Por defecto Ollama solo acepta
// peticiones desde localhost: si esta app corre en otro origen puede hacer
// falta iniciar Ollama con `OLLAMA_ORIGINS=*` para permitir el fetch desde
// el navegador (CORS).
async function requestFromOllama(project, { ollamaUrl, ollamaModel }) {
  let response
  try {
    response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(project) },
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

export async function requestAISuggestions(project, aiConfig) {
  const rawText =
    aiConfig?.provider === 'ollama' ? await requestFromOllama(project, aiConfig) : await requestFromClaude(project)

  const result = parseAISuggestions(rawText, { projectDeadline: project.deadline })
  if (!result.ok) throw new Error(result.error)
  return result.activities
}
