import {ControlsIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

/**
 * Kiosk Settings — singleton-style document that controls the ambient patient
 * kiosk UI from Sanity Studio without a code deployment.
 *
 * Designed to be edited via the "Singletons" or "Configuration" section in the
 * studio navigation. Only one document of this type should exist in the dataset.
 */
export const kioskSettings = defineType({
  name: 'kioskSettings',
  title: 'Kiosk Settings',
  type: 'document',
  icon: ControlsIcon,
  fields: [
    defineField({
      name: 'showChatCompanion',
      title: 'Show Chat Companion',
      type: 'boolean',
      description:
        'Toggle the Anchor AI chat companion panel on or off in the kiosk interface.',
      initialValue: true,
    }),
    defineField({
      name: 'kioskTheme',
      title: 'Kiosk Theme',
      type: 'string',
      description: 'Select the visual theme applied to the patient kiosk.',
      options: {
        list: [
          {title: 'Dark (Default)', value: 'dark'},
          {title: 'Light', value: 'light'},
          {title: 'High Contrast', value: 'high-contrast'},
        ],
        layout: 'radio',
      },
      initialValue: 'dark',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'customWelcomeText',
      title: 'Custom Welcome Text',
      type: 'string',
      description:
        'Optional greeting override shown below the patient name. Leave blank to use the default ambient message.',
      placeholder: 'e.g. "Today is a good day. You are safe at home."',
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Kiosk Settings',
      }
    },
  },
})
