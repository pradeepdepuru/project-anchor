/**
 * This config is used to configure your Sanity Studio.
 * Learn more: https://www.sanity.io/docs/configuration
 */

import {defineConfig, useCurrentUser} from 'sanity'
import {structureTool} from 'sanity/structure'
import {presentationTool} from 'sanity/presentation'
import {visionTool} from '@sanity/vision'
import {unsplashImageAsset} from 'sanity-plugin-asset-source-unsplash'
import {assist} from '@sanity/assist'
import type {DocumentActionComponent, DocumentActionProps} from 'sanity'

import {schemaTypes} from './src/schemaTypes'
import {structure} from './src/structure'
import {resolve} from './src/presentation'

// Environment variables for project configuration
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 't3retdwe'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

// URL for preview functionality, defaults to localhost:3000/kiosk
const SANITY_STUDIO_PREVIEW_URL =
  process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:3000/kiosk'

// ── verifyCompletion document action ─────────────────────────────────────────
// Visible only when the latest completion record has status === 'reported'.
// On execute: patches that record's status to 'completed', appends a
// verification note, then publishes the document.
const verifyCompletion: DocumentActionComponent = (props: DocumentActionProps) => {
  const currentUser = useCurrentUser()
  const {published, draft} = props

  // Work from the draft if present, otherwise the published snapshot
  const doc = (draft ?? published) as any

  // Find the most-recently-reported completion record
  const completions: any[] = doc?.completions ?? []
  const reportedIndex = completions.reduce<number>(
    (found, record, idx) => (record.status === 'reported' ? idx : found),
    -1,
  )

  const hasReported = reportedIndex !== -1

  // Hide the button entirely when there is nothing to verify
  if (!hasReported) return null

  return {
    label: 'Verify Completion',
    tone: 'positive' as const,
    onHandle: async () => {
      const {patch, publish} = props

      const userName = currentUser?.name ?? 'Unknown user'
      const reportedRecord = completions[reportedIndex]
      const existingNotes: string = reportedRecord?.notes ?? ''
      const verificationNote = ` · Verified in Studio by ${userName}`

      patch([
        {
          set: {
            [`completions[${reportedIndex}].status`]: 'completed',
            [`completions[${reportedIndex}].notes`]: existingNotes + verificationNote,
          },
        },
      ])

      publish()
    },
  }
}

export default defineConfig({
  name: 'default',
  title: process.env.SANITY_STUDIO_TITLE || 'Project Anchor Studio',
  projectId,
  dataset,
  plugins: [
    structureTool({
      structure,
    }),
    presentationTool({
      resolve,
      previewUrl: {
        initial: SANITY_STUDIO_PREVIEW_URL,
        previewMode: {
          enable: '/api/draft-mode/enable',
        },
      },
    }),
    unsplashImageAsset(),
    assist(),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
  document: {
    actions: (prev, context) => {
      // Append verifyCompletion only for dailyChore documents
      if (context.schemaType === 'dailyChore') {
        return [...prev, verifyCompletion]
      }
      return prev
    },
  },
})