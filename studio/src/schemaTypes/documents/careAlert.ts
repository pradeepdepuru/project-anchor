import {BellIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

/**
 * Care Alert — created when Anchor (or the kiosk) needs a human.
 * Workflow: open → acknowledged → resolved. Caregivers move it forward in Studio.
 */
export const careAlert = defineType({
  name: 'careAlert',
  title: 'Care Alert',
  type: 'document',
  icon: BellIcon,
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
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          {title: 'Medical emergency', value: 'medical_emergency'},
          {title: 'Safety hazard', value: 'safety_hazard'},
          {title: 'Distress', value: 'distress'},
          {title: 'Missed medication', value: 'missed_medication'},
          {title: 'Other', value: 'other'},
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'What happened',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Open', value: 'open'},
          {title: 'Acknowledged', value: 'acknowledged'},
          {title: 'Resolved', value: 'resolved'},
        ],
        layout: 'radio',
      },
      initialValue: 'open',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'raisedAt',
      title: 'Raised at',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'source',
      title: 'Raised by',
      type: 'string',
      options: {
        list: [
          {title: 'Anchor (AI companion)', value: 'anchor'},
          {title: 'Kiosk', value: 'kiosk'},
          {title: 'Caregiver', value: 'caregiver'},
        ],
      },
      initialValue: 'anchor',
    }),
    defineField({
      name: 'acknowledgedBy',
      title: 'Acknowledged by',
      type: 'reference',
      to: [{type: 'person'}],
      options: {filter: 'isPatient != true'},
    }),
    defineField({
      name: 'resolutionNote',
      title: 'Resolution note',
      type: 'text',
      rows: 2,
    }),
  ],
  orderings: [
    {title: 'Newest first', name: 'raisedDesc', by: [{field: 'raisedAt', direction: 'desc'}]},
  ],
  preview: {
    select: {type: 'type', patient: 'patient.firstName', status: 'status', raisedAt: 'raisedAt'},
    prepare({type, patient, status, raisedAt}) {
      const label = (type || 'alert').replace(/_/g, ' ')
      const when = raisedAt
        ? new Date(raisedAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : ''
      return {
        title: `${label.charAt(0).toUpperCase() + label.slice(1)}${patient ? ` — ${patient}` : ''}`,
        subtitle: [status, when].filter(Boolean).join(' · '),
      }
    },
  },
})
