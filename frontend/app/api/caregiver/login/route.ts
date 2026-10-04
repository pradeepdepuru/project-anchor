import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  passcodeMatches,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/sanity/lib/caregiverAuth'
import { client } from '@/sanity/lib/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { caregiverId, passcode } = (body ?? {}) as {
    caregiverId?: unknown
    passcode?: unknown
  }

  if (!passcodeMatches(passcode)) {
    return NextResponse.json({ error: 'Incorrect passcode.' }, { status: 401 })
  }

  if (typeof caregiverId !== 'string' || !caregiverId) {
    return NextResponse.json({ error: 'caregiverId is required.' }, { status: 400 })
  }

  // Verify the caregiver exists in Sanity
  const caregiver = await client.fetch<{
    _id: string
    firstName?: string
    lastName?: string
  } | null>(
    `*[_type == "person" && _id == $id][0]{ _id, firstName, lastName }`,
    { id: caregiverId },
  )

  if (!caregiver) {
    return NextResponse.json({ error: 'Caregiver not found.' }, { status: 404 })
  }

  const name = [caregiver.firstName, caregiver.lastName].filter(Boolean).join(' ') || caregiverId

  const token = createSessionToken({ id: caregiverId, name })
  if (!token) {
    return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
  }

  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions)

  return NextResponse.json({ ok: true, name })
}

export async function DELETE() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return NextResponse.json({ ok: true })
}
