import { createMCPClient } from '@ai-sdk/mcp'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, isStepCount, streamText, tool } from 'ai'
import { z } from 'zod'
import { client } from '@/sanity/lib/client'
import { token as readToken } from '@/sanity/lib/token'
import { buildAnchorSystemPrompt, zonedDayBounds } from '@/sanity/lib/agentPrompt'
import { getWorkflowEngine, alertSubject } from '@/sanity/lib/workflowEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Project Anchor — agent endpoint.
 *
 * Trust model: the browser sends only { patientId, messages, timeZone }.
 * Everything else (name, caregiver, clock, what is true about the patient)
 * is resolved here, on the server, from Sanity.
 */

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

const FALLBACK_REPLY =
  "I'm right here with you. Let's ask your care team about that together. You are safe, and everything is calm."

const MAX_MESSAGES = 20
const MAX_CHARS = 2000
const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

// Read client: published content only, no stega characters leaking into prompts.
const readClient = client.withConfig({
  token: readToken,
  useCdn: false,
  stega: false,
  perspective: 'published',
})

// Write client: server-only, used solely for careAlert documents.
const writeToken = process.env.SANITY_API_WRITE_TOKEN
const writeClient = writeToken
  ? client.withConfig({ token: writeToken, useCdn: false, stega: false, perspective: 'published' })
  : null

const scripted = (text: string) =>
  new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })

function safeTimeZone(candidate: unknown): string {
  const fallback = process.env.ANCHOR_TIMEZONE || 'UTC'
  if (typeof candidate !== 'string') return fallback
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate })
    return candidate
  } catch {
    return fallback
  }
}

/** Only user/assistant turns survive; a client can never inject a system message. */
function normalizeMessages(raw: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(-MAX_MESSAGES).flatMap((m: any) => {
    if (m?.role !== 'user' && m?.role !== 'assistant') return []
    const content =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.parts)
          ? m.parts
            .filter((p: any) => p?.type === 'text')
            .map((p: any) => String(p.text ?? ''))
            .join('')
          : ''
    const trimmed = content.trim().slice(0, MAX_CHARS)
    return trimmed ? [{ role: m.role as 'user' | 'assistant', content: trimmed }] : []
  })
}

// Strip JSON-schema keywords the model provider rejects (kept from the original route).
const stripPropertyNames = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(stripPropertyNames)
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'propertyNames') continue
    out[k] = stripPropertyNames(v)
  }
  return out
}

const cleanTool = (t: any): any => {
  if (!t || typeof t !== 'object') return t
  const cleaned = { ...t }
  for (const key of ['parameters', 'inputSchema'] as const) {
    const schema = cleaned[key]
    if (!schema) continue
    cleaned[key] = schema.jsonSchema
      ? { ...schema, jsonSchema: stripPropertyNames(schema.jsonSchema) }
      : stripPropertyNames(schema)
  }
  return cleaned
}

/** Connects to the Sanity Context MCP. Returns null (never throws) so the caller can fail safe. */
async function connectContextTools() {
  const url = process.env.SANITY_CONTEXT_MCP_URL
  if (!url) {
    console.error('SANITY_CONTEXT_MCP_URL is not set')
    return null
  }
  let mcp: Awaited<ReturnType<typeof createMCPClient>> | undefined
  try {
    mcp = await createMCPClient({
      transport: {
        type: 'http',
        url,
        headers: { Authorization: `Bearer ${readToken}` },
        initialProtocolVersion: '2024-11-05',
      },
      version: '2024-11-05',
      protocolVersionDiscovery: false,
    })
    const raw = await mcp.tools()
    if (!raw.groq_query) throw new Error('groq_query tool not exposed by MCP endpoint')
    const tools = Object.fromEntries(Object.entries(raw).map(([name, t]) => [name, cleanTool(t)]))
    return { mcp, tools }
  } catch (error) {
    console.warn('Sanity Context MCP unavailable:', error)
    try {
      await mcp?.close()
    } catch { }
    return null
  }
}

type RaisedAlert = { alertId: string; alertType: string; description: string }

/** patientId is injected by the server, so the model cannot raise an alert for someone else. */
function makeAlertTool(patientId: string, onRaised?: (a: RaisedAlert) => void) {
  const alertSchema = z.object({
    alertType: z.enum(['medical_emergency', 'safety_hazard', 'distress']),
    description: z.string().max(300).describe('One short, factual sentence about what the patient said.'),
  });

  return tool({
    description:
      'Immediately notify the care team. Use for chest pain or pressure, dizziness, a fall, trouble breathing, leaving the house alone, stove or fire hazards, or intense distress. Never diagnose or treat.',
    parameters: alertSchema,
    execute: async (args: any) => {
      console.log('alert_caregiver raw args:', JSON.stringify(args))

      const allowed = ['medical_emergency', 'safety_hazard', 'distress'] as const
      const alertType = allowed.includes(args?.alertType) ? args.alertType : 'distress'
      const description =
        typeof args?.description === 'string' && args.description.trim()
          ? args.description.slice(0, 300)
          : 'Patient expressed distress; details not captured.'

      if (!writeClient) {
        console.error('SANITY_API_WRITE_TOKEN is not set; cannot create careAlert')
        return { delivered: false, duplicate: false }
      }
      try {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const recent = await writeClient.fetch<number>(
          `count(*[_type == "careAlert" && patient._ref == $patientId && type == $alertType && status == "open" && dateTime(raisedAt) > dateTime($since)])`,
          { patientId, alertType, since },
        )
        if (recent > 0) return { delivered: true, duplicate: true }
        const created = await writeClient.create({
          _type: 'careAlert',
          patient: { _type: 'reference', _ref: patientId },
          type: alertType,
          description,
          status: 'open',
          source: 'anchor',
          raisedAt: new Date().toISOString(),
        })
        onRaised?.({ alertId: created._id, alertType, description })
        return { delivered: true, duplicate: false }
      } catch (error) {
        console.error('Failed to create careAlert:', error)
        return { delivered: false, duplicate: false }
      }
    },
  } as any) // 👈 Added "as any" here to clear the strict framework type issue
}


/**
 * Alert-response workflow: start an instance on the alert, have Anchor draft a caregiver
 * briefing grounded in the patient's memory anchors, and submit it so the instance moves
 * to caregiver review. Never throws: the alert and the chat must work even if this fails.
 */
async function runAlertWorkflow(opts: {
  alert: RaisedAlert
  patientId: string
  patientName: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  modelId?: string
}) {
  const { alert, patientId, patientName, messages, modelId } = opts
  try {
    const engine = getWorkflowEngine()
    if (!engine || !writeClient) return

    const { instance } = await engine.startInstance({
      definition: 'alert-response',
      initialFields: [{ type: 'subject', name: 'subject', value: alertSubject(alert.alertId) }],
    })
    const instanceId = instance._id
    await writeClient.patch(alert.alertId).set({ workflowInstanceId: instanceId }).commit()

    // Grounding: memory anchors stored on the patient and the people linked to them.
    const people = await readClient.fetch<
      { firstName?: string; relationship?: string; memories?: { title?: string; storyText?: string }[] }[]
    >(
      `*[_type == "person" && (_id == $id || patient._ref == $id)]{
        firstName, relationship, "memories": coreMemories[]{ title, storyText }
      }`,
      { id: patientId },
    )
    const anchors = (people ?? [])
      .flatMap((p) =>
        (p.memories ?? []).map(
          (m) => `- ${p.firstName ?? 'Someone'}${p.relationship ? ' (' + p.relationship + ')' : ''}, "${m.title}": ${m.storyText}`,
        ),
      )
      .slice(0, 12)
    const transcript = messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? patientName : 'Anchor'}: ${m.content}`)
      .join('\n')

    let briefing = alert.description
    let suggestedResponse = 'No memory anchors on file for this situation. Please check in with the patient directly.'
    if (modelId && process.env.OPENROUTER_API_KEY) {
      try {
        const { text } = await generateText({
          model: openrouter(modelId),
          system:
            'You write short briefings for a family caregiver after a care companion raised an alert. ' +
            'Use ONLY the conversation and memory anchors provided. Never invent facts, never give medical advice or diagnoses. ' +
            'If no memory anchor fits, say so in suggestedResponse. ' +
            'Reply with JSON only: {"briefing": string, "suggestedResponse": string}. Each value is at most 3 sentences.',
          prompt:
            `Alert type: ${alert.alertType}
Anchor's note: ${alert.description}

` +
            `Recent conversation:
${transcript}

Memory anchors:
${anchors.join('') || '(none)'}`,
        })
        const parsed = JSON.parse(text.replace(/```json| ```/g, '').trim())
        if (typeof parsed.briefing === 'string' && parsed.briefing.trim()) briefing = parsed.briefing.slice(0, 600)
        if (typeof parsed.suggestedResponse === 'string' && parsed.suggestedResponse.trim())
          suggestedResponse = parsed.suggestedResponse.slice(0, 600)
      } catch (draftErr) {
        console.warn('Briefing draft failed, using the alert text:', draftErr)
      }
    }

    await engine.fireAction({
      instanceId,
      activity: 'draft-briefing',
      action: 'submit-briefing',
      params: { briefing, suggestedResponse },
    })
    await writeClient.patch(alert.alertId).set({ agentBriefing: briefing, suggestedResponse }).commit()
  } catch (error) {
    console.error('alert workflow failed (non-fatal):', error)
  }
}


export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    const patientId = typeof body?.patientId === 'string' ? body.patientId : ''
    if (!ID_PATTERN.test(patientId)) {
      return Response.json({ error: 'Invalid patient' }, { status: 400 })
    }
    const messages = normalizeMessages(body?.messages)
    if (messages.length === 0) {
      return Response.json({ error: 'No message provided' }, { status: 400 })
    }

    // Who is this, really? Never trust a name sent by the browser.
    const patient = await readClient.fetch<{
      _id: string
      firstName: string
      caregiverName?: string | null
    } | null>(
      `* [_type == "person" && _id == $id && isPatient == true][0]{
          _id,
          firstName,
          "caregiverName": * [_type == "person" && isPatient != true && patient._ref == ^._id][0].firstName
        }`,
      { id: patientId },
    )
    if (!patient) {
      return Response.json({ error: 'Unknown patient' }, { status: 404 })
    }

    const modelId = process.env.OPENROUTER_MODEL
    if (!modelId || !process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_MODEL / OPENROUTER_API_KEY missing')
      return scripted(FALLBACK_REPLY)
    }

    // Clock is resolved here, in the patient's time zone (the server runs in UTC).
    const timeZone = safeTimeZone(body?.timeZone)
    const now = new Date()
    const { start: dayStart, end: dayEnd } = zonedDayBounds(now, timeZone)
    const localNow = new Intl.DateTimeFormat('en-US', {
      timeZone,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(now)

    // Fail safe: without the records, Anchor may comfort but must not state facts.
    const connected = await connectContextTools()
    const closeMcp = async () => {
      try {
        await connected?.mcp.close()
      } catch { }
    }

    const system = buildAnchorSystemPrompt({
      patientId: patient._id,
      patientName: patient.firstName,
      caregiverName: patient.caregiverName,
      timeZone,
      localNow,
      dayStart,
      dayEnd,
      safeMode: !connected,
    })

    const lastUserMessage = messages.filter((m) => m.role === 'user').at(-1)
    const raised: { current: RaisedAlert | null } = { current: null }

    const result = streamText({
      model: openrouter(modelId),
      system,
      messages,
      abortSignal: req.signal,
      tools: { ...(connected?.tools ?? {}), alert_caregiver: makeAlertTool(patient._id, (a) => { raised.current = a }) },
      stopWhen: isStepCount(3),
      onFinish: async (event) => {
        await closeMcp()

        // Process-as-data: hand a freshly raised alert to the alert-response workflow
        if (raised.current) {
          await runAlertWorkflow({
            alert: raised.current,
            patientId: patient._id,
            patientName: patient.firstName,
            messages,
            modelId,
          })
        }

        // Isolated logging — must never throw to the stream
        try {
          if (!lastUserMessage || !writeClient) return

          // Collect groq_query invocations across all steps
          const queries: string[] = []
          const rawIds: string[] = []
          let alertRaised = false

          for (const step of event.steps ?? []) {
            for (const call of (step.toolCalls ?? []) as any[]) {
              if (call.toolName === 'groq_query' && typeof call.args?.query === 'string') {
                queries.push(call.args.query)
              }
              if (call.toolName === 'alert_caregiver') {
                alertRaised = true
              }
            }
            // Harvest _id strings from groq_query tool results
            for (const result of (step.toolResults ?? []) as any[]) {
              if (result.toolName !== 'groq_query') continue
              const resultData = result.result
              const items: unknown[] = Array.isArray(resultData)
                ? resultData
                : Array.isArray(resultData?.result)
                  ? resultData.result
                  : []
              for (const item of items) {
                if (item && typeof (item as any)._id === 'string') {
                  rawIds.push((item as any)._id)
                }
              }
            }
          }

          // Deduplicate sourceIds, cap at 20
          const sourceIds = [...new Set(rawIds)].slice(0, 20)

          await writeClient.create({
            _type: 'anchorLog',
            patient: { _type: 'reference', _ref: patient._id },
            askedAt: new Date().toISOString(),
            question: lastUserMessage.content.slice(0, 500),
            answer: (event.text ?? '').slice(0, 2000),
            queries,
            sourceIds,
            safeMode: !connected,
            alertRaised,
          })
        } catch (logErr) {
          console.error('anchorLog write failed (non-fatal):', logErr)
        }
      },
      onError: async ({ error }) => {
        console.error('Anchor stream error:', error)
        await closeMcp()
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Agent endpoint error:', error)
    return scripted(FALLBACK_REPLY)
  }
}
