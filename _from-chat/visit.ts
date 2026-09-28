import {UsersIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

/**
 * Visit — who is coming to see a patient, and when.
 * Lets Anchor answer "Who is visiting me today?" with a real join (visit → visitor → memories)
 * and stop mentioning a visitor the moment the visit is cancelled.
 */
export const visit = defineType({
  name: 'visit',
  title: 'Visit',
  type: 'document',
  icon: UsersIcon,
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
      name: 'visitor',
      title: 'Visitor',
      type: 'reference',
      to: [{type: 'person'}],
      options: {filter: 'isPatient != true'},
      description: 'Family member or caregiver who is coming.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'start',
      title: 'Starts',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'end',
      title: 'Ends',
      type: 'datetime',
      validation: (rule) =>
        rule.custom((end, context) => {
          const start = (context.document as {start?: string} | undefined)?.start
          if (end && start && new Date(end) <= new Date(start)) return 'End must be after start'
          return true
        }),
    }),
    defineField({
      name: 'purpose',
      title: 'What Anchor may say about this visit',
      type: 'string',
      description: 'Short and reassuring, e.g. "Bringing your afternoon herbal tea".',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
        layout: 'radio',
      },
      initialValue: 'scheduled',
      validation: (rule) => rule.required(),
    }),
  ],
  orderings: [
    {title: 'Start, soonest first', name: 'startAsc', by: [{field: 'start', direction: 'asc'}]},
  ],
  preview: {
    select: {
      visitor: 'visitor.firstName',
      patient: 'patient.firstName',
      start: 'start',
      status: 'status',
    },
    prepare({visitor, patient, start, status}) {
      const when = start
        ? new Date(start).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'No time set'
      return {
        title: `${visitor || 'Visitor'} → ${patient || 'Patient'}`,
        subtitle: [when, status === 'cancelled' && 'Cancelled'].filter(Boolean).join(' · '),
      }
    },
  },
})
