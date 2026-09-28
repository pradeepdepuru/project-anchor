import {PackageIcon} from '@sanity/icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

/**
 * Medication Order — the "errata vs. rulebook" of the care record.
 * A new order can supersede an older one. The current order is the one that is
 * effective and that no newer effective order supersedes.
 * Anchor reads these instructions; it never computes or changes a dose.
 */
export const medicationOrder = defineType({
  name: 'medicationOrder',
  title: 'Medication Order',
  type: 'document',
  icon: PackageIcon,
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
      name: 'name',
      title: 'Medication',
      type: 'string',
      description: 'e.g. "Morning blood pressure medication"',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'dosage',
      title: 'Dosage (as prescribed)',
      type: 'string',
      description: 'Copy exactly from the prescription, e.g. "1 small red tablet". Text only.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'steps',
      title: 'Step-by-step instructions',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      description: 'One short step per line. Anchor reads these in order, exactly as written.',
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'effectiveFrom',
      title: 'Effective from',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'supersedes',
      title: 'Supersedes (older order)',
      type: 'reference',
      to: [{type: 'medicationOrder'}],
      description: 'Set this when this order replaces an earlier one. The older order stops being current.',
      validation: (rule) =>
        rule.custom((value, context) => {
          const ownId = context.document?._id?.replace(/^drafts\./, '')
          if (value?._ref && value._ref === ownId) return 'An order cannot supersede itself'
          return true
        }),
    }),
    defineField({
      name: 'changeNote',
      title: 'Reason for change',
      type: 'string',
      description: 'e.g. "Dose reduced after cardiology visit".',
    }),
    defineField({
      name: 'prescribedBy',
      title: 'Prescribed by',
      type: 'string',
    }),
  ],
  orderings: [
    {
      title: 'Effective date, newest first',
      name: 'effectiveDesc',
      by: [{field: 'effectiveFrom', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      name: 'name',
      patient: 'patient.firstName',
      effectiveFrom: 'effectiveFrom',
      replaces: 'supersedes.name',
    },
    prepare({name, patient, effectiveFrom, replaces}) {
      const date = effectiveFrom
        ? new Date(effectiveFrom).toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'})
        : 'No date'
      return {
        title: `${name || 'Medication'}${patient ? ` (${patient})` : ''}`,
        subtitle: `From ${date}${replaces ? ` · replaces "${replaces}"` : ''}`,
      }
    },
  },
})
