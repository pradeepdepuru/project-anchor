import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { client } from '@/sanity/lib/client'
import { token as readToken } from '@/sanity/lib/token'

/** Server-only helper: Anchor revises a briefing after a caregiver sends it back. */

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

const readClient = client.withConfig({ token: readToken, useCdn: false, stega: false, perspective: 'published' })

export type Briefing = { briefing: string; suggestedResponse: string }

/** Memory anchors stored on the patient and on the people linked to them. */
async function fetchAnchors(patientId: string): Promise<string[]> {
  const people = await readClient.fetch<
    { firstName?: string; relationship?: string; memories?: { title?: string; storyText?: string }[] }[]
  >(
    `*[_type == "person" && (_id == $id || patient._ref == $id)]{
      firstName, relationship, "memories": coreMemories[]{ title, storyText }
    }`,
    { id: patientId },
  )
  return (people ?? [])
    .flatMap((p) =>
      (p.memories ?? []).map(
        (m) => `- ${p.firstName ?? 'Someone'}${p.relationship ? ' (' + p.relationship + ')' : ''}, "${m.title}": ${m.storyText}`,
      ),
    )
    .slice(0, 12)
}

export async function redraftBriefing(opts: {
  patientId: string
  alertType: string
  previous: Briefing
  feedback: string
}): Promise<Briefing> {
  const { patientId, alertType, previous, feedback } = opts
  const modelId = process.env.OPENROUTER_MODEL
  // Without a model, keep the old draft and attach the feedback so nothing is lost.
  const fallback: Briefing = {
    briefing: `${previous.briefing}\n\nCaregiver asked for a revision: ${feedback}`.slice(0, 600),
    suggestedResponse: previous.suggestedResponse,
  }
  if (!modelId || !process.env.OPENROUTER_API_KEY) return fallback

  try {
    const anchors = await fetchAnchors(patientId)
    const { text } = await generateText({
      model: openrouter(modelId),
      maxRetries: 0, // fail fast: the catch below keeps the previous draft plus the caregiver's feedback
      abortSignal: AbortSignal.timeout(15000),
      system:
        'You revise short briefings for a family caregiver after the caregiver sent a draft back. ' +
        'Use ONLY the previous draft, the caregiver feedback and the memory anchors provided. ' +
        'Never invent facts, never give medical advice or diagnoses. ' +
        'For medical_emergency alerts, suggestedResponse must only tell the caregiver to check on the patient and make sure emergency help is called. Do not suggest conversation topics or memories. ' +
        'Reply with JSON only: {"briefing": string, "suggestedResponse": string}. Each value is at most 3 sentences.',
      prompt:
        `Alert type: ${alertType}\n\nPrevious briefing: ${previous.briefing}\n` +
        `Previous suggested response: ${previous.suggestedResponse}\n\n` +
        `Caregiver feedback: ${feedback}\n\nMemory anchors:\n${anchors.join('\n') || '(none)'}`,
    })
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    const briefing = typeof parsed.briefing === 'string' && parsed.briefing.trim() ? parsed.briefing.slice(0, 600) : null
    const suggestedResponse =
      typeof parsed.suggestedResponse === 'string' && parsed.suggestedResponse.trim()
        ? parsed.suggestedResponse.slice(0, 600)
        : null
    return briefing && suggestedResponse ? { briefing, suggestedResponse } : fallback
  } catch (error) {
    console.warn('Briefing redraft failed, keeping the previous draft:', error)
    return fallback
  }
}