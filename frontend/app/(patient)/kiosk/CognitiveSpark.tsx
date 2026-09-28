'use client'

import {useState, useMemo, useTransition} from 'react'
import Image from 'next/image'
import type {FamilyMembersByPatientQueryResult} from '@/sanity.types'
import {urlForImage} from '@/sanity/lib/utils'
import {logQuizAction} from '@/app/actions/logQuiz'

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

export function CognitiveSpark({persons, patientId = 'robert', patientName = 'Robert', onClose}: CognitiveSparkProps) {
  const [isPending, startTransition] = useTransition()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{message: string; isMatch: boolean} | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [isQuizCompleted, setIsQuizCompleted] = useState(false)
  const [hasLoggedToSanity, setHasLoggedToSanity] = useState(false)

  // Map Sanity Person documents or fallback to family members
  const familyList: FamilyMember[] = useMemo(() => {
    if (persons && persons.length >= 2) {
      return persons
        .filter((p): p is FamilyMemberDoc & {firstName: string} => Boolean(p.firstName))
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
    <div className="relative w-full h-full flex flex-col bg-zinc-900/95 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 text-zinc-100 shadow-2xl overflow-y-auto">
      {/* Header with Title and Close Button */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-xl font-bold">
            ✨
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Face-Name Match
            </h2>
            <p className="text-sm sm:text-base text-zinc-400">
              Gentle memory spark • Familiar faces of your family
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-semibold transition-colors border border-zinc-700"
          >
            Back to Chores ✕
          </button>
        )}
      </div>

      {/* QUIZ COMPLETION SCREEN */}
      {isQuizCompleted ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 sm:p-12 space-y-6">
          <div className="text-6xl animate-bounce">🌟</div>
          <h3 className="text-3xl sm:text-4xl font-black text-amber-300 tracking-tight">
            Heartwarming Effort, {patientName}!
          </h3>
          <p className="text-xl sm:text-2xl text-zinc-200 max-w-lg leading-relaxed">
            You recognized your family members today. Remembering the people who love you brings calm and comfort to your heart.
          </p>

          <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl px-8 py-5 flex items-center gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-400">Memory Score</div>
              <div className="text-3xl font-extrabold text-emerald-400">
                {correctCount} of {totalRounds} Recognized
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6 text-left">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Sanity Lake Status</div>
              <div className="text-sm font-medium text-amber-200">
                {hasLoggedToSanity ? '✓ Logged to Care Team' : isPending ? 'Saving...' : 'Recorded locally'}
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={restartQuiz}
              className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xl font-bold rounded-2xl shadow-lg transition-transform active:scale-95"
            >
              Play Again ↺
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xl font-bold rounded-2xl border border-zinc-700 transition-colors"
              >
                Return to Dashboard
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ACTIVE QUESTION SCREEN */
        <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
          {/* Progress Indicator */}
          <div className="w-full flex items-center justify-between text-sm font-semibold text-zinc-400 mb-4">
            <span>Question {currentIndex + 1} of {totalRounds}</span>
            <span className="text-amber-300">Take all the time you need</span>
          </div>

          {/* Photo Portrait Card */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl bg-zinc-800 mb-6">
            <Image
              src={currentTarget.imageUrl}
              alt={currentTarget.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 256px, 288px"
              priority
            />
          </div>

          <p className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">
            Do you recognize this familiar face?
          </p>

          {/* Large High-Contrast Choice Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            {choices.map((choiceName) => {
              const isSelected = selectedChoice === choiceName
              const isTarget = choiceName === currentTarget.name

              return (
                <button
                  key={choiceName}
                  onClick={() => handleSelectChoice(choiceName)}
                  disabled={selectedChoice !== null}
                  className={`w-full py-5 px-6 rounded-2xl text-2xl font-extrabold tracking-wide transition-all shadow-md active:scale-95 text-center ${
                    isSelected
                      ? isTarget
                        ? 'bg-emerald-500 text-zinc-950 border-2 border-emerald-400 scale-[1.02]'
                        : 'bg-amber-600 text-white border-2 border-amber-400'
                      : 'bg-zinc-800 hover:bg-zinc-750 text-white border-2 border-zinc-700 hover:border-amber-400'
                  }`}
                >
                  Is this {choiceName}?
                </button>
              )
            })}
          </div>

          {/* Immediate Warm, Reassuring Feedback Banner */}
          {feedback && (
            <div
              className={`mt-6 w-full p-5 rounded-2xl border-2 text-center transition-all animate-fadeIn ${
                feedback.isMatch
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                  : 'bg-amber-950/80 border-amber-500 text-amber-200'
              }`}
            >
              <div className="text-xl sm:text-2xl font-bold leading-snug">
                {feedback.message}
              </div>

              <button
                onClick={handleNextRound}
                className="mt-4 px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-950 text-lg font-bold rounded-xl shadow-md transition-transform active:scale-95"
              >
                {currentIndex + 1 >= totalRounds ? 'See Summary ➔' : 'Next Family Member ➔'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
