'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Caregiver = { _id: string; firstName?: string; lastName?: string; relationship?: string }

export default function UnlockForm({ caregivers }: { caregivers: Caregiver[] }) {
  const router = useRouter()
  const [caregiverId, setCaregiverId] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/caregiver/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caregiverId, passcode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Could not sign in. Try again.')
        return
      }
      setPasscode('')
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 px-5 py-16 text-stone-100">
      <div className="mx-auto max-w-md">
        <Link
          href="/kiosk"
          className="mb-6 inline-flex items-center gap-2 text-sm text-stone-400 transition-colors hover:text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200"
        >
          <span aria-hidden>←</span> Back to directory
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Pending alerts</h1>
        <p className="mt-3 text-stone-400">
          Sign in to review what Anchor has flagged for your family.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="caregiver" className="block text-sm font-medium text-stone-300">
              Who is signing in
            </label>
            <select
              id="caregiver"
              required
              value={caregiverId}
              onChange={(e) => setCaregiverId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2.5 text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              <option value="" disabled>
                Choose your name
              </option>
              {caregivers.map((c) => (
                <option key={c._id} value={c._id}>
                  {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                  {c.relationship ? `, ${c.relationship}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="passcode" className="block text-sm font-medium text-stone-300">
              Family passcode
            </label>
            <input
              id="passcode"
              type="password"
              required
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2.5 text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !caregiverId || !passcode}
            className="w-full rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-stone-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
