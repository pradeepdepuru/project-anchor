import {SparklesIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

/**
 * Cognitive Log Schema for Project Anchor (Dementia Care App)
 * Logs interactive memory quizzes, scores, accuracy, and emotional engagement states.
 */
export const cognitiveLog = defineType({
  name: 'cognitiveLog',
  title: 'Cognitive Log',
  icon: SparklesIcon,
  type: 'document',
  fields: [
    defineField({
      name: 'patient',
      title: 'Patient',
      type: 'reference',
      to: [{type: 'person'}],
      description: 'The patient participating in the cognitive micro-game.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'quizDate',
      title: 'Quiz Date & Time',
      type: 'datetime',
      description: 'Timestamp when the micro-game was played.',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'gameType',
      title: 'Game Type',
      type: 'string',
      description: 'The cognitive micro-game mode.',
      options: {
        list: [
          {title: 'Face-Name Match', value: 'Face-Name Match'},
          {title: 'Trivia Anchor', value: 'Trivia Anchor'},
          {title: 'Music & Memory', value: 'Music & Memory'},
          {title: 'Pattern Recall', value: 'Pattern Recall'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'score',
      title: 'Score',
      type: 'object',
      description: 'Raw questions answered correctly out of total questions.',
      fields: [
        defineField({
          name: 'correctAnswers',
          title: 'Correct Answers',
          type: 'number',
          validation: (rule) => rule.required().min(0),
        }),
        defineField({
          name: 'totalQuestions',
          title: 'Total Questions',
          type: 'number',
          validation: (rule) => rule.required().min(1),
        }),
      ],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'accuracyRate',
      title: 'Accuracy Rate (%)',
      type: 'number',
      description: 'Calculated accuracy percentage (0-100%).',
      validation: (rule) => rule.min(0).max(100),
    }),
    defineField({
      name: 'patientResponseState',
      title: 'Patient Response State',
      type: 'string',
      description: 'Emotional/behavioral response observed during play.',
      options: {
        list: [
          {title: 'Calm / Engaged', value: 'Calm/Engaged'},
          {title: 'Frustrated / Anxious', value: 'Frustrated/Anxious'},
          {title: 'Distracted', value: 'Distracted'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'caregiverNotes',
      title: 'Caregiver Notes',
      type: 'text',
      rows: 3,
      description: 'Qualitative observation notes, vocalizations, or cues given during the session.',
    }),
  ],
  preview: {
    select: {
      patientFirstName: 'patient.firstName',
      patientLastName: 'patient.lastName',
      gameType: 'gameType',
      accuracyRate: 'accuracyRate',
      responseState: 'patientResponseState',
      quizDate: 'quizDate',
    },
    prepare({patientFirstName, patientLastName, gameType, accuracyRate, responseState, quizDate}) {
      const patient = patientFirstName ? `${patientFirstName} ${patientLastName || ''}`.trim() : 'Patient'
      const accuracy = typeof accuracyRate === 'number' ? `${accuracyRate}%` : null
      const dateStr = quizDate
        ? new Date(quizDate).toLocaleDateString([], {month: 'short', day: 'numeric'})
        : ''
      const subtitleParts = [accuracy && `Score: ${accuracy}`, responseState, dateStr].filter(Boolean)

      return {
        title: `${patient} — ${gameType || 'Cognitive Quiz'}`,
        subtitle: subtitleParts.join(' • '),
      }
    },
  },
})
