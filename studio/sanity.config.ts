/**
 * This config is used to configure your Sanity Studio.
 * Learn more: https://www.sanity.io/docs/configuration
 */

import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { presentationTool } from 'sanity/presentation'
import { visionTool } from '@sanity/vision'
import { unsplashImageAsset } from 'sanity-plugin-asset-source-unsplash'
import { assist } from '@sanity/assist'

import { schemaTypes } from './src/schemaTypes'
import { structure } from './src/structure'
import { resolve } from './src/presentation'

// Environment variables for project configuration
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 't3retdwe'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

// URL for preview functionality, defaults to localhost:3000/kiosk
const SANITY_STUDIO_PREVIEW_URL =
  process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:3000/kiosk'

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
})