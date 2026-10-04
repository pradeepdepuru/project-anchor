import { NextResponse } from 'next/server'
import { client } from '@/sanity/lib/client'
import { getWorkflowEngine } from '@/sanity/lib/workflowEngine'
import { redraftBriefing } from '@/sanity/lib/alertBriefing'
import { getSession } from '@/sanity/lib/caregiverAuth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Caregiver actions on an alert: claim, approve, or send back with a reason.
 * Trust model: the browser sends { action, reason? }. Who is acting comes from the signed
 * session cookie, never from the request body, and the alert is read fresh from Sanity.
 */

const writeToken = process.env.SANITY_API_WRITE_TOKEN
const writeClient = writeToken
  ? client.withConfig({ token: writeToken, useCdn: false, stega: false, perspective: 'published' })
  : null

const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/
const ACTIONS = ['claim', 'approve', 'reject'] as const
type Action = (typeof ACTIONS)[number]

type AlertRow = {
  _id: string
  type?: string
  status?: string
  patientId?: string
  agentBriefing?: string
  suggestedResponse?: string
  workflowInstanceId?: string
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return fail('Your session ended. Reload the page and enter the passcode again.', 401)

  // A cross-site form post cannot send JSON, which blocks the simplest forgery.
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return fail('Unsupported request.', 415)
  }

  const { id } = await params
  if (!ID_PATTERN.test(id)) return fail('Unknown alert.', 400)

  const body = await req.json().catch(() => null)
  const action = body?.action as Action
  if (!ACTIONS.includes(action)) return fail('Unknown action.', 400)

  const engine = getWorkflowEngine()
  if (!engine || !writeClient) return fail('The workflow service is not configured.', 503)

  const alert = await writeClient.fetch<AlertRow | null>(
    `*[_type == "careAlert" && _id == $id][0]{
      _id, type, status, "patientId": patient._ref, agentBriefing, suggestedResponse, workflowInstanceId
    }`,
    { id },
  )
  if (!alert?.workflowInstanceId) return fail('This alert is not part of a workflow.', 404)

  const instanceId = alert.workflowInstanceId
  const fire = (activity: string, name: string, actionParams: Record<string, string>) =>
    engine.fireAction({ instanceId, activity, action: name, params: actionParams })

  try {
    if (action === 'claim') {
      if (alert.status !== 'open' || !alert.agentBriefing) {
        return fail('This alert is not ready to be taken, or someone already took it.', 409)
      }
      await fire('review', 'claim', { caregiver: session.name })
      await writeClient
        .patch(id)
        .set({ status: 'acknowledged', acknowledgedBy: { _type: 'reference', _ref: session.id } })
        .commit()
      return NextResponse.json({ ok: true })
    }

    if (action === 'approve') {
      if (alert.status !== 'acknowledged') return fail('Take the alert before approving it.', 409)
      await fire('review', 'approve', { caregiver: session.name })
      await writeClient
        .patch(id)
        .set({ status: 'resolved', resolutionNote: `Approved by ${session.name}` })
        .commit()
      return NextResponse.json({ ok: true })
    }

    // action === 'reject': send back with a reason, Anchor redrafts, the draft returns to review
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
    if (!reason) return fail('Add a reason so Anchor knows what to change.', 400)
    if (alert.status !== 'acknowledged' || !alert.agentBriefing || !alert.suggestedResponse) {
      return fail('Take the alert before sending it back.', 409)
    }

    await fire('review', 'reject', { reason })

    const revised = await redraftBriefing({
      patientId: alert.patientId ?? '',
      alertType: alert.type ?? 'other',
      previous: { briefing: alert.agentBriefing, suggestedResponse: alert.suggestedResponse },
      feedback: reason,
    })

    let resubmitted = false
    for (let attempt = 0; attempt < 2 && !resubmitted; attempt++) {
      try {
        await fire('draft-briefing', 'submit-briefing', revised)
        resubmitted = true
      } catch (error) {
        console.error('submit-briefing after send back failed:', error)
      }
    }

    await writeClient
      .patch(id)
      .set({ agentBriefing: revised.briefing, suggestedResponse: revised.suggestedResponse })
      .commit()

    if (!resubmitted) {
      return fail(
        'Anchor rewrote the briefing and it is saved on the alert, but the workflow did not move it back to review.',
        502,
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`alert ${action} failed:`, error)
    return fail('The workflow did not accept that step. Reload to see the alert as it is now.', 409)
  }
}
