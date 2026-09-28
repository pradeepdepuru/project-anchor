import {UserIcon} from '@sanity/icons'
import {defineArrayMember, defineField, defineType} from 'sanity'
import type {Person} from '../../../sanity.types'

/**
 * Person schema for Project Anchor.
 * Represents both Patients (with a dedicated Kiosk dashboard) and Family Members/Caregivers.
 * Learn more: https://www.sanity.io/docs/studio/schema-types
 */

export const person = defineType({
  name: 'person',
  title: 'Person / Patient',
  icon: UserIcon,
  type: 'document',
  fields: [
    defineField({
      name: 'isPatient',
      title: 'Is this Person a Patient?',
      type: 'boolean',
      description: 'Turn ON if this person is a care recipient who has their own dedicated Kiosk screen and care plan.',
      initialValue: false,
    }),
    defineField({
      name: 'slug',
      title: 'Kiosk URL Slug',
      type: 'slug',
      description: 'Used for the patient kiosk URL, e.g. /kiosk/robert-chen',
      options: {
        source: (doc: any) => `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
        maxLength: 96,
        slugify: (input: string) =>
          input
            .toLowerCase()
            .replace(/^\/?(kiosk\/)?/, '')
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-'),
      },
      hidden: ({document}) => !document?.isPatient,
    }),
    defineField({
      name: 'firstName',
      title: 'First Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'picture',
      title: 'Picture',
      type: 'image',
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          description: 'Important for SEO and accessibility.',
          validation: (rule) => {
            return rule.custom((alt, context) => {
              const document = context.document as Person
              if (document?.picture?.asset?._ref && !alt) {
                return 'Required'
              }
              return true
            })
          },
        }),
      ],
      options: {
        hotspot: true,
        aiAssist: {
          imageDescriptionField: 'alt',
        },
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'relationship',
      title: 'Relationship to Patient',
      type: 'string',
      description: 'Family relationship or care role (e.g., Daughter, Grandson, Wife, Primary Caregiver).',
      hidden: ({document}) => document?.isPatient === true,
    }),
    defineField({
      name: 'patient',
      title: 'Associated Patient',
      type: 'reference',
      to: [{type: 'person'}],
      options: {
        filter: 'isPatient == true',
      },
      description: 'The patient this family member or caregiver is connected to.',
      hidden: ({document}) => document?.isPatient === true,
    }),
    defineField({
      name: 'phoneNumber',
      title: 'Phone Number',
      type: 'string',
      description: 'Contact number for agent communication and emergency outreach.',
    }),
    defineField({
      name: 'coreMemories',
      title: 'Core Memories & Stories',
      type: 'array',
      description: 'Familiar stories, anchors, and shared moments for comforting conversation and memory prompts.',
      of: [
        defineArrayMember({
          name: 'memory',
          title: 'Memory',
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: 'Memory Title',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'storyText',
              title: 'Story / Prompt Text',
              type: 'text',
              rows: 3,
              description: 'Calming story or details Anchor can use to validate and ground the patient.',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'year',
              title: 'Approximate Year / Era',
              type: 'string',
              description: 'e.g., "1994" or "Summer vacations in Maine"',
            }),
          ],
          preview: {
            select: {
              title: 'title',
              year: 'year',
            },
            prepare({title, year}) {
              return {
                title: title || 'Untitled Story',
                subtitle: year ? `Era: ${year}` : undefined,
              }
            },
          },
        }),
      ],
    }),
  ],
  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      relationship: 'relationship',
      isPatient: 'isPatient',
      picture: 'picture',
    },
    prepare(selection) {
      const subtitle = selection.isPatient
        ? '🌟 Patient'
        : (selection.relationship || 'Family / Caregiver')
      return {
        title: `${selection.firstName || ''} ${selection.lastName || ''}`.trim() || 'Untitled Person',
        subtitle,
        media: selection.picture,
      }
    },
  },
})
