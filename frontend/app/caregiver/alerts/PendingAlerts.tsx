'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export type PendingAlert = {
  _id: string
  type?: string | null
  description?: string | null
  status?: string | null
  raisedAt?: string | null
  patientName?: string | null
  agentBriefing?: string | null
  suggestedResponse?: string | null
  claimedBy?: string | null
}

type Action = 'claim' | 'approve' | 'reject'

const TYPE_LABEL: Record<string, string> = {
  medical_emergency: 'Medical emergency',
  safety_hazard: 'Safety hazard',
  distress: 'Distress',
  missed_medication: 'Missed medication',
  other: 'Other',
}

const ACCENT: Record<string, string> = {
  medical_emergency: 'border-l-red-500',
  safety_hazard: 'border-l-amber-400',
}

async function sendAction(id: string, body: { action: Action; reason?: string }) {
  const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.')
}

const primaryButton =
  'rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50'
const quietButton =
  'rounded-lg border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50'

export default function PendingAlerts({
  alerts,
  caregiverName,
}: {
  alerts: PendingAlert[]
  caregiverName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<{ id: string; action: Action } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  // Alerts and briefings arrive from the server a few seconds after the patient speaks.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh()
    }, 8000)
    return () => clearInterval(timer)
  }, [router])

  async function run(id: string, action: Action) {
    setBusy({ id, action })
    setErrors((prev) => ({ ...prev, [id]: '' }))
    try {
      await sendAction(id, action === 'reject' ? { action, reason } : { action })
      if (action === 'reject') {
        setRejectingId(null)
        setReason('')
      }
      router.refresh()
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [id]: error instanceof Error ? error.message : 'Something went wrong. Try again.',
      }))
    } finally {
      setBusy(null)
    }
  }

  async function signOut() {
    await fetch('/api/caregiver/login', { method: 'DELETE' }).catch(() => null)
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-stone-950 px-5 py-10 text-stone-100">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/kiosk"
          className="mb-6 inline-flex items-center gap-2 text-sm text-stone-400 transition-colors hover:text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200"
        >
          <span aria-hidden>←</span> Back to directory
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Pending alerts</h1>
            <p className="mt-1 text-stone-400">Signed in as {caregiverName}</p>
          </div>
          <button type="button" onClick={signOut} className={quietButton}>
            Sign out
          </button>
        </header>

        {alerts.length === 0 ? (
          <p className="mt-12 text-stone-400">
            Nothing needs review right now. New alerts from Anchor appear here within a few seconds.
          </p>
        ) : (
          <ul className="mt-8 space-y-5">
            {alerts.map((alert) => {
              const type = alert.type ?? 'other'
              const drafting = alert.status === 'open' && !alert.agentBriefing
              const readyToTake = alert.status === 'open' && !!alert.agentBriefing
              const taken = alert.status === 'acknowledged'
              const working = busy?.id === alert._id
              const rewriting = working && busy?.action === 'reject'

              return (
                <li
                  key={alert._id}
                  className={`rounded-xl border border-stone-800 border-l-4 bg-stone-900 p-5 ${ACCENT[type] ?? 'border-l-stone-600'
                    }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className="text-lg font-semibold">
                      {TYPE_LABEL[type] ?? 'Alert'}
                      {alert.patientName ? ` for ${alert.patientName}` : ''}
                    </h2>
                    {alert.raisedAt ? (
                      <time
                        dateTime={alert.raisedAt}
                        suppressHydrationWarning
                        className="text-sm text-stone-400"
                      >
                        {new Date(alert.raisedAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </time>
                    ) : null}
                  </div>

                  <p className="mt-1 text-sm text-stone-400">
                    {drafting
                      ? 'Anchor is writing the briefing'
                      : readyToTake
                        ? 'Waiting for a caregiver'
                        : taken
                          ? `Taken by ${alert.claimedBy ?? 'a caregiver'}`
                          : ''}
                  </p>

                  {drafting ? (
                    <p className="mt-4 text-stone-300">{alert.description}</p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <section>
                        <h3 className="text-sm font-medium text-stone-400">Anchor&apos;s briefing</h3>
                        <p className="mt-1 whitespace-pre-line text-stone-100">{alert.agentBriefing}</p>
                      </section>
                      <section>
                        <h3 className="text-sm font-medium text-stone-400">What Anchor suggests you do</h3>
                        <p className="mt-1 whitespace-pre-line text-stone-100">{alert.suggestedResponse}</p>
                      </section>
                    </div>
                  )}

                  {errors[alert._id] ? (
                    <p role="alert" className="mt-4 text-sm text-red-300">
                      {errors[alert._id]}
                    </p>
                  ) : null}

                  {readyToTake ? (
                    <div className="mt-5">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => run(alert._id, 'claim')}
                        className={primaryButton}
                      >
                        {working ? 'Taking' : 'Take this alert'}
                      </button>
                    </div>
                  ) : null}

                  {taken && rejectingId !== alert._id ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => run(alert._id, 'approve')}
                        className={primaryButton}
                      >
                        {working && busy?.action === 'approve' ? 'Approving' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => {
                          setRejectingId(alert._id)
                          setReason('')
                        }}
                        className={quietButton}
                      >
                        Send back
                      </button>
                    </div>
                  ) : null}

                  {taken && rejectingId === alert._id ? (
                    <div className="mt-5">
                      <label htmlFor={`reason-${alert._id}`} className="block text-sm font-medium text-stone-300">
                        What should Anchor change?
                      </label>
                      <textarea
                        id={`reason-${alert._id}`}
                        rows={3}
                        maxLength={300}
                        value={reason}
                        disabled={working}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                      />
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={working || !reason.trim()}
                          onClick={() => run(alert._id, 'reject')}
                          className={primaryButton}
                        >
                          {rewriting ? 'Anchor is rewriting' : 'Send back with this reason'}
                        </button>
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => setRejectingId(null)}
                          className={quietButton}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
