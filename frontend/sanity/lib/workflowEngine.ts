import { createEngine, ENGINE_API_VERSION, refDataset } from '@sanity/workflow-engine'
import { client } from '@/sanity/lib/client'

/**
 * Server-only. The engine writes workflow instances to the same dataset as the content,
 * using the write token. Never import this from a client component.
 */
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID as string
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET as string

export function getWorkflowEngine() {
  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!token || !projectId || !dataset) return null

  const workflowClient = client.withConfig({
    token,
    apiVersion: ENGINE_API_VERSION,
    useCdn: false,
    stega: false,
    perspective: 'raw',
  })

  return createEngine({
    // The Sanity client types can differ slightly between packages; the engine only needs the client API.
    client: workflowClient as unknown as Parameters<typeof createEngine>[0]['client'],
    workflowResource: { type: 'dataset', id: `${projectId}.${dataset}` },
    tag: 'prod', // must match the tag in studio/sanity.workflow.ts
  })
}

/** Global document reference to a published careAlert, used as the workflow's subject. */
export const alertSubject = (alertId: string) =>
  refDataset({ projectId, dataset, documentId: alertId, type: 'careAlert' })
