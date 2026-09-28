import { client } from '@/sanity/lib/client'
import { token as readToken } from '@/sanity/lib/token'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

// Server-only write client
const writeToken = process.env.SANITY_API_WRITE_TOKEN
const writeClient = writeToken
  ? client.withConfig({ token: writeToken, useCdn: false, stega: false, perspective: 'published' })
  : null

const readClient = client.withConfig({
  token: readToken,
  useCdn: false,
  stega: false,
  perspective: 'published',
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

/** Returns the start of the current local day as an ISO string (UTC-equivalent). */
function localMidnightISO(timeZone: string): string {
  const now = new Date()
  // Format year/month/day in the patient's timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '2000'
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  // Midnight in the local timezone expressed as UTC ISO string
  return new Date(`${y}-${mo}-${d}T00:00:00`).toLocaleString('sv-SE', { timeZone }) === ''
    ? `${y}-${mo}-${d}T00:00:00`
    : new Date(
        new Date(`${y}-${mo}-${d}T00:00:00`).toLocaleString('en-US', { timeZone: 'UTC' })
      ).toISOString()
}

/** Compute local midnight as a Date object, then convert to ISO. */
function localMidnightDate(timeZone: string): Date {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '2000'
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  // Build an ISO string for midnight in the given timezone and parse it back to UTC
  const localMidnightStr = `${y}-${mo}-${d}T00:00:00`
  // Use the offset trick: format midnight in that tz and compute the UTC equivalent
  const probe = new Date(localMidnightStr)
  const localFormatted = probe.toLocaleString('en-US', { timeZone, hour12: false })
  const utcFormatted = probe.toLocaleString('en-US', { timeZone: 'UTC', hour12: false })
  const offsetMs = new Date(localFormatted).getTime() - new Date(utcFormatted).getTime()
  return new Date(probe.getTime() - offsetMs)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    const choreId = typeof body?.choreId === 'string' ? body.choreId : ''
    const patientId = typeof body?.patientId === 'string' ? body.patientId : ''

    if (!ID_PATTERN.test(choreId) || !ID_PATTERN.test(patientId)) {
      return Response.json({ error: 'Invalid choreId or patientId' }, { status: 400 })
    }

    if (!writeClient) {
      console.error('SANITY_API_WRITE_TOKEN not set; cannot write completion')
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Fetch chore — verify it belongs to this patient
    const chore = await readClient.fetch<{
      _id: string
      patient: { _ref: string }
      priority?: string
      safetyParameters?: { requiresSupervision?: boolean; priority?: string }
    } | null>(
      `*[_type == "dailyChore" && _id == $choreId][0]{
        _id,
        patient,
        priority,
        safetyParameters
      }`,
      { choreId },
    )

    if (!chore || chore.patient?._ref !== patientId) {
      return Response.json({ error: 'Chore not found' }, { status: 404 })
    }

    const timeZone = safeTimeZone(body?.timeZone)
    const midnight = localMidnightDate(timeZone)
    const midnightISO = midnight.toISOString()

    // Idempotency: check if a completion record already exists since local midnight
    const existing = await readClient.fetch<Array<{
      _key: string
      completedAt: string
      status: string
      notes: string
    }>>(
      `*[_type == "dailyChore" && _id == $choreId][0].completions[
        dateTime(completedAt) >= dateTime($since) &&
        notes == "Marked on kiosk"
      ]`,
      { choreId, since: midnightISO },
    )

    if (existing && existing.length > 0) {
      return Response.json({ idempotent: true, completion: existing[0] }, { status: 200 })
    }

    // Determine status
    const requiresSupervision = chore.safetyParameters?.requiresSupervision === true
    const priority = chore.safetyParameters?.priority ?? chore.priority
    const status =
      requiresSupervision || priority === 'critical' ? 'reported' : 'completed'

    const now = new Date().toISOString()
    const _key = randomUUID().replace(/-/g, '').slice(0, 16)

    const newRecord = {
      _key,
      completedAt: now,
      status,
      notes: 'Marked on kiosk',
    }

    await writeClient
      .patch(choreId)
      .setIfMissing({ completions: [] })
      .append('completions', [newRecord])
      .commit()

    return Response.json({ idempotent: false, completion: newRecord }, { status: 200 })
  } catch (error) {
    console.error('Chore complete endpoint error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
