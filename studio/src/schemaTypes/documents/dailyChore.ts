import {CalendarIcon} from '@sanity/icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

/**
 * Daily Chore Schema for Project Anchor (Dementia Care App)
 * Tracks timestamped patient tasks, safety parameters, and completion arrays.
 */
export const dailyChore = defineType({
  name: 'dailyChore',
  title: 'Daily Chore',
  icon: CalendarIcon,
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Task Title',
      type: 'string',
      description: 'Clear, concise action name (e.g., Morning Medication, Hydration Check, Lock Patio Door).',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'patient',
      title: 'Patient',
      type: 'reference',
      to: [{type: 'person'}],
      options: {
        filter: 'isPatient == true',
      },
      description: 'The person/patient this chore is assigned to.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'scheduledTime',
      title: 'Scheduled Time',
      type: 'datetime',
      description: 'Timestamp for when this task should be initiated or completed.',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'timeOfDay',
      title: 'Time of Day',
      type: 'string',
      options: {
        list: [
          {title: 'Morning', value: 'morning'},
          {title: 'Afternoon', value: 'afternoon'},
          {title: 'Evening', value: 'evening'},
          {title: 'Bedtime', value: 'bedtime'},
          {title: 'As Needed (PRN)', value: 'as_needed'},
        ],
        layout: 'radio',
      },
      initialValue: 'morning',
    }),
    defineField({
      name: 'instructions',
      title: 'Step-by-Step Instructions',
      type: 'text',
      rows: 3,
      description: 'Simplified cues or steps suitable for patient understanding or caregiver guidance.',
    }),
    defineField({
      name: 'safetyParameters',
      title: 'Safety Parameters',
      type: 'object',
      description: 'Critical patient care safety guardrails and supervision requirements.',
      fields: [
        defineField({
          name: 'requiresSupervision',
          title: 'Requires Supervision',
          type: 'boolean',
          description: 'Flag if this task cannot be safely executed by the patient alone.',
          initialValue: false,
        }),
        defineField({
          name: 'assistanceLevel',
          title: 'Assistance Level',
          type: 'string',
          options: {
            list: [
              {title: 'Independent / Self-managed', value: 'independent'},
              {title: 'Verbal Prompting / Cueing', value: 'verbal_cue'},
              {title: 'Standby / Visual Oversight', value: 'standby'},
              {title: 'Full Physical Assistance', value: 'full_assistance'},
            ],
          },
          initialValue: 'independent',
        }),
        defineField({
          name: 'priority',
          title: 'Priority Level',
          type: 'string',
          options: {
            list: [
              {title: 'Routine', value: 'routine'},
              {title: 'Important', value: 'important'},
              {title: 'Critical Safety / Medical', value: 'critical'},
            ],
            layout: 'radio',
          },
          initialValue: 'routine',
        }),
        defineField({
          name: 'safetyNotes',
          title: 'Safety Notes & Precautions',
          type: 'text',
          rows: 3,
          description: 'Specific hazard warnings (e.g., choking risk, fall precaution, stove shutoff verification).',
        }),
      ],
    }),
    defineField({
      name: 'completions',
      title: 'Completion History',
      type: 'array',
      description: 'Log of completion events, caregiver verifications, and observed outcomes.',
      of: [
        defineArrayMember({
          name: 'completionRecord',
          title: 'Completion Record',
          type: 'object',
          fields: [
            defineField({
              name: 'completedAt',
              title: 'Completed At',
              type: 'datetime',
              initialValue: () => new Date().toISOString(),
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'status',
              title: 'Status',
              type: 'string',
              options: {
                list: [
                  {title: 'Completed', value: 'completed'},
                  {title: 'Partially Completed', value: 'partially_completed'},
                  {title: 'Declined / Refused', value: 'declined'},
                  {title: 'Missed', value: 'missed'},
                  {title: 'Reported by patient, awaiting caregiver', value: 'reported'},
                ],
              },
              initialValue: 'completed',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'recordedBy',
              title: 'Recorded / Supervised By',
              type: 'reference',
              to: [{type: 'person'}],
              description: 'Caregiver or family member who verified this task.',
            }),
            defineField({
              name: 'notes',
              title: 'Observation Notes',
              type: 'string',
              description: 'Any patient behavioral observations, difficulties, or caregiver comments.',
            }),
          ],
          preview: {
            select: {
              completedAt: 'completedAt',
              status: 'status',
              recordedByName: 'recordedBy.firstName',
            },
            prepare({completedAt, status, recordedByName}) {
              const formattedDate = completedAt ? new Date(completedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : 'No time'
              const statusCapitalized = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'
              return {
                title: `${statusCapitalized} (${formattedDate})`,
                subtitle: recordedByName ? `Verified by ${recordedByName}` : 'Self / Unassigned',
              }
            },
          },
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      timeOfDay: 'timeOfDay',
      patientFirstName: 'patient.firstName',
      patientLastName: 'patient.lastName',
      requiresSupervision: 'safetyParameters.requiresSupervision',
    },
    prepare({title, timeOfDay, patientFirstName, patientLastName, requiresSupervision}) {
      const patient = patientFirstName ? `${patientFirstName} ${patientLastName || ''}`.trim() : 'Unassigned'
      const supervisionTag = requiresSupervision ? ' · Assisted' : ''
      const timeTag = timeOfDay ? `[${timeOfDay.toUpperCase()}]` : ''
      return {
        title: title || 'Untitled Chore',
        subtitle: `${timeTag} Patient: ${patient}${supervisionTag}`.trim(),
      }
    },
  },
})
