import {DocumentTextIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

/**
 * Anchor Log — one record per patient interaction with the AI companion.
 * Created server-side by the agent API; never edited manually.
 */
export const anchorLog = defineType({
  name: 'anchorLog',
  title: 'Anchor Log',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: 'patient',
      title: 'Patient',
      type: 'reference',
      to: [{type: 'person'}],
      options: {filter: 'isPatient == true'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'askedAt',
      title: 'Asked At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'question',
      title: 'Question',
      type: 'string',
      description: 'Last user message sent to the agent (max 500 chars).',
      validation: (rule) => rule.max(500),
    }),
    defineField({
      name: 'answer',
      title: 'Answer',
      type: 'text',
      rows: 4,
      description: 'Generated text response from the agent (max 2000 chars).',
      validation: (rule) => rule.max(2000),
    }),
    defineField({
      name: 'queries',
      title: 'GROQ Queries',
      type: 'array',
      description: 'Every GROQ query executed by the groq_query tool during this turn.',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'sourceIds',
      title: 'Source Document IDs',
      type: 'array',
      description: 'Deduplicated Sanity _id values returned from tool queries (max 20).',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'safeMode',
      title: 'Safe Mode',
      type: 'boolean',
      description: 'True when the MCP context gateway was unavailable.',
      initialValue: false,
    }),
    defineField({
      name: 'alertRaised',
      title: 'Alert Raised',
      type: 'boolean',
      description: 'True if the alert_caregiver tool was invoked during this turn.',
      initialValue: false,
    }),
  ],
  orderings: [
    {title: 'Newest first', name: 'askedDesc', by: [{field: 'askedAt', direction: 'desc'}]},
  ],
  preview: {
    select: {
      question: 'question',
      patient: 'patient.firstName',
      askedAt: 'askedAt',
      alertRaised: 'alertRaised',
    },
    prepare({question, patient, askedAt, alertRaised}) {
      const when = askedAt
        ? new Date(askedAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : ''
      const alert = alertRaised ? ' 🚨' : ''
      return {
        title: `${question ? question.slice(0, 60) : '(no question)'}${alert}`,
        subtitle: [patient, when].filter(Boolean).join(' · '),
      }
    },
  },
})
