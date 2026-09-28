import { createMCPClient } from '@ai-sdk/mcp'
import { createOpenAI } from '@ai-sdk/openai'
import { isStepCount, streamText, tool } from 'ai'
import { z } from 'zod'
import { client } from '@/sanity/lib/client'
import { token as readToken } from '@/sanity/lib/token'
import { buildAnchorSystemPrompt, zonedDayBounds } from '@/sanity/lib/agentPrompt'

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
    } catch {}
    return null
  }
}

/** patientId is injected by the server, so the model cannot raise an alert for someone else. */
function makeAlertTool(patientId: string) {
  return tool({
    description:
      'Immediately notify the care team. Use for chest pain or pressure, dizziness, a fall, trouble breathing, leaving the house alone, stove or fire hazards, or intense distress. Never diagnose or treat.',
    inputSchema: z.object({
      type: z.enum(['medical_emergency', 'safety_hazard', 'distress']),
      description: z.string().max(300).describe('One short, factual sentence about what the patient said.'),
    }),
    execute: async ({ type, description }) => {
      if (!writeClient) {
        console.error('SANITY_API_WRITE_TOKEN is not set; cannot create careAlert')
        return { delivered: false }
      }
      try {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const recent = await writeClient.fetch<number>(
          `count(*[_type == "careAlert" && patient._ref == $patientId && type == $type && status == "open" && dateTime(raisedAt) > dateTime($since)])`,
          { patientId, type, since },
        )
        if (recent > 0) return { delivered: true, duplicate: true }
        await writeClient.create({
          _type: 'careAlert',
          patient: { _type: 'reference', _ref: patientId },
          type,
          description,
          status: 'open',
          source: 'anchor',
          raisedAt: new Date().toISOString(),
        })
        return { delivered: true }
      } catch (error) {
        console.error('Failed to create careAlert:', error)
        return { delivered: false }
      }
    },
  })
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
      `*[_type == "person" && _id == $id && isPatient == true][0]{
        _id,
        firstName,
        "caregiverName": *[_type == "person" && isPatient != true && patient._ref == ^._id][0].firstName
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
      } catch {}
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

    const result = streamText({
      model: openrouter(modelId),
      system,
      messages,
      abortSignal: req.signal,
      tools: { ...(connected?.tools ?? {}), alert_caregiver: makeAlertTool(patient._id) },
      stopWhen: isStepCount(5),
      onFinish: closeMcp,
      onError: async ({ error }) => {
        console.error('Anchor stream error:', error)
        await closeMcp()
      },
      onAbort: closeMcp, // remove this line if your `ai` version has no onAbort
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Agent endpoint error:', error)
    return scripted(FALLBACK_REPLY)
  }
}
