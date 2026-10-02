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
  const resolvedTheme: 'dark' | 'high-contrast' =
    kioskSettings?.kioskTheme === 'high-contrast' ? 'high-contrast' : 'dark'

  const themeClasses: Record<'dark' | 'high-contrast', string> = {
    dark: 'bg-zinc-950 text-zinc-100',
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
      className={`fixed inset-0 z-40 flex flex-col overflow-hidden font-sans select-none ${rootTheme}`}
    >
      {/* 1. AMBIENT TOP BAR */}
      <header className="flex-none border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md px-6 py-5 lg:px-12 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-block w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-white">
              {greeting}
            </h1>
            <Link
              href="/kiosk"
              className="text-xs font-semibold text-zinc-400 hover:text-amber-300 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 px-3 py-1 rounded-full transition-colors flex items-center gap-1.5 shadow-sm"
              title="Switch Patient Kiosk"
            >
              <span>⇄</span>
              <span>All Patients</span>
            </Link>
          </div>
          <p className="text-base sm:text-lg text-zinc-400 mt-1 font-normal">{welcomeText}</p>

          {/* Care Team strip */}
          {caregivers && caregivers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                👥 Your Care Team:
              </span>
              {caregivers.map((c) => {
                const name = `${c.firstName} ${c.lastName || ''}`.trim()
                const initials = (c.firstName?.[0] || '') + (c.lastName?.[0] || '')
                const role = c.relationshipToPatient || c.relationship || 'Caregiver'
                const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
                let avatarUrl: string | null = null
                if (c.picture?.asset?._ref) {
                  try {
                    avatarUrl =
                      urlForImage(c.picture)?.width(64).height(64).fit('crop').url() || null
                  } catch {
                    avatarUrl = null
                  }
                }
                return (
                  <div
                    key={c._id}
                    className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-700/80 rounded-full pl-1 pr-3 py-1 shadow-sm"
                    title={`${name} · ${roleLabel}`}
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-800 border border-zinc-600 flex-shrink-0 flex items-center justify-center text-xs font-bold text-amber-200">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        initials || '?'
                      )}
                    </div>
                    <div className="leading-none">
                      <div className="text-sm font-semibold text-zinc-200">{name}</div>
                      <div className="text-sm text-zinc-500">{roleLabel}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right side: Memory Spark + Clock (NO weather widget per Requirement 4) */}
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            onClick={() => setIsSparkOpen(!isSparkOpen)}
            className={`flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl font-bold text-sm sm:text-base transition-all active:scale-95 shadow-md ${isSparkOpen
              ? 'bg-amber-500 text-zinc-950 shadow-amber-500/20'
              : 'bg-zinc-900/90 hover:bg-zinc-800 text-amber-300 border border-amber-500/40'
              }`}
          >
            <span className="text-xl">✨</span>
            <span>{isSparkOpen ? 'View Routine' : 'Memory Spark'}</span>
          </button>

          {/* Clock only — no weather widget (Requirement 4) */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl px-5 py-2.5 sm:px-6 sm:py-3 shadow-inner text-right">
            <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-amber-200 tabular-nums">
              {currentTime
                ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '10:00 AM'}
            </div>
            <div className="text-xs sm:text-sm font-medium text-zinc-400 mt-0.5">
              {currentTime
                ? currentTime.toLocaleDateString([], {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })
                : 'Today'}
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN SPLIT INTERFACE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 lg:p-8 overflow-hidden">
        {/* LEFT: Chores or Cognitive Spark */}
        <section
          className={`flex flex-col bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 overflow-hidden ${showChat ? 'lg:col-span-5' : 'lg:col-span-12'
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
              {/* Chore panel header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                    <span>📋</span> Today's Chores
                  </h2>
                  <p className="text-sm lg:text-base text-zinc-400 mt-1">
                    Touch any task to mark it done
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSparkOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
                  >
                    ✨ Quiz
                  </button>
                  {activeChores.length > 0 && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-zinc-800 text-amber-300 border border-zinc-700">
                      {completedChoreIds.size} of {activeChores.length} Done
                    </span>
                  )}
                </div>
              </div>

              {/* Requirement 1: empty state — no fallback chores */}
              {activeChores.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xl sm:text-2xl font-semibold text-zinc-400 text-center">
                    Nothing is scheduled right now.
                  </p>
                </div>
              ) : (
                /* Chore card list */
                <div className="flex-1 overflow-y-auto space-y-4 pr-1.5 focus:outline-none">
                  {activeChores.map((chore) => {
                    const isCompleted = completedChoreIds.has(chore._id)

                    const timeDisplay = chore.scheduledTime
                      ? new Date(chore.scheduledTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      : chore.timeOfDay?.toUpperCase() || 'TODAY'

                    const requiresSupervision = chore.safetyParameters?.requiresSupervision
                    const priority = chore.safetyParameters?.priority ?? null
                    const assistanceLevel = chore.safetyParameters?.assistanceLevel ?? null

                    return (
                      <div
                        key={chore._id}
                        onClick={() => toggleChore(chore._id)}
                        onKeyDown={(e) => handleChoreKeyDown(e, chore._id)}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isCompleted}
                        aria-label={`${chore.title ?? 'Chore'}${isCompleted ? ', completed' : ', not yet completed'}`}
                        className={`w-full text-left p-5 rounded-2xl border-2 transition-all cursor-pointer select-none flex items-start gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isCompleted
                          ? 'bg-emerald-950/20 border-emerald-600/70 text-zinc-300 opacity-90'
                          : 'bg-zinc-900/90 border-zinc-700/80 hover:border-amber-400/80 text-white shadow-lg'
                          }`}
                      >
                        {/* Tactile checkmark */}
                        <div
                          className={`flex-none w-10 h-10 mt-1 rounded-full border-2 flex items-center justify-center transition-colors ${isCompleted
                            ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                            : 'border-zinc-500 bg-zinc-800/60'
                            }`}
                          aria-hidden="true"
                        >
                          {isCompleted ? (
                            <svg
                              className="w-6 h-6 stroke-current stroke-3"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <div className="w-3 h-3 rounded-full bg-transparent" />
                          )}
                        </div>

                        {/* Chore content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            {/* Requirement 3: badges elevated to text-sm */}
                            <span
                              suppressHydrationWarning={true}
                              className="text-sm font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-md bg-zinc-800 text-amber-300 border border-zinc-700/60"
                            >
                              {timeDisplay}
                            </span>

                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Requirement 3: role labels elevated to text-sm */}
                              {requiresSupervision && (
                                <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 flex items-center gap-1">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                                    aria-hidden="true"
                                  />
                                  Assisted
                                </span>
                              )}

                              {assistanceLevel && (
                                <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                                  {assistanceLevel
                                    .replace(/_/g, ' ')
                                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                                </span>
                              )}

                              {priority && priority !== 'routine' && (
                                <span
                                  className={`text-sm font-semibold px-2 py-0.5 rounded-full border ${priority === 'critical'
                                    ? 'bg-red-950/60 border-red-700/50 text-red-300'
                                    : 'bg-amber-950/60 border-amber-700/50 text-amber-300'
                                    }`}
                                >
                                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                                </span>
                              )}
                            </div>
                          </div>

                          <h3
                            className={`text-lg sm:text-xl lg:text-2xl font-bold mt-2 leading-snug ${isCompleted ? 'line-through text-zinc-400' : 'text-zinc-100'
                              }`}
                          >
                            {chore.title}
                          </h3>

                          {chore.instructions && (
                            <p className="text-sm sm:text-base text-zinc-400 mt-1.5 leading-relaxed">
                              {chore.instructions}
                            </p>
                          )}

                          {chore.safetyParameters?.safetyNotes && !isCompleted && (
                            <p className="mt-2 text-sm text-amber-400/80 italic leading-snug">
                              ⚠ {chore.safetyParameters.safetyNotes}
                            </p>
                          )}

                          {isCompleted && (
                            <span className="inline-block mt-2 text-sm font-semibold text-emerald-400">
                              ✓ Completed today
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

        {/* RIGHT: Companion Chat */}
        {showChat && (
          <section className="lg:col-span-7 flex flex-col bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 overflow-hidden">
            {/* Chat header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
              <div className="flex items-center gap-3">
                {/* Requirement 7: MicButton hidden entirely if browser lacks support */}
                <MicButton isListening={isMicListening} onToggle={handleMicToggle} />

                <div>
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                    Anchor Companion
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                    Always here to listen, reassure, and guide you
                  </p>
                </div>
              </div>

              {/* Requirement 6: interactive speaker toggle with aria-pressed */}
              <button
                onClick={handleSpeakerToggle}
                aria-pressed={isSpeakerActive}
                title={isSpeakerActive ? 'Speaker on — tap to mute' : 'Speaker off — tap to enable'}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isSpeakerActive
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
              >
                <span className={`text-lg ${isSpeakerActive ? 'animate-pulse' : ''}`}>
                  {isSpeakerActive ? '🔊' : '🔇'}
                </span>
                <span className="text-sm font-medium">
                  {isSpeakerActive ? 'Speaker On' : 'Speaker Off'}
                </span>
              </button>
            </div>

            {/* Quick prompt chips */}
            <div className="flex flex-wrap gap-2 mb-4">
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
                  className="text-xs sm:text-sm font-medium bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-full px-4 py-2 transition-colors active:scale-95 disabled:opacity-50"
                >
                  &ldquo;{promptText}&rdquo;
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
                  <div className="text-4xl mb-3">⚓</div>
                  <h3 className="text-xl sm:text-2xl font-bold text-zinc-200">
                    {patientDisplayName
                      ? `Hello ${patientDisplayName}, I am Anchor.`
                      : 'Hello, I am Anchor.'}
                  </h3>
                  <p className="text-base sm:text-lg text-zinc-400 max-w-md mt-2 leading-relaxed">
                    You can ask me about your day, your chores, or your family anytime. Touch a
                    suggestion above or type below.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isUser = message.role === 'user'
                  const text = extractMessageText(
                    message as {
                      role: string
                      parts?: { type: string; text?: unknown }[]
                      content?: unknown
                    },
                  )

                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1 px-1">
                        {isUser ? patientDisplayName || 'You' : 'Anchor'}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-3xl p-5 text-xl sm:text-2xl leading-relaxed font-medium shadow-md ${isUser
                          ? 'bg-amber-600/90 text-white rounded-br-none border border-amber-500'
                          : 'bg-zinc-800/95 text-zinc-100 rounded-bl-none border border-zinc-700'
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
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1 px-1">
                    Anchor
                  </span>
                  <div className="bg-zinc-800/90 text-amber-300 rounded-3xl p-4 text-lg font-medium border border-zinc-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    Anchor is thinking calmly...
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input form */}
            <form
              onSubmit={handleFormSubmit}
              className="flex gap-3 pt-2 border-t border-zinc-800/60"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ask Anchor anything..."
                disabled={isStreaming}
                className="flex-1 bg-zinc-950 border-2 border-zinc-700 focus:border-amber-400 rounded-2xl px-5 py-4 text-xl sm:text-2xl text-white placeholder-zinc-500 outline-none transition-colors shadow-inner"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isStreaming}
                className="px-6 sm:px-8 py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xl sm:text-2xl rounded-2xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
              >
                <span>Speak</span>
                <span>➔</span>
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MicButton — feature-detected, hidden entirely if browser lacks support
// Requirement 7: hide button (not just disable) when unsupported
// ---------------------------------------------------------------------------
function MicButton({
  isListening,
  onToggle,
}: {
  isListening: boolean
  onToggle: () => void
}) {
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
      className={`relative w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${isListening
        ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20'
        : 'bg-zinc-800 text-amber-300 border border-zinc-700 hover:border-amber-400'
        }`}
    >
      <span className="text-2xl" aria-hidden="true">
        🎙️
      </span>
      <span
        className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ${isListening ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'
          }`}
        aria-hidden="true"
      />
    </button>
  )
}
