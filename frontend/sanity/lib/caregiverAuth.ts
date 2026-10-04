import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Server-only. A deliberately small stand-in for caregiver sign-in:
 * one shared passcode (CAREGIVER_PASSCODE) unlocks the panel, and a signed httpOnly cookie
 * remembers which caregiver is acting. Never import this from a client component.
 */

export const SESSION_COOKIE = 'anchor_caregiver'
const SESSION_HOURS = 12

export type CaregiverSession = { id: string; name: string }

function signingKey() {
  const passcode = process.env.CAREGIVER_PASSCODE
  if (!passcode) return null
  return createHash('sha256').update(`anchor-caregiver-session:${passcode}`).digest()
}

const sign = (payload: string, key: Buffer) => createHmac('sha256', key).update(payload).digest('base64url')

/** Constant-time comparison, so response timing reveals nothing about the passcode. */
export function passcodeMatches(candidate: unknown): boolean {
  const expected = process.env.CAREGIVER_PASSCODE
  if (!expected || typeof candidate !== 'string') return false
  const a = createHash('sha256').update(candidate).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function createSessionToken(session: CaregiverSession): string | null {
  const key = signingKey()
  if (!key) return null
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000 }),
  ).toString('base64url')
  return `${payload}.${sign(payload, key)}`
}

export function verifySessionToken(token: string | undefined): CaregiverSession | null {
  const key = signingKey()
  if (!key || !token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const given = Buffer.from(signature)
  const expected = Buffer.from(sign(payload, key))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    if (typeof data.id !== 'string' || typeof data.name !== 'string') return null
    return { id: data.id, name: data.name }
  } catch {
    return null
  }
}

/** The signed-in caregiver for this request, or null. */
export async function getSession(): Promise<CaregiverSession | null> {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_HOURS * 60 * 60,
}
