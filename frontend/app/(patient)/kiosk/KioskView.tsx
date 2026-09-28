'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import type { DailyChoresQueryResult, FamilyMembersByPatientQueryResult, ConnectedCaregiversByPatientQueryResult } from '@/sanity.types'
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

// Calming fallbacks if Sanity dataset does not yet contain chore documents
const FALLBACK_CHORES: ChoreItem[] = [
  {
    _id: 'sample-chore-1',
    _type: 'dailyChore',
    title: 'Morning Heart Medication & Water',
    scheduledTime: new Date().toISOString(),
    timeOfDay: 'morning',
    instructions: 'Take 1 blue tablet with a full glass of lukewarm water after breakfast.',
    safetyParameters: {
      requiresSupervision: true,
      assistanceLevel: 'verbal_cue',
      priority: 'critical',
      safetyNotes: 'Ensure caregiver verifies pill bottle before opening.',
    },
    completions: [],
    patient: {
      _id: 'robert',
      firstName: 'Robert',
      lastName: 'Chen',
    },
  },
  {
    _id: 'sample-chore-2',
    _type: 'dailyChore',
    title: 'Gentle Living Room Stretches',
    scheduledTime: new Date(Date.now() + 1000 * 60 * 90).toISOString(),
    timeOfDay: 'morning',
    instructions: 'Sit comfortably in the armchair. Raise both hands slowly 5 times.',
    safetyParameters: {
      requiresSupervision: false,
      assistanceLevel: 'independent',
      priority: 'routine',
      safetyNotes: 'Stay seated in the sturdy armchair to prevent loss of balance.',
    },
    completions: [],
    patient: {
      _id: 'robert',
      firstName: 'Robert',
      lastName: 'Chen',
    },
  },
  {
    _id: 'sample-chore-3',
    _type: 'dailyChore',
    title: 'Hydration Check: Fresh Citrus Water',
    scheduledTime: new Date(Date.now() + 1000 * 60 * 180).toISOString(),
    timeOfDay: 'afternoon',
    instructions: 'Drink the chilled lemon water prepared on the kitchen counter.',
    safetyParameters: {
      requiresSupervision: false,
      assistanceLevel: 'independent',
      priority: 'important',
      safetyNotes: null,
    },
    completions: [],
    patient: {
      _id: 'robert',
      firstName: 'Robert',
      lastName: 'Chen',
    },
  },
  {
    _id: 'sample-chore-4',
    _type: 'dailyChore',
    title: 'Check Front Door Lock',
    scheduledTime: new Date(Date.now() + 1000 * 60 * 360).toISOString(),
    timeOfDay: 'evening',
    instructions: 'Verify the brass latch is turned horizontally on the entrance door.',
    safetyParameters: {
      requiresSupervision: true,
      assistanceLevel: 'standby',
      priority: 'important',
      safetyNotes: 'Caregiver should accompany Robert to the vestibule.',
    },
    completions: [],
    patient: {
      _id: 'robert',
      firstName: 'Robert',
      lastName: 'Chen',
    },
  },
]

export function KioskView({ initialChores, persons, patient, caregivers, kioskSettings }: KioskViewProps) {
  const patientDisplayName = patient?.firstName || 'Robert'

  // Derive settings with sensible defaults
  const showChat = kioskSettings?.showChatCompanion ?? true
  const theme = kioskSettings?.kioskTheme ?? 'dark'
  const welcomeText = kioskSettings?.customWelcomeText ?? 'You are at home • Today is peaceful and all is well'

  // Theme class map applied to the root wrapper
  const themeClasses: Record<string, string> = {
    dark: 'bg-zinc-950 text-zinc-100',
    light: 'bg-zinc-100 text-zinc-900',
    'high-contrast': 'bg-black text-white',
  }
  const rootTheme = themeClasses[theme] ?? themeClasses.dark

  // Ambient Clock & Greeting State
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [completedChoreIds, setCompletedChoreIds] = useState<Set<string>>(new Set())
  const [isMicActive, setIsMicActive] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [isSparkOpen, setIsSparkOpen] = useState(false)

  // Configure Vercel AI SDK chat transport
  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/api/agent',
        body: {
          patientName: patientDisplayName,
          patientId: patient?._id,
        },
      }),
    [patient, patientDisplayName],
  )

  const { messages, sendMessage, status } = useChat({
    transport,
  })

  const isStreaming = status === 'streaming' || status === 'submitted'
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Live timer tick
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Derive active chore list
  const activeChores = useMemo(() => {
    if (initialChores && initialChores.length > 0) {
      return initialChores
    }
    return FALLBACK_CHORES
  }, [initialChores])

  // Greeting based on time of day
  const greeting = useMemo(() => {
    if (!currentTime) return `Good Day, ${patientDisplayName}`
    const hour = currentTime.getHours()
    if (hour < 12) return `Good Morning, ${patientDisplayName}`
    if (hour < 17) return `Good Afternoon, ${patientDisplayName}`
    return `Good Evening, ${patientDisplayName}`
  }, [currentTime, patientDisplayName])

  // Toggle chore status locally
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

  const handleSendPrompt = async (text: string) => {
    if (!text.trim() || isStreaming) return
    setInputVal('')
    await sendMessage({ text })
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || isStreaming) return
    const text = inputVal.trim()
    setInputVal('')
    await sendMessage({ text })
  }

  return (
    <div className={`fixed inset-0 z-40 flex flex-col overflow-hidden font-sans select-none ${rootTheme}`}>
      {/* 1. AMBIENT TOP BAR: TIME, DAY, & REASSURING GREETING */}
      <header className="flex-none border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md px-6 py-5 lg:px-12 flex flex-wrap items-center justify-between gap-4">
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
          <p className="text-base sm:text-lg text-zinc-400 mt-1 font-normal">
            {welcomeText}
          </p>

          {/* Care Team Today strip */}
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
                    avatarUrl = urlForImage(c.picture)?.width(64).height(64).fit('crop').url() || null
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
                      <div className="text-xs font-semibold text-zinc-200">{name}</div>
                      <div className="text-[10px] text-zinc-500">{roleLabel}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Ambient Controls, Memory Spark Launcher & Weather Card */}
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

          <div className="flex items-center gap-4 sm:gap-6 bg-zinc-900/90 border border-zinc-800 rounded-2xl px-5 py-2.5 sm:px-6 sm:py-3 shadow-inner">
            <div className="text-right">
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
            <div className="border-l border-zinc-800 pl-4 text-zinc-300 flex flex-col items-center">
              <span className="text-2xl">🌤️</span>
              <span className="text-xs font-medium text-zinc-400 mt-1">72°F Calm</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. MAIN SPLIT INTERFACE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 lg:p-8 overflow-hidden">
        {/* LEFT COLUMN: LIVE CHORE TIMELINE OR COGNITIVE SPARK PANEL (5 cols, or full-width when chat is hidden) */}
        <section className={`flex flex-col bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 overflow-hidden ${showChat ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
          {isSparkOpen ? (
            <CognitiveSpark
              persons={persons}
              patientId={patient?._id || 'robert'}
              patientName={patientDisplayName}
              onClose={() => setIsSparkOpen(false)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                    <span>📋</span> Today’s Chores
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
                  <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-zinc-800 text-amber-300 border border-zinc-700">
                    {completedChoreIds.size} of {activeChores.length} Done
                  </span>
                </div>
              </div>

              {/* Chore Cards Scroll List */}
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

                  return (
                    <div
                      key={chore._id}
                      onClick={() => toggleChore(chore._id)}
                      role="button"
                      tabIndex={0}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all cursor-pointer select-none flex items-start gap-4 ${isCompleted
                        ? 'bg-emerald-950/20 border-emerald-600/70 text-zinc-300 opacity-90'
                        : 'bg-zinc-900/90 border-zinc-700/80 hover:border-amber-400/80 text-white shadow-lg'
                        }`}
                    >
                      {/* Large tactile checkmark button */}
                      <div
                        className={`flex-none w-10 h-10 mt-1 rounded-full border-2 flex items-center justify-center transition-colors ${isCompleted
                          ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                          : 'border-zinc-500 bg-zinc-800/60'
                          }`}
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

                      {/* Chore Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            suppressHydrationWarning={true}
                            className="text-xs sm:text-sm font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-md bg-zinc-800 text-amber-300 border border-zinc-700/60">
                            {timeDisplay}
                          </span>
                          {requiresSupervision && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Assisted
                            </span>
                          )}
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

                        {isCompleted && (
                          <span className="inline-block mt-2 text-xs font-semibold text-emerald-400">
                            ✓ Completed today
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        {/* RIGHT COLUMN: INTEGRATED COMPANION CHAT EMBED (7 cols) — toggleable via Sanity */}
        {showChat && (
        <section className="lg:col-span-7 flex flex-col bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 overflow-hidden">
          {/* Header with Pulsing Audio Companion Indicator */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
            <div className="flex items-center gap-3">
              <div
                onClick={() => setIsMicActive(!isMicActive)}
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer transition-all ${isMicActive
                  ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20'
                  : 'bg-zinc-800 text-amber-300 border border-zinc-700'
                  }`}
                title="Tap to toggle voice stimulation"
              >
                <span className="text-2xl">🎙️</span>
                <span
                  className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ${isMicActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'
                    }`}
                />
              </div>

              <div>
                <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                  Anchor Companion
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Always here to listen, reassure, and guide you
                </p>
              </div>
            </div>

            {/* Speaker Icon Indicator */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl">
              <span className="text-lg animate-pulse">🔊</span>
              <span className="text-xs font-medium text-zinc-300">High Volume Ready</span>
            </div>
          </div>

          {/* Quick Vocal Accessibility Cues */}
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

          {/* Messages Display (Massive, High-Contrast Typography) */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
                <div className="text-4xl mb-3">⚓</div>
                <h3 className="text-xl sm:text-2xl font-bold text-zinc-200">
                  Hello {patientDisplayName}, I am Anchor.
                </h3>
                <p className="text-base sm:text-lg text-zinc-400 max-w-md mt-2 leading-relaxed">
                  You can ask me about your day, your chores, or your family anytime. Touch a suggestion above or type below.
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user'
                const text = message.parts
                  ? message.parts
                    .filter((part) => part.type === 'text')
                    .map((part) => ('text' in part ? String((part as { text: unknown }).text) : ''))
                    .join('')
                  : 'content' in message
                    ? String((message as { content: unknown }).content)
                    : ''

                return (
                  <div
                    key={message.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1 px-1">
                      {isUser ? patientDisplayName : 'Anchor'}
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

          {/* Input Form with Oversized Accessibility Targets */}
          <form onSubmit={handleFormSubmit} className="flex gap-3 pt-2 border-t border-zinc-800/60">
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
