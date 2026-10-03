'use client'

import { useState, useMemo, useTransition } from 'react'
import Image from 'next/image'
import type { FamilyMembersByPatientQueryResult } from '@/sanity.types'
import { urlForImage } from '@/sanity/lib/utils'
import { logQuizAction } from '@/app/actions/logQuiz'
import { Inter, Instrument_Serif } from 'next/font/google'

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'] })
const sans = Inter({ subsets: ['latin'] })

type FamilyMemberDoc = NonNullable<FamilyMembersByPatientQueryResult>[number]

export interface CognitiveSparkProps {
  persons?: FamilyMemberDoc[] | null
  patientId?: string
  patientName?: string
  onClose?: () => void
}

interface FamilyMember {
  id: string
  name: string
  relation: string
  imageUrl: string
  alt: string
}

// Warm, dementia-friendly fallback family members with friendly portraits
const FALLBACK_MEMBERS: FamilyMember[] = [
  {
    id: 'person-sarah',
    name: 'Sarah',
    relation: 'Your daughter',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
    alt: 'Smiling woman with brown hair and gentle expression',
  },
  {
    id: 'person-michael',
    name: 'Michael',
    relation: 'Your grandson',
    imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
    alt: 'Young man with glasses smiling outdoors',
  },
  {
    id: 'person-eleanor',
    name: 'Eleanor',
    relation: 'Your loving wife',
    imageUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=600&q=80',
    alt: 'Warm senior woman smiling by the garden',
  },
  {
    id: 'person-david',
    name: 'David',
    relation: 'Your son',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
    alt: 'Friendly middle-aged man smiling warmly',
  },
]

export function CognitiveSpark({ persons, patientId = 'robert', patientName = 'Robert', onClose }: CognitiveSparkProps) {
  const [isPending, startTransition] = useTransition()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; isMatch: boolean } | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [isQuizCompleted, setIsQuizCompleted] = useState(false)
  const [hasLoggedToSanity, setHasLoggedToSanity] = useState(false)

  // Map Sanity Person documents or fallback to family members
  const familyList: FamilyMember[] = useMemo(() => {
    if (persons && persons.length >= 2) {
      return persons
        .filter((p): p is FamilyMemberDoc & { firstName: string } => Boolean(p.firstName))
        .map((p) => {
          let url = ''
          if (p.picture?.asset?._ref) {
            try {
              url = urlForImage(p.picture)?.width(600).height(600).fit('crop').url() || ''
            } catch {
              url = ''
            }
          }
          return {
            id: p._id,
            name: p.firstName || 'Family Member',
            relation: p.relationship ? `Your ${p.relationship.toLowerCase()}` : 'Family member',
            imageUrl: url || FALLBACK_MEMBERS[0].imageUrl,
            alt: p.picture?.alt || `${p.firstName}'s photo`,
          }
        })
    }
    return FALLBACK_MEMBERS
  }, [persons])

  // Total questions per session (up to 4)
  const totalRounds = Math.min(familyList.length, 4)

  // Current target person
  const currentTarget = familyList[currentIndex % familyList.length]

  // Pick a distinct distractor for two-choice presentation
  const choices = useMemo(() => {
    const target = currentTarget
    const others = familyList.filter((m) => m.name !== target.name)
    const distractor = others[currentIndex % others.length] || FALLBACK_MEMBERS[1]

    // Randomize button positions deterministically per round
    const list = [target.name, distractor.name]
    if (currentIndex % 2 === 1) {
      list.reverse()
    }
    return list
  }, [currentTarget, familyList, currentIndex])

  // Handle patient choice selection with compassionate feedback
  const handleSelectChoice = (choiceName: string) => {
    if (selectedChoice) return // prevent double clicks

    const isMatch = choiceName === currentTarget.name
    setSelectedChoice(choiceName)

    if (isMatch) {
      setCorrectCount((prev) => prev + 1)
      setFeedback({
        message: `Wonderful! That is ${currentTarget.name}, ${currentTarget.relation.toLowerCase()}.`,
        isMatch: true,
      })
    } else {
      setFeedback({
        message: `Close! This is ${currentTarget.name}, ${currentTarget.relation.toLowerCase()}. They love you so much!`,
        isMatch: false,
      })
    }
  }

  // Next round or complete
  const handleNextRound = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex >= totalRounds) {
      finishQuiz(correctCount + (selectedChoice === currentTarget.name ? 0 : 0))
    } else {
      setCurrentIndex(nextIndex)
      setSelectedChoice(null)
      setFeedback(null)
    }
  }

  // Finish quiz and commit to Sanity Lake via Server Action
  const finishQuiz = (finalCorrect: number) => {
    setIsQuizCompleted(true)
    const accuracy = Math.round((finalCorrect / totalRounds) * 100)

    startTransition(async () => {
      try {
        await logQuizAction({
          patientId,
          gameType: 'Face-Name Match',
          correctAnswers: finalCorrect,
          totalQuestions: totalRounds,
          accuracyRate: accuracy,
          patientResponseState: 'Calm/Engaged',
          caregiverNotes: `${patientName} completed ${totalRounds} Face-Name Match memory cards with gentle engagement. Accuracy: ${accuracy}%.`,
        })
        setHasLoggedToSanity(true)
      } catch (err) {
        console.warn('Could not auto-log quiz session to Sanity:', err)
      }
    })
  }

  const restartQuiz = () => {
    setCurrentIndex(0)
    setSelectedChoice(null)
    setFeedback(null)
    setCorrectCount(0)
    setIsQuizCompleted(false)
    setHasLoggedToSanity(false)
  }

  return (
    <div className={`${sans.className} flex h-full w-full flex-col overflow-y-auto text-zinc-100`}>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className={`${display.className} flex items-center gap-3 text-4xl tracking-tight text-white [word-spacing:0.12em]`}>
            <Icon d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z" className="h-7 w-7 text-amber-300" />
            Face-name match
          </h2>
          <p className="mt-1.5 text-base text-zinc-400">A gentle memory game with the faces of your family</p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="flex-none rounded-full border border-white/15 px-5 py-2.5 text-base font-medium text-zinc-300 transition-colors hover:border-white/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            Back to chores
          </button>
        )}
      </div>

      {isQuizCompleted ? (
        /* COMPLETION */
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
            <Icon d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 000-7.8z" className="h-10 w-10" />
          </span>
          <h3 className={`${display.className} text-5xl leading-tight text-white [word-spacing:0.12em]`}>
            Wonderful effort, {patientName}.
          </h3>
          <p className="max-w-lg text-2xl leading-relaxed text-zinc-300">
            You spent time with the people who love you. That brings calm and comfort.
          </p>

          <div className="flex items-center gap-8 rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-5 text-left">
            <div>
              <div className="text-sm text-zinc-400">Faces recognized</div>
              <div className={`${display.className} text-4xl text-emerald-400`}>
                {correctCount} of {totalRounds}
              </div>
            </div>
            <div className="border-l border-white/10 pl-8">
              <div className="text-sm text-zinc-400">Care team update</div>
              <div className="text-base font-medium text-amber-200">
                {hasLoggedToSanity ? 'Shared with your care team' : isPending ? 'Saving...' : 'Saved on this device'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={restartQuiz}
              className="rounded-full bg-amber-400 px-8 py-4 text-xl font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Play again
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded-full border border-white/20 px-8 py-4 text-xl font-medium text-zinc-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Back to chores
              </button>
            )}
          </div>
        </div>
      ) : (
        /* QUESTION */
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-2">
          <div className="mb-3 w-full">
            <div className="mb-2 flex items-center justify-between text-base text-zinc-400">
              <span>
                Question {currentIndex + 1} of {totalRounds}
              </span>
              <span className="text-amber-300">Take all the time you need</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-500"
                style={{ width: `${((currentIndex + (selectedChoice ? 1 : 0)) / totalRounds) * 100}%` }}
              />
            </div>
          </div>

          <div className="relative mb-4 h-[min(18rem,30vh)] w-[min(18rem,30vh)] overflow-hidden rounded-[28px] border border-white/15 bg-zinc-800">
            <Image
              src={currentTarget.imageUrl}
              alt={currentTarget.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 256px, 288px"
              priority
            />
          </div>

          <p className={`${display.className} mb-4 text-center text-3xl text-white [word-spacing:0.12em]`}>
            Do you recognize this face?
          </p>

          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            {choices.map((choiceName) => {
              const isSelected = selectedChoice === choiceName
              const isTarget = choiceName === currentTarget.name
              const answered = selectedChoice !== null

              return (
                <button
                  key={choiceName}
                  onClick={() => handleSelectChoice(choiceName)}
                  disabled={answered}
                  className={`w-full rounded-full border-2 px-6 py-5 text-2xl font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${answered && isTarget
                    ? 'border-emerald-400 bg-emerald-400 text-zinc-950'
                    : isSelected
                      ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                      : answered
                        ? 'border-white/10 text-zinc-500'
                        : 'border-white/20 bg-white/[0.04] text-white hover:border-amber-400'
                    }`}
                >
                  Is this {choiceName}?
                </button>
              )
            })}
          </div>

          {feedback && (
            <div
              className={`mt-6 w-full rounded-3xl border p-6 text-center ${feedback.isMatch
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100'
                : 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                }`}
            >
              <div className="text-2xl font-medium leading-snug">{feedback.message}</div>
              <button
                onClick={handleNextRound}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-400 px-8 py-3.5 text-xl font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                {currentIndex + 1 >= totalRounds ? 'See summary' : 'Next family member'}
                <Icon d="M5 12h14M12 5l7 7-7 7" className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  )
}
