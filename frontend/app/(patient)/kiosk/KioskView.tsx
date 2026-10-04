'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import type {
  DailyChoresQueryResult,
  FamilyMembersByPatientQueryResult,
  ConnectedCaregiversByPatientQueryResult,
} from '@/sanity.types'
import { urlForImage } from '@/sanity/lib/utils'
import { CognitiveSpark } from './CognitiveSpark'
import { Inter, Instrument_Serif } from 'next/font/google'

// Chore times are stored as exact moments. Show them in the patient's own time zone, in a fixed
// locale, so the server-rendered HTML and the browser agree and every viewer sees the same time.
const PATIENT_TIME_ZONE = process.env.NEXT_PUBLIC_ANCHOR_TIMEZONE || 'America/Phoenix'

function formatChoreTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PATIENT_TIME_ZONE,
  })
}

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'] })
const sans = Inter({ subsets: ['latin'] })

export interface PatientInfo {
  _id: string
  firstName: string
  lastName?: string | null
  slug?: string | null
  picture?: unknown
}

type ChoreItem = NonNullable<DailyChoresQueryResult>[number]

export interface KioskSettings {
  showChatCompanion?: boolean | null
  kioskTheme?: 'dark' | 'light' | 'high-contrast' | null
  customWelcomeText?: string | null
}

interface KioskViewProps {
  initialChores?: ChoreItem[] | null
  persons?: FamilyMembersByPatientQueryResult
  patient?: PatientInfo | null
  caregivers?: ConnectedCaregiversByPatientQueryResult
  kioskSettings?: KioskSettings | null
}

// ---------------------------------------------------------------------------
// SpeechRecognition type shim (browser API, not in all TypeScript lib targets)
// ---------------------------------------------------------------------------
type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEvent = {
  resultIndex: number
  results: {
    [index: number]: {
      isFinal: boolean
      [index: number]: { transcript: string }
    }
    length: number
  }
}

// ---------------------------------------------------------------------------
// Helper: extract text from a Vercel AI SDK message object
// ---------------------------------------------------------------------------
function extractMessageText(message: {
  role: string
  parts?: { type: string; text?: unknown }[]
  content?: unknown
}): string {
  if (message.parts && message.parts.length > 0) {
    return message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (typeof p.text === 'string' ? p.text : String(p.text ?? '')))
      .join('')
  }
  return typeof message.content === 'string'
    ? message.content
    : String(message.content ?? '')
}

// ---------------------------------------------------------------------------
// KioskView
// ---------------------------------------------------------------------------
export function KioskView({
  initialChores,
  persons,
  patient,
  caregivers,
  kioskSettings,
}: KioskViewProps) {
  const patientDisplayName = patient?.firstName ?? ''

  // --- Settings ---
  const showChat = kioskSettings?.showChatCompanion ?? true

  // Requirement 5: strict theme — anything that is not exactly 'high-contrast' falls back to 'dark'
  const resolvedTheme: 'dark' | 'light' | 'high-contrast' =
    kioskSettings?.kioskTheme === 'light' || kioskSettings?.kioskTheme === 'high-contrast'
      ? kioskSettings.kioskTheme
      : 'dark'

  const themeClasses: Record<'dark' | 'light' | 'high-contrast', string> = {
    dark: 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100',
    light: 'bg-stone-50 text-zinc-100',
    'high-contrast': 'bg-black text-white',
  }
  const rootTheme = themeClasses[resolvedTheme]

  const welcomeText =
    kioskSettings?.customWelcomeText ?? 'You are at home • Today is peaceful and all is well'

  // --- Core state ---
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [completedChoreIds, setCompletedChoreIds] = useState<Set<string>>(new Set())
  const [inputVal, setInputVal] = useState('')
  const [isSparkOpen, setIsSparkOpen] = useState(false)

  // --- Speaker (TTS) state ---
  const [isSpeakerActive, setIsSpeakerActive] = useState(false)
  // Track the id of the last assistant message we have already spoken
  const lastSpokenIdRef = useRef<string | null>(null)

  // --- Mic (SpeechRecognition) state ---
  const [isMicListening, setIsMicListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const micSupportedRef = useRef<boolean>(false)

  // --- Vercel AI SDK chat ---
  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/api/agent',
        // Requirement 2: exact body shape
        body: {
          patientId: patient?._id,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patient?._id],
  )

  const { messages, sendMessage, status } = useChat({ transport })
  const isStreaming = status === 'streaming' || status === 'submitted'
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Requirement 6: cancel speech on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Requirement 7: detect SpeechRecognition support once
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR =
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    micSupportedRef.current = typeof SR === 'function'
  }, [])

  // Requirement 6: speak new completed assistant messages when speaker is active
  useEffect(() => {
    if (!isSpeakerActive) return
    if (isStreaming) return // wait until streaming finishes
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const assistantMessages = messages.filter((m) => m.role === 'assistant')
    if (assistantMessages.length === 0) return

    const latest = assistantMessages[assistantMessages.length - 1]
    if (latest.id === lastSpokenIdRef.current) return // already spoken

    const text = extractMessageText(
      latest as { role: string; parts?: { type: string; text?: unknown }[]; content?: unknown },
    )
    if (!text.trim()) return

    // Cancel any ongoing speech before starting new
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    lastSpokenIdRef.current = latest.id
    window.speechSynthesis.speak(utterance)
  }, [messages, isStreaming, isSpeakerActive])

  // Requirement 6: cancel speech immediately when a new message starts (streaming begins)
  useEffect(() => {
    if (isStreaming && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [isStreaming])

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Requirement 1: no FALLBACK_CHORES — use whatever Sanity sends, or empty array
  const activeChores: ChoreItem[] = useMemo(
    () => (initialChores && initialChores.length > 0 ? initialChores : []),
    [initialChores],
  )

  const greeting = useMemo(() => {
    const name = patientDisplayName ? `, ${patientDisplayName}` : ''
    if (!currentTime) return `Good Day${name}`
    const hour = currentTime.getHours()
    if (hour < 12) return `Good Morning${name}`
    if (hour < 17) return `Good Afternoon${name}`
    return `Good Evening${name}`
  }, [currentTime, patientDisplayName])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const toggleChore = (choreId: string) => {
    setCompletedChoreIds((prev) => {
      const next = new Set(prev)
      if (next.has(choreId)) {
        next.delete(choreId)
      } else {
        next.add(choreId)
      }
      return next
    })
  }

  // Requirement 3: onKeyDown handler for chore cards
  const handleChoreKeyDown = (e: React.KeyboardEvent, choreId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleChore(choreId)
    }
  }

  const handleSendPrompt = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return
      setInputVal('')
      await sendMessage({ text })
    },
    [isStreaming, sendMessage],
  )

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || isStreaming) return
    const text = inputVal.trim()
    setInputVal('')
    await sendMessage({ text })
  }

  // Requirement 6: speaker toggle
  const handleSpeakerToggle = () => {
    setIsSpeakerActive((prev) => {
      if (prev) {
        // Turning off — cancel any in-progress speech
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
        }
      }
      return !prev
    })
  }

  // Requirement 7: mic toggle
  const handleMicToggle = useCallback(() => {
    if (!micSupportedRef.current) return

    if (isMicListening) {
      recognitionRef.current?.stop()
      setIsMicListening(false)
      return
    }

    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition

    if (!SR) return

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript
        }
      }
      if (transcript.trim()) {
        // Directly send instead of placing in input
        handleSendPrompt(transcript.trim())
      }
    }

    recognition.onerror = () => {
      setIsMicListening(false)
      recognitionRef.current = null
    }

    recognition.onend = () => {
      setIsMicListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsMicListening(true)
  }, [isMicListening, handleSendPrompt])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      data-kiosk-theme={resolvedTheme}
      className={`${sans.className} fixed inset-0 z-40 flex flex-col overflow-hidden select-none ${rootTheme}`}
    >
      {/* Ambient backdrop: soft amber glow + fine dot grid (matches the directory page) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 40%)',
            maskImage: 'linear-gradient(to bottom, black, transparent 40%)',
          }}
        />
      </div>

      {/* 1. TOP BAR */}
      <header className="relative flex flex-none flex-wrap items-end justify-between gap-x-8 gap-y-5 px-6 pb-5 pt-6 lg:px-12">
        <div className="min-w-0">
          <Link
            href="/kiosk"
            title="Switch patient kiosk"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
          >
            <Icon d="M19 12H5M12 19l-7-7 7-7" className="h-4 w-4" />
            All patients
          </Link>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 flex-none">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <h1 className={`${display.className} [word-spacing:0.12em] text-4xl leading-none tracking-tight text-white sm:text-5xl lg:text-6xl`}>
              {greeting}
            </h1>
          </div>
          <p className="mt-3 text-lg text-zinc-400">{welcomeText}</p>

          {/* Care team */}
          {caregivers && caregivers.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-zinc-500">Your care team</span>
              {caregivers.map((c) => {
                const name = `${c.firstName} ${c.lastName || ''}`.trim()
                const initials = (c.firstName?.[0] || '') + (c.lastName?.[0] || '')
                const role = c.relationshipToPatient || c.relationship || 'Caregiver'
                const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
                let avatarUrl: string | null = null
                if (c.picture?.asset?._ref) {
                  try {
                    avatarUrl = urlForImage(c.picture)?.width(80).height(80).fit('crop').url() || null
                  } catch {
                    avatarUrl = null
                  }
                }
                return (
                  <div
                    key={c._id}
                    title={`${name} · ${roleLabel}`}
                    className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-4"
                  >
                    <div className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-xs font-semibold text-amber-200">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
                      ) : (
                        initials || '?'
                      )}
                    </div>
                    <div className="leading-tight">
                      <div className="text-sm font-medium text-zinc-100">{name}</div>
                      <div className="text-xs text-zinc-400">{roleLabel}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Memory Spark toggle + clock */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => setIsSparkOpen(!isSparkOpen)}
            className={`flex items-center gap-2 rounded-full px-5 py-3 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isSparkOpen
              ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
              : 'border border-amber-400/50 text-amber-200 hover:bg-amber-400/10'
              }`}
          >
            <Icon d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 17l.7 1.8L21.5 19.5l-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z" className="h-5 w-5" />
            {isSparkOpen ? 'View routine' : 'Memory spark'}
          </button>

          <div className="text-right">
            <div className={`${display.className} [word-spacing:0.12em] text-5xl tabular-nums leading-none text-white lg:text-6xl`}>
              {currentTime
                ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '10:00 AM'}
            </div>
            <div className="mt-1.5 text-sm text-zinc-400">
              {currentTime
                ? currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
                : 'Today'}
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN SPLIT INTERFACE */}
      <main className="relative grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden px-6 pb-6 lg:grid-cols-12 lg:px-12 lg:pb-10">
        {/* LEFT: Chores or Cognitive Spark */}
        <section
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900/50 p-6 ${showChat ? 'lg:col-span-5' : 'lg:col-span-12'
            }`}
        >
          {isSparkOpen ? (
            <CognitiveSpark
              persons={persons}
              patientId={patient?._id || ''}
              patientName={patientDisplayName}
              onClose={() => setIsSparkOpen(false)}
            />
          ) : (
            <>
              <div className="mb-5 border-b border-white/10 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className={`${display.className} [word-spacing:0.12em] flex items-center gap-3 text-4xl tracking-tight text-white`}>
                      <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" className="h-7 w-7 text-amber-300" />
                      Today&rsquo;s chores
                    </h2>
                    <p className="mt-1.5 text-base text-zinc-400">Touch any task to mark it done</p>
                  </div>
                  {activeChores.length > 0 && (
                    <span className="flex-none rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm font-medium text-amber-200">
                      {completedChoreIds.size} of {activeChores.length} done
                    </span>
                  )}
                </div>
                {activeChores.length > 0 && (
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                      style={{ width: `${(completedChoreIds.size / activeChores.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {activeChores.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-center text-2xl text-zinc-400">Nothing is scheduled right now.</p>
                </div>
              ) : (
                <div className="flex-1 space-y-4 overflow-y-auto pr-1.5 focus:outline-none">
                  {activeChores.map((chore) => {
                    const isCompleted = completedChoreIds.has(chore._id)
                    const timeDisplay = chore.scheduledTime
                      ? formatChoreTime(chore.scheduledTime)
                      : chore.timeOfDay?.toUpperCase() || 'TODAY'
                    const requiresSupervision = chore.safetyParameters?.requiresSupervision
                    const priority = chore.safetyParameters?.priority ?? null
                    const assistanceLevel = chore.safetyParameters?.assistanceLevel ?? null
                    // Sanity stores instructions as one run-on string; show it as clear steps
                    const steps = chore.instructions
                      ? chore.instructions.split(/(?<=[.!?])\s*(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
                      : []

                    return (
                      <div
                        key={chore._id}
                        onClick={() => toggleChore(chore._id)}
                        onKeyDown={(e) => handleChoreKeyDown(e, chore._id)}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isCompleted}
                        aria-label={`${chore.title ?? 'Chore'}${isCompleted ? ', completed' : ', not yet completed'}`}
                        className={`flex w-full cursor-pointer select-none items-start gap-5 rounded-3xl border p-6 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isCompleted
                          ? 'border-emerald-500/50 bg-emerald-950/20'
                          : 'border-white/10 bg-zinc-900/80 hover:border-amber-400/60'
                          }`}
                      >
                        <div
                          aria-hidden="true"
                          className={`mt-1 flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 transition-colors ${isCompleted ? 'border-emerald-400 bg-emerald-400 text-zinc-950' : 'border-zinc-500'
                            }`}
                        >
                          {isCompleted && <Icon d="M5 13l4 4L19 7" className="h-6 w-6" strokeWidth={3} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span
                              suppressHydrationWarning={true}
                              className="rounded-full bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300"
                            >
                              {timeDisplay}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {requiresSupervision && (
                                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3 py-1 text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                                  Assisted
                                </span>
                              )}
                              {assistanceLevel && (
                                <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-300">
                                  {assistanceLevel.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                </span>
                              )}
                              {priority && priority !== 'routine' && (
                                <span
                                  className={`rounded-full border px-3 py-1 ${priority === 'critical'
                                    ? 'border-red-500/40 bg-red-950/50 text-red-300'
                                    : 'border-amber-500/40 bg-amber-950/50 text-amber-300'
                                    }`}
                                >
                                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                                </span>
                              )}
                            </div>
                          </div>

                          <h3
                            className={`mt-3 text-2xl font-semibold leading-snug ${isCompleted ? 'text-zinc-500 line-through' : 'text-white'
                              }`}
                          >
                            {chore.title}
                          </h3>

                          {steps.length > 1 ? (
                            <ol className="mt-3 space-y-2 text-lg leading-snug text-zinc-300">
                              {steps.map((s, i) => (
                                <li key={i} className="flex gap-3">
                                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-zinc-300">
                                    {i + 1}
                                  </span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            steps[0] && <p className="mt-3 text-lg leading-relaxed text-zinc-300">{steps[0]}</p>
                          )}

                          {chore.safetyParameters?.safetyNotes && !isCompleted && (
                            <div className="mt-4 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-base leading-snug text-amber-200">
                              <Icon d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" className="mt-0.5 h-5 w-5 flex-none" />
                              <span>{chore.safetyParameters.safetyNotes}</span>
                            </div>
                          )}

                          {isCompleted && (
                            <span className="mt-3 inline-block text-base font-medium text-emerald-400">
                              Completed today
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>

        {/* RIGHT: Companion chat */}
        {showChat && (
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900/50 p-6 lg:col-span-7">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-4">
                <MicButton isListening={isMicListening} onToggle={handleMicToggle} />
                <div>
                  <h2 className={`${display.className} [word-spacing:0.12em] text-4xl tracking-tight text-white`}>Anchor companion</h2>
                  <p className="mt-1 text-base text-zinc-400">Always here to listen, reassure, and guide you</p>
                </div>
              </div>

              <button
                onClick={handleSpeakerToggle}
                aria-pressed={isSpeakerActive}
                title={isSpeakerActive ? 'Speaker on — tap to mute' : 'Speaker off — tap to enable'}
                className={`flex flex-none items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isSpeakerActive
                  ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                  : 'border-white/15 text-zinc-400 hover:border-white/30 hover:text-zinc-200'
                  }`}
              >
                <Icon
                  d={
                    isSpeakerActive
                      ? 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14'
                      : 'M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6'
                  }
                  className="h-5 w-5"
                />
                {isSpeakerActive ? 'Speaker on' : 'Speaker off'}
              </button>
            </div>

            {/* Quick prompts */}
            <div className="mb-5 flex flex-wrap gap-2">
              {[
                'What should I do right now?',
                'Who is visiting me today?',
                'Play a memory quiz',
                'Tell me something comforting',
              ].map((promptText) => (
                <button
                  key={promptText}
                  onClick={() => {
                    if (promptText === 'Play a memory quiz') {
                      setIsSparkOpen(true)
                      return
                    }
                    handleSendPrompt(promptText)
                  }}
                  disabled={isStreaming}
                  className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-base text-zinc-200 transition-colors hover:border-amber-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-50"
                >
                  {promptText}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="mb-5 flex-1 space-y-5 overflow-y-auto pr-2">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <Icon d="M12 8a3 3 0 100-6 3 3 0 000 6zM12 8v14M5 12H2a10 10 0 0020 0h-3M8 12h8" className="mb-4 h-12 w-12 text-amber-300/80" strokeWidth={1.5} />
                  <h3 className={`${display.className} [word-spacing:0.12em] text-4xl text-white`}>
                    {patientDisplayName ? `Hello ${patientDisplayName}, I am Anchor.` : 'Hello, I am Anchor.'}
                  </h3>
                  <p className="mt-3 max-w-md text-xl leading-relaxed text-zinc-400">
                    You can ask me about your day, your chores, or your family anytime. Touch a suggestion above or type below.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isUser = message.role === 'user'
                  const text = extractMessageText(
                    message as { role: string; parts?: { type: string; text?: unknown }[]; content?: unknown },
                  )
                  return (
                    <div key={message.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <span className="mb-1.5 px-2 text-sm text-zinc-500">
                        {isUser ? patientDisplayName || 'You' : 'Anchor'}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-3xl px-6 py-4 text-2xl leading-relaxed ${isUser
                          ? 'rounded-br-md bg-amber-500 text-zinc-950'
                          : 'rounded-bl-md border border-white/10 bg-zinc-800/80 text-zinc-100'
                          }`}
                      >
                        {text}
                      </div>
                    </div>
                  )
                })
              )}

              {isStreaming && (
                <div className="flex flex-col items-start">
                  <span className="mb-1.5 px-2 text-sm text-zinc-500">Anchor</span>
                  <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-zinc-800/80 px-6 py-4 text-xl text-amber-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 motion-safe:animate-ping" />
                    Anchor is thinking calmly...
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleFormSubmit} className="flex gap-3 border-t border-white/10 pt-5">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ask Anchor anything..."
                disabled={isStreaming}
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-zinc-800/40 px-7 py-4 text-2xl text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isStreaming}
                className="flex items-center gap-2 rounded-full bg-amber-400 px-8 py-4 text-2xl font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-40"
              >
                Send
                <Icon d="M5 12h14M12 5l7 7-7 7" className="h-6 w-6" />
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icon — tiny inline stroke icon (replaces emoji so every device renders the same)
// ---------------------------------------------------------------------------
function Icon({ d, className, strokeWidth = 2 }: { d: string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// MicButton — feature-detected, hidden entirely if browser lacks support
// Requirement 7: hide button (not just disable) when unsupported
// ---------------------------------------------------------------------------
function MicButton({ isListening, onToggle }: { isListening: boolean; onToggle: () => void }) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setSupported(false)
      return
    }
    const SR =
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    setSupported(typeof SR === 'function')
  }, [])

  // null = not yet determined (SSR), false = unsupported — render nothing in both cases
  if (!supported) return null

  return (
    <button
      onClick={onToggle}
      aria-pressed={isListening}
      aria-label={isListening ? 'Stop listening' : 'Start voice input'}
      title={isListening ? 'Tap to stop listening' : 'Tap to speak'}
      className={`relative flex h-14 w-14 flex-none cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isListening
        ? 'bg-amber-400 text-zinc-950'
        : 'border border-white/15 bg-white/[0.04] text-amber-300 hover:border-amber-400/60'
        }`}
    >
      <Icon d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v3" className="h-6 w-6" />
      {isListening && (
        <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 motion-safe:animate-ping" aria-hidden="true" />
      )}
    </button>
  )
}
