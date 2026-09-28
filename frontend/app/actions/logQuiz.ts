'use server'

import {createClient} from 'next-sanity'
import {apiVersion, dataset, projectId} from '@/sanity/lib/api'

export interface LogQuizInput {
  patientId: string
  gameType?: string
  correctAnswers: number
  totalQuestions: number
  accuracyRate: number
  patientResponseState?: 'Calm/Engaged' | 'Frustrated/Anxious' | 'Distracted'
  caregiverNotes?: string
}

/**
 * Server Action to record Cognitive Spark micro-game session into Sanity Content Lake
 */
export async function logQuizAction(input: LogQuizInput) {
  const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_READ_TOKEN

  if (!token) {
    console.warn('Cannot persist cognitiveLog: Missing SANITY_API_WRITE_TOKEN or SANITY_API_READ_TOKEN')
    return {
      success: false,
      error: 'Sanity authentication token not configured in environment',
    }
  }

  // Instantiate write-capable client directly hitting primary dataset (bypassing CDN)
  const writeClient = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false,
    token,
  })

  try {
    const documentPayload = {
      _type: 'cognitiveLog',
      patient: {
        _type: 'reference',
        _ref: input.patientId,
      },
      quizDate: new Date().toISOString(),
      gameType: input.gameType || 'Face-Name Match',
      score: {
        correctAnswers: input.correctAnswers,
        totalQuestions: input.totalQuestions,
      },
      accuracyRate: input.accuracyRate,
      patientResponseState: input.patientResponseState || 'Calm/Engaged',
      caregiverNotes:
        input.caregiverNotes ||
        `Memory Spark completed via Ambient Patient Kiosk. Accuracy: ${input.accuracyRate}%.`,
    }

    const createdDocument = await writeClient.create(documentPayload)

    return {
      success: true,
      documentId: createdDocument._id,
    }
  } catch (error) {
    console.error('Failed to commit cognitiveLog document to Sanity Content Lake:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
